import React, { useEffect, useMemo, useRef, useState } from 'react';
import fs from 'node:fs';
import path from 'node:path';
import { Box, Text, useApp, useInput, useStdout } from 'ink';
import { Controller } from '../controller.js';
import { startSessionServer } from '../server.js';
import { executeInput, type ViewName, type UIActions } from '../commands.js';
import { PROVIDER_PRESETS, getProvider, rememberFolder, saveConfig } from '../config.js';
import { fmtCost } from '../pricing.js';
import { LANGS, setLang, t } from '../i18n.js';
import type { Lang, ParallelConfig, ProviderConfig, SessionData } from '../types.js';
import { AgentPanel } from './AgentPanel.js';
import { ApprovalPrompt } from './ApprovalPrompt.js';
import { QuestionPrompt } from './QuestionPrompt.js';
import { CommandInput } from './CommandInput.js';
import { SettingsPanel } from './SettingsPanel.js';
import { BoardView, CostView, DiffView, HelpView, NotesView, SessionsView, SkillsView, SpecialistsView } from './views.js';
import { SelectList, WizardStep, type SelectItem } from './Wizard.js';

const LOGO = '⚡ P A R A L L E L';

type Phase = 'lang' | 'folder' | 'session' | 'provider' | 'model' | 'main';
type ProviderStep =
  | { id: 'pick' }
  | { id: 'key'; preset: ProviderConfig }
  | { id: 'name' }
  | { id: 'url'; name: string }
  | { id: 'model'; name: string; url: string }
  | { id: 'newKey'; name: string; url: string; model: string };

interface SessionChoice {
  file: string;
  data: SessionData;
}

function usableProvider(config: ParallelConfig): ProviderConfig | undefined {
  const p = getProvider(config);
  return p && p.apiKey && (p.defaultModel || p.models[0]) ? p : undefined;
}

function normalizeFolder(p: string): string {
  return path.resolve(p.replace(/^~(?=$|\/)/, process.env.HOME ?? '~'));
}

function validFolder(p: string): string | null {
  const abs = normalizeFolder(p);
  try {
    return fs.existsSync(abs) && fs.statSync(abs).isDirectory() ? abs : null;
  } catch {
    return null;
  }
}

function startupFolder(config: ParallelConfig, initialFolder?: string): string | null {
  if (initialFolder) return validFolder(initialFolder);
  for (const recent of config.recentFolders ?? []) {
    const found = validFolder(recent);
    if (found) return found;
  }
  return validFolder(process.cwd());
}

