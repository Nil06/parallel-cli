import React, { useEffect, useMemo, useRef, useState } from 'react';
import fs from 'node:fs';
import path from 'node:path';
import { Box, Text, useApp, useInput, useStdout } from 'ink';
import { Controller } from '../controller.js';
import { startSessionServer } from '../server.js';
import { executeInput, type ViewName, type UIActions, type SystemLevel } from '../commands.js';
import {
  PROVIDER_PRESETS,
  detectProviderModels,
  getProvider,
  isLocalProvider,
  isPlaceholderModel,
  providerNeedsApiKey,
  providerReady,
  rememberFolder,
  saveConfig,
} from '../config.js';
import { LANGS, setLang, t } from '../i18n.js';
import type { Lang, ParallelConfig, ProviderConfig, SessionData } from '../types.js';
import { AgentRow, AgentTranscript } from './AgentPanel.js';
import { ApprovalPrompt } from './ApprovalPrompt.js';
import { QuestionPrompt } from './QuestionPrompt.js';
import { CommandInput } from './CommandInput.js';
import { SettingsPanel } from './SettingsPanel.js';
import { BoardView, CostView, DiffView, HelpView, NotesView, SessionsView, SkillsView, SpecialistsView } from './views.js';
import { SelectList, WizardStep, type SelectItem } from './Wizard.js';
import { BRAND, CHROME, STATE, STATE_META, UI, middleTruncate } from './tokens.js';
import type { AgentInfo } from '../types.js';

const LOGO = 'Parallel';
// Version from package.json. Hardcoded — rootDir: "src" prevents importing ../../package.json.
const VERSION = '0.4.5';

type Phase = 'lang' | 'folder' | 'session' | 'provider' | 'model' | 'main';
type ProviderStep =
  | { id: 'pick' }
  | { id: 'presetModel'; provider: ProviderConfig }
  | { id: 'endpoint'; provider: ProviderConfig }
  | { id: 'editEndpoint'; provider: ProviderConfig }
  | { id: 'key'; provider: ProviderConfig }
  | { id: 'name' }
  | { id: 'url'; name: string }
  | { id: 'customModel'; name: string; url: string }
  | { id: 'newKey'; provider: ProviderConfig };

interface SessionChoice {
  file: string;
  data: SessionData;
}