export function App({ config, initialFolder }: { config: ParallelConfig; initialFolder?: string }) {
  const { exit } = useApp();
  const initialUsableProvider = usableProvider(config);
  const directFolder = config.language && initialUsableProvider ? startupFolder(config, initialFolder) : null;

  // ---------- wizard state ----------
  const [phase, setPhase] = useState<Phase>(directFolder ? 'main' : config.language ? 'folder' : 'lang');
  const [folder, setFolder] = useState<string>(directFolder ?? '');
  const [wizardError, setWizardError] = useState('');
  const [sessions, setSessions] = useState<SessionChoice[]>([]);
  const [providerStep, setProviderStep] = useState<ProviderStep>({ id: 'pick' });
  const [modelCustom, setModelCustom] = useState(false);
  const ctlRef = useRef<Controller | null>(directFolder ? new Controller(config, directFolder) : null);

  // ---------- main state ----------
  const [, setTick] = useState(0);
  const [view, setView] = useState<ViewName>('agents');
  // Focus mode (/focus <agent>): plain input is routed to that agent.
  const [focus, setFocus] = useState<string | null>(null);
  const [systemLines, setSystemLines] = useState<string[]>(
    directFolder ? [t('main.ready1', { folder: directFolder }), t('main.ready2')] : [],
  );
  const [inputReady, setInputReady] = useState(Boolean(directFolder));

  const ctl = ctlRef.current;

  // Re-render (throttled) on every blackboard/controller update.
  useEffect(() => {
    if (!ctl) return;
    let pending = false;
    const onUpdate = () => {
      if (pending) return;
      pending = true;
      setTimeout(() => {
        pending = false;
        setTick((x) => x + 1);
      }, 80);
    };
    ctl.on('update', onUpdate);
    const timer = setInterval(onUpdate, 1000); // refresh elapsed timers
    return () => {
      ctl.off('update', onUpdate);
      clearInterval(timer);
    };
  }, [ctl]);

  // Session server: lets `parallel attach <agent>` open per-agent terminals.
  useEffect(() => {
    if (!ctl) return;
    const stop = startSessionServer(ctl);
    ctl.attachEnabled = Boolean(stop);
    return () => {
      ctl.attachEnabled = false;
      stop?.();
    };
  }, [ctl]);

  const ui: UIActions = useMemo(
    () => ({
      setView,
      system: (line: string) => setSystemLines((ls) => [...ls.slice(-5), line]),
      exit: () => {
        setTimeout(() => exit(), 50);
      },
      setFocus,
    }),
    [exit],
  );

  // ---------- wizard transitions ----------

  // In normal launches, a complete config goes straight to the main TUI.
  // This effect only supports partially-configured installs with a folder arg.
  useEffect(() => {
    if (config.language && initialFolder && phase === 'folder' && !ctlRef.current) {
      chooseFolder(initialFolder);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (directFolder) rememberFolder(config, directFolder);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const chooseLang = (code: string) => {
    setLang(code as Lang);
    config.language = code as Lang;
    saveConfig(config);
    if (initialFolder) chooseFolder(initialFolder);
    else setPhase('folder');
  };

  const chooseFolder = (p: string) => {
    const abs = validFolder(p);
    if (!abs) {
      setWizardError(t('wiz.folder.notFound', { path: normalizeFolder(p) }));
      return;
    }
    setWizardError('');
    setFolder(abs);
    rememberFolder(config, abs);
    const controller = new Controller(config, abs);
    ctlRef.current = controller;
    const found = Controller.listSessions(abs);
    setSessions(found);
    setPhase(found.length > 0 ? 'session' : usableProvider(config) ? 'model' : 'provider');
  };

  const wizardBack = () => {
    if (phase === 'folder') {
      if (!config.language) setPhase('lang');
      return;
    }
    if (phase === 'session') {
      setPhase('folder');
      return;
    }
    if (phase === 'model') {
      if (modelCustom) {
        setModelCustom(false);
        return;
      }
      setPhase(sessions.length > 0 ? 'session' : 'folder');
      return;
    }
    if (phase === 'provider') {
      if (providerStep.id === 'pick') {
        setPhase(sessions.length > 0 ? 'session' : 'folder');
      } else if (providerStep.id === 'key') {
        setProviderStep({ id: 'pick' });
      } else if (providerStep.id === 'name') {
        setProviderStep({ id: 'pick' });
      } else if (providerStep.id === 'url') {
        setProviderStep({ id: 'name' });
      } else if (providerStep.id === 'model') {
        setProviderStep({ id: 'url', name: providerStep.name });
      } else if (providerStep.id === 'newKey') {
        setProviderStep({ id: 'model', name: providerStep.name, url: providerStep.url });
      }
    }
  };

  const chooseSession = (value: string) => {
    if (value !== '__new__') {
      const s = sessions.find((x) => x.file === value);
      if (s && ctlRef.current) ctlRef.current.loadSession(s.data);
    }
    setPhase(usableProvider(config) ? 'model' : 'provider');
  };

  const finishProvider = (p: ProviderConfig) => {
    ctlRef.current?.saveProvider(p);
    ctlRef.current?.setDefaultProvider(p.name);
    setProviderStep({ id: 'pick' });
    enterMain();
  };

  const enterMain = () => {
    setSystemLines([t('main.ready1', { folder }), t('main.ready2')]);
    setPhase('main');
    setInputReady(false);
    setTimeout(() => setInputReady(true), 350);
  };

  const chooseModel = (value: string) => {
    if (value === '__custom__') return setModelCustom(true);
    if (value === '__provider__') {
      setProviderStep({ id: 'pick' });
      setPhase('provider');
      return;
    }
    const ctl = ctlRef.current;
    if (ctl) {
      const resolved = ctl.resolveModel(value);
      if (resolved) {
        resolved.provider.defaultModel = resolved.model;
        if (!resolved.provider.models.includes(resolved.model)) resolved.provider.models.push(resolved.model);
        ctl.saveProvider(resolved.provider);
        ctl.setDefaultProvider(resolved.provider.name);
        ctl.setSessionModel(`${resolved.provider.name}:${resolved.model}`);
      }
    }
    enterMain();
  };

  // ---------- wizard rendering ----------

  if (phase !== 'main') {
    const totalSteps = 5;
    const sessionProvider = ctl ? ctl.sessionProvider() : getProvider(config);
    return (
      <Box flexDirection="column" paddingX={1}>
        <Text bold color="cyanBright">
          {LOGO}
        </Text>
        <Text color="gray">{t('tagline')}</Text>
        <Box marginTop={1} flexDirection="column">
          {phase === 'lang' && (
            <WizardStep step={1} total={totalSteps} title={t('wiz.lang.title')}>
              <SelectList items={LANGS.map((l) => ({ label: l.label, value: l.code }))} onSelect={chooseLang} />
            </WizardStep>
          )}
          {phase === 'folder' && (
            <WizardStep step={2} total={totalSteps} title={t('wiz.folder.title')} footer={t('wiz.folder.footer')}>
              {wizardError ? <Text color="red">{wizardError}</Text> : null}
              <SelectList
                items={[
                  { label: process.cwd(), value: process.cwd(), hint: t('wiz.folder.current') },
                  ...config.recentFolders
                    .filter((f) => f !== process.cwd())
                    .map((f) => ({ label: f, value: f, hint: t('wiz.folder.recent') })),
                ]}
                allowInput
                inputPlaceholder={t('wiz.folder.input')}
                onBack={wizardBack}
                onSelect={chooseFolder}
                onInput={chooseFolder}
              />
            </WizardStep>
          )}
          {phase === 'session' && (
            <WizardStep step={3} total={totalSteps} title={t('wiz.session.title')}>
              <SelectList
                items={[
                  { label: t('wiz.session.new'), value: '__new__', hint: t('wiz.session.newHint') },
                  ...sessions.map((s) => ({
                    label: t('wiz.session.item', { date: new Date(s.data.savedAt).toLocaleString() }),
                    value: s.file,
                    hint: `(${s.data.agents.length}: ${s.data.agents
                      .map((a) => a.name)
                      .join(', ')
                      .slice(0, 60)})`,
                  })),
                ]}
                onBack={wizardBack}
                onSelect={chooseSession}
              />
            </WizardStep>
          )}
          {phase === 'provider' && providerStep.id === 'pick' && (
            <WizardStep step={4} total={totalSteps} title={t('wiz.provider.title')}>
              <SelectList
                items={[
                  ...config.providers.map(
                    (p): SelectItem => ({
                      label: p.name,
                      value: `existing:${p.name}`,
                      hint: `(${p.baseUrl}${p.apiKey ? '' : ' — ' + t('wiz.provider.needsKey')})`,
                    }),
                  ),
                  ...PROVIDER_PRESETS.filter(
                    (preset) => !config.providers.some((p) => p.name.toLowerCase() === preset.name.toLowerCase()),
                  ).map((preset): SelectItem => ({
                    label: preset.name,
                    value: `preset:${preset.name}`,
                    hint: t('wiz.provider.presetHint', { url: preset.baseUrl, model: preset.defaultModel }),
                  })),
                  { label: t('wiz.provider.custom'), value: '__custom__', hint: t('wiz.provider.customHint') },
                ]}
                onBack={wizardBack}
                onSelect={(v) => {
                  if (v === '__custom__') return setProviderStep({ id: 'name' });
                  if (v.startsWith('preset:')) {
                    const preset = PROVIDER_PRESETS.find((p) => p.name === v.slice('preset:'.length));
                    if (preset) return setProviderStep({ id: 'key', preset: { ...preset, models: [...preset.models] } });
                  }
                  const p = config.providers.find((x) => x.name === v.slice('existing:'.length));
                  if (!p) return;
                  if (p.apiKey) {
                    ctlRef.current?.setDefaultProvider(p.name);
                    ctlRef.current?.setSessionProvider(p.name);
                    enterMain();
                  } else {
                    setProviderStep({ id: 'key', preset: p });
                  }
                }}
              />
            </WizardStep>
          )}
          {phase === 'provider' && providerStep.id === 'key' && (
            <WizardStep
              step={4}
              total={totalSteps}
              title={t('wiz.provider.key.title', { name: providerStep.preset.name })}
              footer={t('wiz.provider.key.footer')}
            >
              <Text color="gray">{providerStep.preset.baseUrl}</Text>
              <SelectList
                items={[]}
                allowInput
                mask
                inputPlaceholder="sk-…"
                onBack={wizardBack}
                onInput={(k) => finishProvider({ ...providerStep.preset, apiKey: k.trim() })}
              />
            </WizardStep>
          )}
          {phase === 'provider' && providerStep.id === 'name' && (
            <WizardStep step={4} total={totalSteps} title={t('wiz.provider.name.title')} footer={t('wiz.footer.type')}>
              <SelectList
                items={[]}
                allowInput
                inputPlaceholder={t('wiz.provider.name.ph')}
                onBack={wizardBack}
                onInput={(name) => setProviderStep({ id: 'url', name })}
              />
            </WizardStep>
          )}
          {phase === 'provider' && providerStep.id === 'url' && (
            <WizardStep step={4} total={totalSteps} title={t('wiz.provider.url.title')} footer={t('wiz.footer.type')}>
              <SelectList
                items={[]}
                allowInput
                inputPlaceholder={t('wiz.provider.url.ph')}
                onBack={wizardBack}
                onInput={(url) => setProviderStep({ id: 'model', name: providerStep.name, url })}
              />
            </WizardStep>
          )}
          {phase === 'provider' && providerStep.id === 'model' && (
            <WizardStep step={4} total={totalSteps} title={t('wiz.provider.model.title')} footer={t('wiz.footer.type')}>
              <SelectList
                items={[]}
                allowInput
                inputPlaceholder={t('wiz.provider.model.ph')}
                onBack={wizardBack}
                onInput={(model) => setProviderStep({ id: 'newKey', name: providerStep.name, url: providerStep.url, model })}
              />
            </WizardStep>
          )}
          {phase === 'provider' && providerStep.id === 'newKey' && (
            <WizardStep
              step={4}
              total={totalSteps}
              title={t('wiz.provider.key.title', { name: providerStep.name })}
              footer={t('wiz.provider.key.footer')}
            >
              <SelectList
                items={[]}
                allowInput
                mask
                inputPlaceholder="sk-…"
                onBack={wizardBack}
                onInput={(key) =>
                  finishProvider({
                    name: providerStep.name,
                    baseUrl: providerStep.url,
                    apiKey: key.trim(),
                    models: [providerStep.model],
                    defaultModel: providerStep.model,
                  })
                }
              />
            </WizardStep>
          )}
          {phase === 'model' && !modelCustom && sessionProvider && (
            <WizardStep step={5} total={totalSteps} title={t('wiz.model.title')}>
              <Text color="gray">{t('wiz.model.provider', { name: sessionProvider.name, url: sessionProvider.baseUrl })}</Text>
              <SelectList
                items={[
                  ...sessionProvider.models.map(
                    (m): SelectItem => ({
                      label: m,
                      value: `${sessionProvider.name}:${m}`,
                      hint: m === sessionProvider.defaultModel ? t('wiz.model.default') : undefined,
                    }),
                  ),
                  { label: t('wiz.model.custom'), value: '__custom__', hint: t('wiz.model.customHint') },
                  { label: t('wiz.model.addProvider'), value: '__provider__' },
                ]}
                onBack={wizardBack}
                onSelect={chooseModel}
              />
            </WizardStep>
          )}
          {phase === 'model' && modelCustom && (
            <WizardStep step={5} total={totalSteps} title={t('wiz.model.customTitle')} footer={t('wiz.footer.type')}>
              <SelectList
                items={[]}
                allowInput
                inputPlaceholder={t('wiz.provider.model.ph')}
                onBack={wizardBack}
                onInput={(m) => {
                  setModelCustom(false);
                  chooseModel(m);
                }}
              />
            </WizardStep>
          )}
        </Box>
      </Box>
    );
  }

  // ---------- main UI ----------

  if (!ctl) return null;
  const agents = [...ctl.board.agents.values()];
  // Names + short aliases (a1, a2, …) — both usable after @ and in commands.
  const agentNames = [...new Set(agents.flatMap((a) => (a.alias && a.alias !== a.name ? [a.alias, a.name] : [a.name])))];
  const approval = ctl.approvals[0];
  const question = approval ? undefined : ctl.questions[0]; // approvals take priority
  const settingsOpen = view === 'settings' || view === 'settings-session';
  const inputActive = inputReady && !approval && !question && !settingsOpen;

  return (
    <MainScreen
      ctl={ctl}
      folder={folder}
      view={view}
      focus={focus}
      systemLines={systemLines}
      agentNames={agentNames}
      approval={approval}
      question={question}
      inputActive={inputActive}
      onInput={(value, images) => {
        const v = value.trim();
        // Focus mode: plain text goes straight to the focused agent.
        if (focus && v && !v.startsWith('/') && !v.startsWith('@')) {
          executeInput(`@${focus} ${v}`, ctl, ui, images);
        } else {
          executeInput(value, ctl, ui, images);
        }
      }}
      onEscape={() => {
        if (view !== 'agents') setView('agents');
        else if (focus) {
          setFocus(null);
          ui.system(t('m.focusOff'));
        }
      }}
      notify={ui.system}
    />
  );
}

function MainScreen({
  ctl,
  folder,
  view,
  focus,
  systemLines,
  agentNames,
  approval,
  question,
  inputActive,
  onInput,
  onEscape,
  notify,
}: {
  ctl: Controller;
  folder: string;
  view: ViewName;
  focus: string | null;
  systemLines: string[];
  agentNames: string[];
  approval: Controller['approvals'][number] | undefined;
  question: Controller['questions'][number] | undefined;
  inputActive: boolean;
  onInput: (value: string, images?: string[]) => void;
  onEscape: () => void;
  notify: (line: string) => void;
}) {
  const agents = [...ctl.board.agents.values()];
  // Adapt the layout to the REAL terminal size (never resize the user's terminal).
  const { stdout } = useStdout();
  const cols = stdout?.columns ?? 100;
  const narrow = cols < 110;
  const logsPerAgent = agents.length <= 1 ? 10 : agents.length <= 2 ? 7 : 5;
  const width = agents.length === 1 || narrow ? '100%' : '50%';
  const settingsOpen = view === 'settings' || view === 'settings-session';

  // Focus mode: one agent rendered alone, with scrollback (PgUp/PgDn).
  const focused = focus
    ? agents.find((a) => a.name.toLowerCase() === focus.toLowerCase())
    : undefined;
  const [scroll, setScroll] = useState(0);
  useEffect(() => setScroll(0), [focus]);
  const FOCUS_LOGS = 20;
  const focusedLogs = focused ? ctl.board.logs.filter((l) => l.agentId === focused.id) : [];
  const maxScroll = Math.max(0, focusedLogs.length - FOCUS_LOGS);
  const clampedScroll = Math.min(scroll, maxScroll);
  const visibleLogs = focused
    ? focusedLogs.slice(
        Math.max(0, focusedLogs.length - FOCUS_LOGS - clampedScroll),
        focusedLogs.length - clampedScroll,
      )
    : [];

  // Grid scroll: when more agents than fit on screen, PgUp/PgDn slides a
  // window over the agent panels (with ▲/▼ indicators so you know where you are).
  const GRID_CAP = narrow ? 2 : 4;
  const [gridScroll, setGridScroll] = useState(0);
  const maxGridScroll = Math.max(0, agents.length - GRID_CAP);
  const clampedGrid = Math.min(gridScroll, maxGridScroll);
  const visibleAgents = agents.length > GRID_CAP ? agents.slice(clampedGrid, clampedGrid + GRID_CAP) : agents;

  // Solo scroll: with a SINGLE agent on the agents view, PgUp/PgDn scrolls
  // its log history (same behaviour as /focus, without needing to focus).
  const solo = agents.length === 1 ? agents[0] : null;
  const [soloScroll, setSoloScroll] = useState(0);
  const soloLogs = solo ? ctl.board.logs.filter((l) => l.agentId === solo.id) : [];
  const maxSoloScroll = Math.max(0, soloLogs.length - logsPerAgent);
  const clampedSolo = Math.min(soloScroll, maxSoloScroll);

  // Esc always returns to the agents view, even while approval is shown.
  useInput((_input, key) => {
    if (key.escape) onEscape();
    if (focused) {
      if (key.pageUp) setScroll((s) => Math.min(s + 10, maxScroll));
      if (key.pageDown) setScroll((s) => Math.max(0, s - 10));
    } else if (view === 'agents') {
      // Scroll only on the agents view — every other long view
      // (/help, /notes, /diff…) owns PgUp/PgDn for its own scrolling.
      if (solo) {
        if (key.pageUp) setSoloScroll((s) => Math.min(Math.min(s, maxSoloScroll) + 5, maxSoloScroll));
        if (key.pageDown) setSoloScroll((s) => Math.max(0, Math.min(s, maxSoloScroll) - 5));
      } else {
        if (key.pageUp) setGridScroll((s) => Math.max(0, Math.min(s, maxGridScroll) - 1));
        if (key.pageDown) setGridScroll((s) => Math.min(Math.min(s, maxGridScroll) + 1, maxGridScroll));
      }
    }
  });

  const p = ctl.sessionProvider();
  const activeCount = agents.filter((a) =>
    ['working', 'thinking', 'listening', 'waiting'].includes(a.state),
  ).length;
  const totalCost = agents.reduce((s, a) => s + (a.cost ?? 0), 0);

  return (
    <Box flexDirection="column" paddingX={1}>
      {/* header — the ⌂ HUB badge tells this terminal apart from the agents'
          dedicated terminals (which carry a colored ⛓ AGENT banner). */}
      <Box justifyContent="space-between">
        <Box>
          <Text backgroundColor="cyan" color="black" bold>
            {' '}⌂ HUB{' '}
          </Text>
          <Text bold color="cyanBright">
            {' '}{LOGO}
          </Text>
        </Box>
        <Text color="gray">
          {p ? `${p.name}:${ctl.session.model}` : '—'} · {p ? p.baseUrl.replace(/^https?:\/\//, '') : ''} ·{' '}
          {ctl.session.approvalMode} · {ctl.session.soundEnabled ? '🔔' : '🔕'}
        </Text>
      </Box>
      <Text color="gray" wrap="truncate-end">
        📁 {folder}
      </Text>

      {/* body */}
      {view === 'settings' ? (
        <SettingsPanel ctl={ctl} scope="global" onClose={onEscape} />
      ) : view === 'settings-session' ? (
        <SettingsPanel ctl={ctl} scope="session" onClose={onEscape} />
      ) : view === 'board' ? (
        <BoardView board={ctl.board} />
      ) : view === 'notes' ? (
        <NotesView board={ctl.board} />
      ) : view === 'sessions' ? (
        <SessionsView projectRoot={ctl.projectRoot} />
      ) : view === 'diff' ? (
        <DiffView board={ctl.board} />
      ) : view === 'cost' ? (
        <CostView board={ctl.board} />
      ) : view === 'skills' ? (
        <SkillsView skills={ctl.getSkills()} />
      ) : view === 'specialists' ? (
        <SpecialistsView specialists={ctl.getSpecialists()} />
      ) : view === 'help' ? (
        <HelpView />
      ) : agents.length === 0 ? (
        <Box borderStyle="round" borderColor="gray" flexDirection="column" paddingX={1}>
          <Text color="gray">{t('main.empty')}</Text>
        </Box>
      ) : focused ? (
        <Box flexDirection="column">
          <AgentPanel agent={focused} logs={visibleLogs} width="100%" expanded />
          <Text color="gray" wrap="truncate-end">
            {t('m.focusHint', { name: focused.name })}
            {clampedScroll > 0 ? ` · ↑${clampedScroll}` : ''}
          </Text>
        </Box>
      ) : (
        <Box flexDirection="column">
          {clampedGrid > 0 ? <Text color="gray">{t('grid.above', { n: clampedGrid })}</Text> : null}
          <Box flexWrap="wrap">
            {visibleAgents.map((a) => (
              <AgentPanel
                key={a.id}
                agent={a}
                logs={
                  solo
                    ? soloLogs.slice(
                        Math.max(0, soloLogs.length - logsPerAgent - clampedSolo),
                        soloLogs.length - clampedSolo,
                      )
                    : ctl.board.logsFor(a.id, logsPerAgent)
                }
                width={width}
              />
            ))}
          </Box>
          {solo && clampedSolo > 0 ? (
            <Text color="gray" wrap="truncate-end">
              ↑{clampedSolo} · PgDn ⇣
            </Text>
          ) : null}
          {agents.length - clampedGrid - visibleAgents.length > 0 ? (
            <Text color="gray">{t('grid.below', { n: agents.length - clampedGrid - visibleAgents.length })}</Text>
          ) : null}
        </Box>
      )}

      {/* system messages */}
      {systemLines.length > 0 && !settingsOpen && (
        <Box flexDirection="column">
          {systemLines.map((l, i) => (
            <Text key={i} color="gray" wrap="truncate-end">
              {l}
            </Text>
          ))}
        </Box>
      )}

      {/* approval (priority over input) */}
      {approval && (
        <ApprovalPrompt
          request={approval}
          pendingCount={ctl.approvals.length}
          onAnswer={(id, ok, always) => ctl.answerApproval(id, ok, always)}
        />
      )}

      {/* agent question with 30s auto-run countdown (key forces remount per question) */}
      {question && (
        <QuestionPrompt
          key={question.id}
          question={question}
          pendingCount={ctl.questions.length}
          onAnswer={(id, answer, auto) => ctl.answerQuestion(id, answer, auto)}
        />
      )}

      {/* input */}
      <CommandInput
        active={inputActive}
        placeholder={t('main.placeholder')}
        agentNames={agentNames}
        onSubmit={onInput}
        onEscape={onEscape}
        notify={notify}
      />
      {/* status bar: live session overview when agents exist, hints otherwise */}
      <Text color="gray" wrap="truncate-end">
        {agents.length === 0
          ? t('main.status')
          : t('status.bar', {
              agents: agents.length,
              active: activeCount,
              cost: fmtCost(totalCost),
            }) +
            (ctl.questions.length > 0 ? ` · ❓${ctl.questions.length}` : '') +
            (ctl.approvals.length > 0 ? ` · ⏳${ctl.approvals.length}` : '') +
            (focused ? ` · 🎯 ${focused.name}` : '')}
      </Text>
    </Box>
  );
}