function usableProvider(config: ParallelConfig): ProviderConfig | undefined {
  const p = getProvider(config);
  return p && providerReady(p) && (p.defaultModel || p.models[0]) ? p : undefined;
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
  const { stdout } = useStdout();
  const wizardListHeight = Math.max(4, (stdout?.rows ?? 30) - 10);
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
  const [tick, setTick] = useState(0);
  const [view, setView] = useState<ViewName>('agents');
  // Focus mode (/focus <agent>): plain input is routed to that agent.
  const [focus, setFocus] = useState<string | null>(null);
  const [rawLogs, setRawLogs] = useState(false);
  const [systemLines, setSystemLines] = useState<{ text: string; level?: SystemLevel }[]>(
    directFolder
      ? [
          { text: t('main.ready1', { folder: directFolder }), level: 'ok' as SystemLevel },
          { text: t('main.ready2'), level: 'info' as SystemLevel },
        ]
      : [],
  );
  const [inputReady, setInputReady] = useState(Boolean(directFolder));

  const ctl = ctlRef.current;

  const leaveCurrentProject = () => {
    const current = ctlRef.current;
    current?.saveSession();
    current?.stopAll();
    setFocus(null);
    setView('agents');
    setRawLogs(false);
    setProviderStep({ id: 'pick' });
    setModelCustom(false);
    setWizardError('');
    setSessions([]);
    setInputReady(false);
  };

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

  useEffect(() => {
    if (!ctl || !focus) return;
    if (!ctl.board.getAgentByName(focus)) setFocus(null);
  }, [ctl, focus, tick]);

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
      system: (line: string, level?: SystemLevel) =>
        setSystemLines((ls) => [...ls.slice(-5), { text: line, level }]),
      exit: () => {
        setTimeout(() => exit(), 50);
      },
      setFocus,
      toggleRaw: () =>
        setRawLogs((v) => {
          const next = !v;
          setSystemLines((ls) => [
            ...ls.slice(-5),
            { text: t(next ? 'm.rawOn' : 'm.rawOff'), level: 'info' as SystemLevel },
          ]);
          return next;
        }),
      copyLatest: () => {
        const agents = [...(ctlRef.current?.board.agents.values() ?? [])].filter((a) => a.lastResult);
        const latest = agents.sort((a, b) => b.startedAt - a.startedAt)[0];
        if (!latest?.lastResult) {
          setSystemLines((ls) => [...ls.slice(-5), { text: t('m.copyNone'), level: 'warn' as SystemLevel }]);
          return;
        }
        const encoded = Buffer.from(latest.lastResult).toString('base64');
        process.stdout.write(`\x1b]52;c;${encoded}\x07`);
        setSystemLines((ls) => [
          ...ls.slice(-5),
          { text: t('m.copyDone', { name: latest.name }), level: 'ok' as SystemLevel },
        ]);
      },
      openProject: (nextFolder?: string) => {
        leaveCurrentProject();
        if (nextFolder) {
          chooseFolder(nextFolder);
          return;
        }
        ctlRef.current = null;
        setFolder('');
        setPhase('folder');
      },
      openWizard: () => {
        leaveCurrentProject();
        ctlRef.current = null;
        setFolder('');
        setPhase('lang');
      },
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
      } else if (providerStep.id === 'presetModel') {
        setProviderStep({ id: 'pick' });
      } else if (providerStep.id === 'endpoint') {
        const isPreset = PROVIDER_PRESETS.some((p) => p.name.toLowerCase() === providerStep.provider.name.toLowerCase());
        setProviderStep(
          isPreset
            ? { id: 'presetModel', provider: providerStep.provider }
            : { id: 'customModel', name: providerStep.provider.name, url: providerStep.provider.baseUrl },
        );
      } else if (providerStep.id === 'editEndpoint') {
        setProviderStep({ id: 'endpoint', provider: providerStep.provider });
      } else if (providerStep.id === 'key') {
        setProviderStep({ id: 'endpoint', provider: providerStep.provider });
      } else if (providerStep.id === 'name') {
        setProviderStep({ id: 'pick' });
      } else if (providerStep.id === 'url') {
        setProviderStep({ id: 'name' });
      } else if (providerStep.id === 'customModel') {
        setProviderStep({ id: 'url', name: providerStep.name });
      } else if (providerStep.id === 'newKey') {
        setProviderStep({ id: 'customModel', name: providerStep.provider.name, url: providerStep.provider.baseUrl });
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
    ctlRef.current?.setSessionProvider(p.name);
    if (p.defaultModel || p.models[0]) ctlRef.current?.setSessionModel(`${p.name}:${p.defaultModel || p.models[0]}`);
    setProviderStep({ id: 'pick' });
    enterMain();
  };

  const enterMain = () => {
    setSystemLines([
      { text: t('main.ready1', { folder }), level: 'ok' as SystemLevel },
      { text: t('main.ready2'), level: 'info' as SystemLevel },
    ]);
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
              <SelectList items={LANGS.map((l) => ({ label: l.label, value: l.code }))} height={wizardListHeight} onSelect={chooseLang} />
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
                height={wizardListHeight}
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
                height={wizardListHeight}
                onBack={wizardBack}
                onSelect={chooseSession}
              />
            </WizardStep>
          )}
          {phase === 'provider' && providerStep.id === 'pick' && (
            <WizardStep step={4} total={totalSteps} title={t('wiz.provider.title')}>
              <SelectList
                items={(() => {
                  const items: SelectItem[] = [];
                  const configuredNames = new Set(config.providers.map((p) => p.name.toLowerCase()));

                  // Section: Configured
                  if (config.providers.length > 0) {
                    items.push({ label: t('wiz.provider.section.configured'), value: '', section: true });
                    for (const p of config.providers) {
                      items.push({
                        label: p.name,
                        value: p.name,
                        detail: p.apiKey ? undefined : t('wiz.provider.needsKey'),
                      });
                    }
                  }

                  // Sections per category: western, chinese, gateways, inference, local
                  const catOrder = ['western', 'chinese', 'gateways', 'inference', 'local'] as const;
                  const emoji: Record<string, string> = {
                    western: '\u{1F1FA}\u{1F1F8} ',
                    chinese: '\u{1F1E8}\u{1F1F3} ',
                    gateways: '\u{1F310} ',
                    inference: '\u26A1 ',
                    local: '\u{1F3E0} ',
                  };

                  for (const cat of catOrder) {
                    const presetsInCat = PROVIDER_PRESETS.filter(
                      (p) => p.category === cat && !configuredNames.has(p.name.toLowerCase()),
                    );
                    if (presetsInCat.length === 0) continue;
                    const key = `wiz.provider.section.${cat}`;
                    const sectionLabel = emoji[cat] + t(key);
                    items.push({ value: '', label: sectionLabel, section: true });
                    for (const preset of presetsInCat) {
                      const detail =
                        preset.models.length > 0
                          ? `${preset.models.length} model${preset.models.length > 1 ? 's' : ''}`
                          : undefined;
                      items.push({
                        value: preset.name,
                        label: preset.name,
                        detail,
                      });
                    }
                  }

                  // Custom always last
                  items.push({
                    label: t('wiz.provider.custom'),
                    value: '__custom__',
                    detail: t('wiz.provider.customDetail'),
                  });
                  return items;
                })()}
                height={wizardListHeight}
                onBack={wizardBack}
                onSelect={async (v) => {
                  if (v === '__custom__') return setProviderStep({ id: 'name' });
                  // Already-configured provider?
                  const existing = config.providers.find((x) => x.name === v);
                  if (existing) {
                    if (providerReady(existing)) {
                      ctlRef.current?.setDefaultProvider(v);
                      ctlRef.current?.setSessionProvider(v);
                      setPhase('model');
                    } else {
                      setProviderStep({ id: 'presetModel', provider: existing });
                    }
                    return;
                  }
                  // Must be a preset
                  const preset = PROVIDER_PRESETS.find((p) => p.name === v);
                  if (!preset) return;
                  // Ollama: connectivity check with 2s timeout
                  if (preset.name.toLowerCase() === 'ollama') {
                    setSystemLines((ls) => [
                      ...ls.slice(-5),
                      { text: t('wiz.provider.ollama.checking', { url: preset.baseUrl }), level: 'info' as SystemLevel },
                    ]);
                    const detected = await detectProviderModels(preset);
                    let models = detected?.models ?? [...preset.models];
                    let defaultModel = detected?.defaultModel ?? preset.defaultModel;
                    if (detected) {
                      setSystemLines((ls) => [
                        ...ls.slice(-5),
                        { text: t('wiz.provider.ollama.found', { n: detected.models.length }), level: 'ok' as SystemLevel },
                      ]);
                    } else {
                      setSystemLines((ls) => [
                        ...ls.slice(-5),
                        { text: t('wiz.provider.ollama.notFound', { url: preset.baseUrl }), level: 'warn' as SystemLevel },
                      ]);
                    }
                    const ollamaProvider: ProviderConfig = { ...preset, apiKey: 'ollama-local', models, defaultModel };
                    setProviderStep({ id: 'presetModel', provider: ollamaProvider });
                    return;
                  }
                  setProviderStep({ id: 'presetModel', provider: { ...preset, models: [...preset.models] } });
                }}
              />
            </WizardStep>
          )}
          {phase === 'provider' && providerStep.id === 'presetModel' && (
            <WizardStep step={4} total={totalSteps} title={t('wiz.provider.model.title')}>
              <Text color="gray">{t('wiz.model.provider', { name: providerStep.provider.name, url: providerStep.provider.baseUrl })}</Text>
              <SelectList
                items={[
                  ...providerStep.provider.models.map((m) => ({
                    label: m,
                    value: m,
                    hint: m === providerStep.provider.defaultModel ? t('wiz.model.default') : undefined,
                  })),
                ]}
                height={wizardListHeight}
                allowInput
                inputPlaceholder={t('wiz.provider.model.ph')}
                onBack={wizardBack}
                onSelect={(v) => {
                  const provider = { ...providerStep.provider };
                  provider.defaultModel = v;
                  if (!provider.models.includes(v)) provider.models.push(v);
                  setProviderStep({ id: 'endpoint', provider });
                }}
                onInput={(m) => {
                  const model = m.trim();
                  if (!model) return;
                  const provider = { ...providerStep.provider, models: [...providerStep.provider.models] };
                  provider.defaultModel = model;
                  if (!provider.models.includes(model)) provider.models.push(model);
                  setProviderStep({ id: 'endpoint', provider });
                }}
              />
            </WizardStep>
          )}
          {phase === 'provider' && providerStep.id === 'endpoint' && (
            <WizardStep step={4} total={totalSteps} title={t('wiz.provider.endpoint.title', { name: providerStep.provider.name })}>
              <Text color="gray">{providerStep.provider.baseUrl}</Text>
              <Text color="gray">
                {t('wiz.provider.endpoint.model', { model: providerStep.provider.defaultModel || providerStep.provider.models[0] || '—' })}
              </Text>
              <SelectList
                items={[
                  { label: t('wiz.provider.endpoint.use'), value: 'use' },
                  { label: t('wiz.provider.endpoint.edit'), value: 'edit' },
                ]}
                height={wizardListHeight}
                onBack={wizardBack}
                onSelect={(v) => {
                  if (v === 'edit') return setProviderStep({ id: 'editEndpoint', provider: providerStep.provider });
                  if (providerNeedsApiKey(providerStep.provider)) return setProviderStep({ id: 'key', provider: providerStep.provider });
                  finishProvider(providerStep.provider);
                }}
              />
            </WizardStep>
          )}
          {phase === 'provider' && providerStep.id === 'editEndpoint' && (
            <WizardStep step={4} total={totalSteps} title={t('wiz.provider.url.title')} footer={t('wiz.footer.type')}>
              <SelectList
                items={[]}
                height={wizardListHeight}
                allowInput
                inputPlaceholder={providerStep.provider.baseUrl}
                onBack={wizardBack}
                onInput={(url) => {
                  const baseUrl = url.trim();
                  setProviderStep({
                    id: 'endpoint',
                    provider: {
                      ...providerStep.provider,
                      baseUrl,
                      requiresApiKey: !isLocalProvider({ baseUrl }),
                    },
                  });
                }}
              />
            </WizardStep>
          )}
          {phase === 'provider' && providerStep.id === 'key' && (
            <WizardStep
              step={4}
              total={totalSteps}
              title={t('wiz.provider.key.title', { name: providerStep.provider.name })}
              footer={t('wiz.provider.key.footer')}
            >
              <Text color="gray">{providerStep.provider.baseUrl}</Text>
              <SelectList
                items={[]}
                height={wizardListHeight}
                allowInput
                mask
                inputPlaceholder="sk-…"
                onBack={wizardBack}
                onInput={(k) => finishProvider({ ...providerStep.provider, apiKey: k.trim() })}
              />
            </WizardStep>
          )}
          {phase === 'provider' && providerStep.id === 'name' && (
            <WizardStep step={4} total={totalSteps} title={t('wiz.provider.name.title')} footer={t('wiz.footer.type')}>
              <SelectList
                items={[]}
                height={wizardListHeight}
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
                height={wizardListHeight}
                allowInput
                inputPlaceholder={t('wiz.provider.url.ph')}
                onBack={wizardBack}
                onInput={(url) => setProviderStep({ id: 'customModel', name: providerStep.name, url })}
              />
            </WizardStep>
          )}
          {phase === 'provider' && providerStep.id === 'customModel' && (
            <WizardStep step={4} total={totalSteps} title={t('wiz.provider.model.title')} footer={t('wiz.footer.type')}>
              <SelectList
                items={[]}
                height={wizardListHeight}
                allowInput
                inputPlaceholder={t('wiz.provider.model.ph')}
                onBack={wizardBack}
                onInput={(model) => {
                  const trimmed = model.trim();
                  if (isPlaceholderModel(trimmed)) {
                    setSystemLines((ls) => [...ls.slice(-5), { text: t('set.modelPlaceholder'), level: 'warn' as SystemLevel }]);
                    return;
                  }
                  const local = isLocalProvider({ baseUrl: providerStep.url });
                  setProviderStep({
                    id: 'endpoint',
                    provider: {
                      name: providerStep.name,
                      baseUrl: providerStep.url,
                      apiKey: '',
                      models: [trimmed],
                      defaultModel: trimmed,
                      requiresApiKey: !local,
                    },
                  });
                }}
              />
            </WizardStep>
          )}
          {phase === 'provider' && providerStep.id === 'newKey' && (
            <WizardStep
              step={4}
              total={totalSteps}
              title={t('wiz.provider.key.title', { name: providerStep.provider.name })}
              footer={t('wiz.provider.key.footer')}
            >
              <SelectList
                items={[]}
                height={wizardListHeight}
                allowInput
                mask
                inputPlaceholder="sk-…"
                onBack={wizardBack}
                onInput={(key) =>
                  finishProvider({
                    ...providerStep.provider,
                    apiKey: key.trim(),
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
                height={wizardListHeight}
                onBack={wizardBack}
                onSelect={chooseModel}
              />
            </WizardStep>
          )}
          {phase === 'model' && modelCustom && (
            <WizardStep step={5} total={totalSteps} title={t('wiz.model.customTitle')} footer={t('wiz.footer.type')}>
              <SelectList
                items={[]}
                height={wizardListHeight}
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
  const viewOwnsKeyboard = view !== 'agents' && !settingsOpen;
  const inputActive = inputReady && !approval && !question && !settingsOpen && !viewOwnsKeyboard;

  return (
    <MainScreen
      ctl={ctl}
      folder={folder}
      view={view}
      focus={focus}
      rawLogs={rawLogs}
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
          ui.system(t('m.focusOff'), 'info');
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
  rawLogs,
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
  rawLogs: boolean;
  systemLines: { text: string; level?: SystemLevel }[];
  agentNames: string[];
  approval: Controller['approvals'][number] | undefined;
  question: Controller['questions'][number] | undefined;
  inputActive: boolean;
  onInput: (value: string, images?: string[]) => void;
  onEscape: () => void;
  notify: (line: string, level?: SystemLevel) => void;
}) {
  const agents = [...ctl.board.agents.values()];
  // Adapt the layout to the REAL terminal size (never resize the user's terminal).
  const { stdout } = useStdout();
  const cols = Math.max(20, stdout?.columns ?? 100);
  const rows = Math.max(12, stdout?.rows ?? 30);
  const settingsOpen = view === 'settings' || view === 'settings-session';

  // Height budget: fixed sections → body gets the remainder.
  const headerLines = 4; // border-box header (top border + 2 content lines + bottom border)
  const footerLine2 = 1; // always shown
  const footerLine1 = agents.length === 0 ? 1 : 0;
  const footerLines = footerLine1 + footerLine2;
  // System messages: count actual rendered lines (including \n splits + "Session" label).
  const systemMsgLines =
    systemLines.length > 0 && !settingsOpen
      ? (agents.length > 0 ? 1 : 0) + // "Session" label
        (agents.length > 0
          ? systemLines
              .filter((l) => !/^Ready|^Type a task|^⚡ Ready|^Default \/task|^Agent .* launched/.test(l.text))
              .slice(-2)
          : systemLines
        ).reduce((sum, l) => sum + l.text.split('\n').length, 0)
      : 0;
  const inputLines = 4; // modeHint (1) + input border box (3)
  const spacerLines = 2; // after header + before footer
  const approvalHeight = approval ? 6 : 0;
  const questionHeight = question ? 7 : 0;
  const bodyHeight = Math.max(
    1,
    rows - headerLines - footerLines - systemMsgLines - inputLines - spacerLines - approvalHeight - questionHeight,
  );

  // Focus mode: one agent rendered alone, with scrollback (PgUp/PgDn).
  const focused = focus
    ? agents.find((a) => a.name.toLowerCase() === focus.toLowerCase())
    : undefined;
  const [scroll, setScroll] = useState(0);
  const [focusFollowTail, setFocusFollowTail] = useState(true);
  useEffect(() => {
    setScroll(0);
    setFocusFollowTail(true);
  }, [focus]);
  const FOCUS_LOGS = Math.max(8, bodyHeight - 1);
  const focusedLogs = focused ? ctl.board.logs.filter((l) => l.agentId === focused.id) : [];
  const maxScroll = Math.max(0, focusedLogs.length - FOCUS_LOGS);
  const clampedScroll = Math.min(scroll, maxScroll);
  const visibleLogs = focused
    ? focusedLogs.slice(
        Math.max(0, focusedLogs.length - FOCUS_LOGS - clampedScroll),
        focusedLogs.length - clampedScroll,
      )
    : [];

  const [hubScroll, setHubScroll] = useState(0);
  const [hubFollowTail, setHubFollowTail] = useState(true);
  const hubRows = Math.max(3, bodyHeight - 2);
  const maxHubScroll = Math.max(0, agents.length - Math.max(1, Math.floor(hubRows / 2)));
  const clampedHub = Math.min(hubScroll, maxHubScroll);
  const logSeq = ctl.board.logs.length > 0 ? ctl.board.logs[ctl.board.logs.length - 1].seq ?? ctl.board.logs.length : 0;
  useEffect(() => {
    if (focusFollowTail) setScroll(0);
  }, [logSeq, focused?.state, focusFollowTail]);
  useEffect(() => {
    if (hubFollowTail) setHubScroll(0);
  }, [logSeq, agents.length, hubFollowTail]);

  // Scroll helpers.
  const scrollFocusUp = () => {
    setFocusFollowTail(false);
    setScroll((s) => Math.min(s + 1, maxScroll));
  };
  const scrollFocusDown = () => {
    setScroll((s) => {
      const next = Math.max(0, s - 1);
      if (next === 0) setFocusFollowTail(true);
      return next;
    });
  };
  const scrollHubUp = () => {
    setHubFollowTail(false);
    setHubScroll((s) => Math.min(Math.min(s, maxHubScroll) + 1, maxHubScroll));
  };
  const scrollHubDown = () => {
    setHubScroll((s) => {
      const next = Math.max(0, Math.min(s, maxHubScroll) - 1);
      if (next === 0) setHubFollowTail(true);
      return next;
    });
  };

  // Keyboard: PgUp/PgDn always scroll hub/focus. Up/Down only scroll when input is inactive.
  useInput((_input, key) => {
    if (key.escape && !settingsOpen) onEscape();
    if (focused) {
      if (key.pageUp || (!inputActive && key.upArrow)) scrollFocusUp();
      if (key.pageDown || (!inputActive && key.downArrow)) scrollFocusDown();
    } else if (view === 'agents') {
      if (key.pageUp || (!inputActive && key.upArrow)) scrollHubUp();
      if (key.pageDown || (!inputActive && key.downArrow)) scrollHubDown();
    }
  }, { isActive: !approval && !question });

  const idleCount = agents.filter((a) => a.state === 'idle').length;
  const workingCount = agents.filter((a) => ['working', 'thinking', 'listening'].includes(a.state)).length;
  const doneCount = agents.filter((a) => a.state === 'done').length;
  const errorCount = agents.filter((a) => ['error', 'stopped'].includes(a.state)).length;
  const globalDotColor = workingCount > 0 ? 'green'
    : agents.some((a) => ['waiting', 'paused'].includes(a.state)) ? 'yellow'
    : 'gray';

  const folderMax = Math.max(10, cols - 40);

  // View breadcrumb: when not in agents view, show the view name instead of "control room".
  const VIEW_LABEL: Record<ViewName, string> = {
    agents: 'control room',
    board: 'coordination',
    diff: 'diffs',
    notes: 'notes',
    help: 'help',
    settings: 'settings',
    'settings-session': 'session settings',
    sessions: 'sessions',
    cost: 'cost',
    skills: 'skills',
    specialists: 'specialists',
  };
  const viewLabel = VIEW_LABEL[view] ?? 'control room';

  return (
    <Box flexDirection="column" height={rows}>
      {/* ── Header ── */}
      <Box flexDirection="column">
        <Text color={CHROME.muted}>╭{'─'.repeat(cols - 2)}╮</Text>
        <Box flexDirection="row" width={cols}>
          <Text color={CHROME.muted}>│ </Text>
          <Box flexDirection="row" width={cols - 4} justifyContent="space-between">
            <Box flexDirection="row">
              <Text bold color={BRAND.primary}>PARALLEL</Text>
              <Text color={globalDotColor}> ●</Text>
              <Text color={view === 'agents' ? CHROME.muted : BRAND.muted}> {viewLabel}</Text>
              {rawLogs && focused ? <Text color={UI.warn}> [RAW]</Text> : null}
            </Box>
            <Text color={CHROME.muted}>{middleTruncate(folder, folderMax)}</Text>
          </Box>
          <Text color={CHROME.muted}> │</Text>
        </Box>
        <Box flexDirection="row" width={cols}>
          <Text color={CHROME.muted}>│ </Text>
          <Box flexDirection="row" width={cols - 4} justifyContent={agents.length > 0 ? 'space-between' : 'flex-end'}>
            {agents.length > 0 ? (
              <Box flexDirection="row">
                <Text>
                  <Text color={CHROME.muted}>◇ {idleCount} idle</Text>
                  {' · '}
                  <Text color={workingCount > 0 ? STATE.working : CHROME.muted}>● {workingCount} active</Text>
                  {' · '}
                  <Text color={doneCount > 0 ? STATE.done : CHROME.muted}>✓ {doneCount} done</Text>
                  {' · '}
                  <Text color={errorCount > 0 ? STATE.error : CHROME.muted}>✗ {errorCount} err</Text>
                </Text>
              </Box>
            ) : null}
            <Text color={CHROME.muted}>v{VERSION}</Text>
          </Box>
          <Text color={CHROME.muted}> │</Text>
        </Box>
        <Text color={CHROME.muted}>╰{'─'.repeat(cols - 2)}╯</Text>
      </Box>

      <Text> </Text>

      {/* body */}
      <Box height={bodyHeight} overflow="hidden" flexDirection="column">
        {view === 'settings' ? (
          <SettingsPanel ctl={ctl} scope="global" height={bodyHeight} onClose={onEscape} />
        ) : view === 'settings-session' ? (
          <SettingsPanel ctl={ctl} scope="session" height={bodyHeight} onClose={onEscape} />
        ) : view === 'board' ? (
          <BoardView board={ctl.board} bodyHeight={bodyHeight} />
        ) : view === 'notes' ? (
          <NotesView board={ctl.board} bodyHeight={bodyHeight} />
        ) : view === 'sessions' ? (
          <SessionsView projectRoot={ctl.projectRoot} bodyHeight={bodyHeight} />
        ) : view === 'diff' ? (
          <DiffView board={ctl.board} bodyHeight={bodyHeight} />
        ) : view === 'cost' ? (
          <CostView board={ctl.board} bodyHeight={bodyHeight} />
        ) : view === 'skills' ? (
          <SkillsView skills={ctl.getSkills()} bodyHeight={bodyHeight} />
        ) : view === 'specialists' ? (
          <SpecialistsView specialists={ctl.getSpecialists()} bodyHeight={bodyHeight} />
        ) : view === 'help' ? (
          <HelpView bodyHeight={bodyHeight} />
        ) : agents.length === 0 ? (
          <Box borderStyle="single" borderColor="gray" flexDirection="column" paddingX={1}>
            <Text color="gray">{t('main.empty')}</Text>
          </Box>
        ) : focused ? (
          <Box flexDirection="column">
            <AgentTranscript agent={focused} logs={visibleLogs} raw={rawLogs} scrolled={clampedScroll} cols={cols} />
            {!focusFollowTail ? <Text color={UI.warn}>Viewing older · PgDn to latest</Text> : null}
          </Box>
        ) : (
          <AgentHub agents={agents} ctl={ctl} cols={cols} scroll={clampedHub} visibleRows={hubRows} />
        )}
      </Box>

      {/* system messages */}
      {systemLines.length > 0 && !settingsOpen && (
        <Box flexDirection="column">
          {agents.length > 0 ? <Text color={UI.muted} bold>Session</Text> : null}
          {(agents.length > 0
            ? systemLines
                .filter((l) => !/^Ready|^Type a task|^⚡ Ready|^Default \/task|^Agent .* launched/.test(l.text))
                .slice(-2)
            : systemLines
          ).flatMap((l, i) => {
            const levelColor =
              l.level === 'ok' ? UI.ok :
              l.level === 'warn' ? UI.warn :
              l.level === 'error' ? UI.danger :
              'gray';
            // Split on \n so multiline i18n messages render correctly (Ink <Text> doesn't interpret \n).
            const lines = l.text.split('\n');
            return lines.map((line, j) => (
              <Text key={`${i}-${j}`} color={levelColor} wrap="truncate-end">{line}</Text>
            ));
          })}
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
        placeholder={focus ? `Message ${focus} or /command` : 'Task mode: describe work to run · /ask question · /plan proposal · / for commands'}
        context={focus ? 'focus' : 'hub'}
        targetAgent={focused?.name}
        modelLabel={ctl.sessionProvider() ? `${ctl.sessionProvider()?.name}:${ctl.session.model}` : undefined}
        agentNames={agentNames}
        agents={agents}
        onSubmit={onInput}
        onEscape={onEscape}
        notify={notify}
      />
      <Text> </Text>
      {/* ── Footer (1-2 conditional lines per §6.2) ── */}
      <Box flexDirection="column">
        {/* Line 1: Command hints — only when no agents exist */}
        {agents.length === 0 ? (
          <Text>
            <Text color={BRAND.muted}>/ask /task /plan</Text>
            <Text color={CHROME.muted}> · Tab autocompletes · Esc clears</Text>
          </Text>
        ) : null}
        {/* Line 2: Session status — always shown */}
        <Text>
          <Text color={CHROME.muted}>⌘ Parallel</Text>
          <Text color={CHROME.muted}> · Shell </Text>
          <Text color={
            ctl.session.approvalMode === 'ask' ? UI.warn :
            ctl.session.approvalMode === 'yolo' ? UI.danger :
            UI.ok
          }>{ctl.session.approvalMode === 'auto-safe' ? 'auto' : ctl.session.approvalMode}</Text>
          <Text color={CHROME.muted}> · Sessions: {Controller.listSessions(ctl.projectRoot).length}</Text>
          {ctl.questions.length > 0 ? (
            <Text color={UI.warn}> · ❓{ctl.questions.length}</Text>
          ) : null}
          {ctl.approvals.length > 0 ? (
            <Text color={UI.warn}> · ⏳{ctl.approvals.length}</Text>
          ) : null}
          {focused ? (
            <Text color={BRAND.muted}> · 🎯 {focused.name}</Text>
          ) : null}
        </Text>
      </Box>
    </Box>
  );
}

function groupAgents(agents: AgentInfo[]): { title: string; color: string; agents: AgentInfo[] }[] {
  const needs = agents.filter((a) => ['waiting', 'paused'].includes(a.state));
  const working = agents.filter((a) => ['working', 'thinking', 'listening', 'idle'].includes(a.state));
  const errors = agents.filter((a) => ['error', 'stopped'].includes(a.state));
  const completed = agents.filter((a) => a.state === 'done');
  return [
    { title: 'Needs input', color: UI.warn, agents: needs },
    { title: 'Working', color: UI.accent, agents: working },
    { title: 'Errors', color: UI.danger, agents: errors },
    { title: 'Completed', color: UI.ok, agents: completed },
  ].filter((g) => g.agents.length > 0);
}

function AgentHub({
  agents,
  ctl,
  cols,
  scroll,
  visibleRows,
}: {
  agents: AgentInfo[];
  ctl: Controller;
  cols: number;
  scroll: number;
  visibleRows: number;
}) {
  const groups = groupAgents([...agents].sort((a, b) => STATE_META[a.state].rank - STATE_META[b.state].rank || a.startedAt - b.startedAt));
  let skipped = scroll;
  let renderedAgents = 0;
  let renderedLines = 0;
  const rows: React.ReactNode[] = [];
  let full = false;
  for (const group of groups) {
    for (const agent of group.agents) {
      if (skipped > 0) {
        skipped--;
        continue;
      }
      const needsSeparator = rows.length > 0;
      const neededLines = 2 + (needsSeparator ? 1 : 0);
      if (renderedLines + neededLines > visibleRows) {
        full = true;
        break;
      }
      if (needsSeparator) {
        rows.push(
          <Text key={`sep-${group.title}-${agent.id}`} color={CHROME.separator}>{'─'.repeat(cols - 2)}</Text>,
        );
        renderedLines++;
      }
      renderedAgents++;
      renderedLines += 2;
      rows.push(
        <AgentRow key={agent.id} agent={agent} logs={ctl.board.logsFor(agent.id, 8)} cols={cols} />,
      );
    }
    if (full) break;
  }
  const below = Math.max(0, agents.length - scroll - renderedAgents);
  return (
    <Box flexDirection="column">
      {scroll > 0 ? <Text color={CHROME.muted}>▲ {scroll} older · PgDn to latest</Text> : null}
      {rows}
      {below > 0 ? <Text color={CHROME.muted}>▼ {below} more · PgUp</Text> : null}
    </Box>
  );
}
