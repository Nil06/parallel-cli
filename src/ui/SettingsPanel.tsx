import React, { useState } from 'react';
import { Box, Text } from 'ink';
import { Controller } from '../controller.js';
import { createSkillTemplate, createSpecialistTemplate } from '../skills.js';
import { priceFor } from '../pricing.js';
import { SelectList as BaseSelectList, type SelectItem } from './Wizard.js';
import { LANGS, getLang, setLang, t } from '../i18n.js';
import { detectProviderModels, isLocalProvider, isPlaceholderModel, providerNeedsApiKey, PROVIDER_PRESETS } from '../config.js';
import type { Lang, ProviderConfig, ShellApprovalMode } from '../types.js';
import { BRAND } from './tokens.js';

type Step =
  | { id: 'root' }
  | { id: 'lang' }
  | { id: 'pickProvider'; next: 'model' | 'key' | 'prices' | 'models' }
  | { id: 'model'; provider: ProviderConfig; custom?: boolean; setup?: boolean }
  | { id: 'endpoint'; provider: ProviderConfig; setup?: boolean }
  | { id: 'editEndpoint'; provider: ProviderConfig; setup?: boolean }
  | { id: 'setupScope'; provider: ProviderConfig }
  | { id: 'modelList'; provider: ProviderConfig }
  | { id: 'key'; provider: ProviderConfig; setup?: boolean }
  | { id: 'priceModel'; provider: ProviderConfig }
  | { id: 'priceValue'; provider: ProviderConfig; model: string }
  | { id: 'newSkill' }
  | { id: 'newSpecialist' }
  | { id: 'newName' }
  | { id: 'newUrl'; name: string }
  | { id: 'newModel'; name: string; url: string }
  | { id: 'newKey'; name: string; url: string; model: string }
  | { id: 'providers'; scope: 'global' | 'session' }
  | { id: 'providerDetail'; provider: ProviderConfig; scope: 'global' | 'session' }
  | { id: 'removeProvider'; provider: ProviderConfig; scope: 'global' | 'session' };

function masked(key: string): string {
  if (!key) return '—';
  return '••••' + key.slice(-4);
}

function nextApprovalMode(mode: ShellApprovalMode): ShellApprovalMode {
  if (mode === 'ask') return 'auto-safe';
  if (mode === 'auto-safe') return 'yolo';
  return 'ask';
}

/** Derive a status badge string for a provider in the submenu list. */
function providerStatus(p: ProviderConfig, defaultName: string): string {
  if (p.name.toLowerCase() === defaultName.toLowerCase()) return t('set.status.default');
  if (!providerNeedsApiKey(p)) return t('set.status.local');
  if (p.apiKey) return masked(p.apiKey);
  return t('set.status.noKey');
}

/**
 * /settings        → scope 'global'  : persisted in ~/.parallel/config.json
 * /settings-session → scope 'session' : this session only, never persisted
 */
export function SettingsPanel({
  ctl,
  scope,
  height,
  onClose,
}: {
  ctl: Controller;
  scope: 'global' | 'session';
  height?: number;
  onClose: () => void;
}) {
  const [step, setStep] = useState<Step>({ id: 'root' });
  const [returnStep, setReturnStep] = useState<Step | null>(null);
  const [flash, setFlash] = useState('');

  const saved = () => setFlash(t('set.saved'));
  const cfg = ctl.config;
  const listHeight = height ? Math.max(3, height - 5) : undefined;
  const goBack = () => {
    if (step.id === 'root') return onClose();
    setStep(returnStep ?? { id: 'root' });
    setReturnStep(null);
  };
  const SelectList = (props: React.ComponentProps<typeof BaseSelectList>) => {
    const { onBack, ...rest } = props;
    return <BaseSelectList {...rest} onBack={onBack ?? goBack} />;
  };

  // ---- root menu items ----

  const rootItems: SelectItem[] =
    scope === 'global'
      ? [
          { label: t('set.language', { lang: LANGS.find((l) => l.code === getLang())?.label ?? getLang() }), value: 'lang' },
          {
            label: t('set.defaultPM', {
              pm: cfg.defaultProvider
                ? `${cfg.defaultProvider}:${cfg.providers.find((p) => p.name === cfg.defaultProvider)?.defaultModel ?? '?'}`
                : '—',
            }),
            value: 'defaultPM',
          },
          { label: t('set.providers'), value: 'providers' },
          { label: t('set.approvals', { mode: cfg.approvalMode }), value: 'approvals' },
          { label: t('set.sound', { state: cfg.soundEnabled ? 'on' : 'off' }), value: 'sound' },
          { label: t('set.newSkill'), value: 'newSkill' },
          { label: t('set.newSpecialist'), value: 'newSpecialist' },
          { label: t('set.back'), value: 'back' },
        ]
      : [
          {
            label: t('sset.model', { pm: `${ctl.session.providerName || '—'}:${ctl.session.model || '—'}` }),
            value: 'providers',
          },
          { label: t('sset.approvals', { mode: ctl.session.approvalMode }), value: 'approvals' },
          { label: t('sset.sound', { state: ctl.session.soundEnabled ? 'on' : 'off' }), value: 'sound' },
          { label: t('set.back'), value: 'back' },
        ];

  // ---- root menu handler ----

  const chooseRoot = (v: string) => {
    setFlash('');
    if (v === 'back') return onClose();
    if (v === 'lang') return setStep({ id: 'lang' });
    if (v === 'defaultPM') return setStep({ id: 'pickProvider', next: 'model' });
    if (v === 'providers') return setStep({ id: 'providers', scope });
    if (v === 'newSkill') return setStep({ id: 'newSkill' });
    if (v === 'newSpecialist') return setStep({ id: 'newSpecialist' });
    if (v === 'approvals') {
      if (scope === 'global') ctl.setGlobalApprovalMode(nextApprovalMode(cfg.approvalMode));
      else ctl.setSessionApprovalMode(nextApprovalMode(ctl.session.approvalMode));
      if (scope === 'global') saved();
      return;
    }
    if (v === 'sound') {
      if (scope === 'global') ctl.setGlobalSound(!cfg.soundEnabled);
      else ctl.setSessionSound(!ctl.session.soundEnabled);
      if (scope === 'global') saved();
      return;
    }
  };

  // ---- shared helpers ----

  const pickModel = (provider: ProviderConfig, model: string) => {
    if (isPlaceholderModel(model)) {
      setFlash(t('set.modelPlaceholder'));
      return;
    }
    if (step.id === 'model' && step.setup) {
      provider.defaultModel = model;
      if (!provider.models.includes(model)) provider.models.push(model);
      setStep({ id: 'endpoint', provider, setup: true });
      return;
    }
    if (scope === 'global') {
      provider.defaultModel = model;
      if (!provider.models.includes(model)) provider.models.push(model);
      ctl.saveProvider(provider);
      ctl.setDefaultProvider(provider.name);
      saved();
    } else {
      ctl.setSessionModel(`${provider.name}:${model}`);
    }
    setStep(returnStep ?? { id: 'root' });
    setReturnStep(null);
  };

  const finishProviderSetup = (provider: ProviderConfig, persist = scope === 'global') => {
    if (persist) {
      ctl.saveProvider(provider);
      if (scope === 'global') {
        ctl.setDefaultProvider(provider.name);
        saved();
      } else {
        ctl.setSessionModel(`${provider.name}:${provider.defaultModel || provider.models[0] || ''}`);
        setFlash(t('set.saved'));
      }
    } else {
      ctl.setSessionProviderConfig(provider);
      setFlash(t('set.sessionProviderReady', { name: provider.name }));
    }
    setStep(returnStep ?? { id: 'providers', scope });
    setReturnStep(null);
  };

  // ---- navigate into a sub-step, remembering where to return ----

  const goSub = (next: Step) => {
    setReturnStep(step);
    setStep(next);
  };

  // ---- render ----

  return (
    <Box borderStyle="round" borderColor={BRAND.muted} flexDirection="column" paddingX={1}>
      <Text bold color={BRAND.primary}>
        {scope === 'global' ? t('set.title') : t('sset.title')}
      </Text>
      {flash ? <Text color="green">{flash}</Text> : null}
      <Box flexDirection="column" marginTop={1}>
        {/* ---- root ---- */}
        {step.id === 'root' && <SelectList items={rootItems} height={listHeight} onSelect={chooseRoot} />}

        {/* ---- language ---- */}
        {step.id === 'lang' && (
          <SelectList
            items={LANGS.map((l) => ({ label: l.label, value: l.code }))}
            height={listHeight}
            onSelect={(code) => {
              setLang(code as Lang);
              ctl.setLanguage(code as Lang);
              saved();
              setStep({ id: 'root' });
            }}
          />
        )}

        {/* ---- pickProvider (for default provider flow) ---- */}
        {step.id === 'pickProvider' && (
          <>
            <Text color="gray">{t('set.chooseProvider')}</Text>
            <SelectList
              items={[
                ...cfg.providers.map((p) => ({ label: p.name, value: p.name, hint: `(${p.baseUrl})` })),
                { label: t('set.back'), value: '__back__' },
              ]}
              height={listHeight}
              onSelect={(v) => {
                if (v === '__back__') return setStep({ id: 'root' });
                const p = cfg.providers.find((x) => x.name === v);
                if (!p) return;
                if (step.next === 'prices') return setStep({ id: 'priceModel', provider: p });
                if (step.next === 'models') return setStep({ id: 'modelList', provider: p });
                setStep({ id: 'model', provider: p });
              }}
            />
          </>
        )}

        {/* ---- model (pick a model for a provider) ---- */}
        {step.id === 'model' && (
          <>
            <Text color="gray">{t('set.chooseModel', { name: step.provider.name })}</Text>
            <SelectList
              items={[
                ...step.provider.models.map((m) => ({
                  label: m,
                  value: m,
                  hint: m === step.provider.defaultModel ? t('wiz.model.default') : undefined,
                })),
                { label: t('set.back'), value: '__back__' },
              ]}
              height={listHeight}
              allowInput
              inputPlaceholder={t('wiz.provider.model.ph')}
              onSelect={(v) => {
                if (v === '__back__') {
                  setStep(returnStep ?? { id: 'root' });
                  setReturnStep(null);
                  return;
                }
                pickModel(step.provider, v);
              }}
              onInput={(m) => pickModel(step.provider, m)}
            />
          </>
        )}

        {/* ---- endpoint (review preset/custom endpoint before saving) ---- */}
        {step.id === 'endpoint' && (
          <>
            <Text color="gray">{t('wiz.provider.endpoint.title', { name: step.provider.name })}</Text>
            <Text color="gray">{step.provider.baseUrl}</Text>
            <Text color="gray">{t('wiz.provider.endpoint.model', { model: step.provider.defaultModel || step.provider.models[0] || '—' })}</Text>
            <SelectList
              items={[
                { label: t('wiz.provider.endpoint.use'), value: 'use' },
                { label: t('wiz.provider.endpoint.edit'), value: 'edit' },
                { label: t('set.back'), value: '__back__' },
              ]}
              height={listHeight}
              onSelect={(v) => {
                if (v === '__back__') {
                  setStep({ id: 'model', provider: step.provider, setup: step.setup });
                  return;
                }
                if (v === 'edit') return setStep({ id: 'editEndpoint', provider: step.provider, setup: step.setup });
                if (step.setup) {
                  if (providerNeedsApiKey(step.provider)) return setStep({ id: 'key', provider: step.provider, setup: true });
                  if (scope === 'session') return setStep({ id: 'setupScope', provider: step.provider });
                  finishProviderSetup(step.provider);
                  return;
                }
                ctl.saveProvider(step.provider);
                saved();
                setStep(returnStep ?? { id: 'providerDetail', provider: step.provider, scope });
                setReturnStep(null);
              }}
            />
          </>
        )}

        {/* ---- setupScope (session setup: choose temporary vs global save) ---- */}
        {step.id === 'setupScope' && (
          <>
            <Text color="gray">{t('set.setupScope.title', { name: step.provider.name })}</Text>
            <SelectList
              items={[
                { label: t('set.setupScope.session'), value: 'session' },
                { label: t('set.setupScope.global'), value: 'global' },
                { label: t('set.back'), value: '__back__' },
              ]}
              height={listHeight}
              onSelect={(v) => {
                if (v === '__back__') return setStep({ id: 'endpoint', provider: step.provider, setup: true });
                finishProviderSetup(step.provider, v === 'global');
              }}
            />
          </>
        )}

        {/* ---- edit endpoint ---- */}
        {step.id === 'editEndpoint' && (
          <>
            <Text color="gray">{t('wiz.provider.url.title')}</Text>
            <SelectList
              items={[]}
              height={listHeight}
              allowInput
              inputPlaceholder={step.provider.baseUrl}
              onInput={(url) => {
                const provider = { ...step.provider, baseUrl: url.trim() };
                setStep({ id: 'endpoint', provider, setup: step.setup });
              }}
            />
          </>
        )}

        {/* ---- modelList (manage models for a provider) ---- */}
        {step.id === 'modelList' && (
          <>
            <Text color="gray">{t('set.modelsFor', { name: step.provider.name })}</Text>
            <SelectList
              items={[
                ...step.provider.models.map((m) => ({
                  label: m,
                  value: m,
                  hint: m === step.provider.defaultModel ? t('wiz.model.default') : t('set.makeDefault'),
                })),
                { label: t('set.back'), value: '__back__' },
              ]}
              height={listHeight}
              allowInput
              inputPlaceholder={t('set.addModelName')}
              onSelect={(v) => {
                if (v === '__back__') {
                  setStep(returnStep ?? { id: 'root' });
                  setReturnStep(null);
                  return;
                }
                step.provider.defaultModel = v;
                ctl.saveProvider(step.provider);
                ctl.setDefaultProvider(step.provider.name);
                saved();
                setStep(returnStep ?? { id: 'root' });
                setReturnStep(null);
              }}
              onInput={(m) => {
                const model = m.trim();
                if (!model) return;
                if (!step.provider.models.includes(model)) step.provider.models.push(model);
                step.provider.defaultModel = model;
                ctl.saveProvider(step.provider);
                ctl.setDefaultProvider(step.provider.name);
                saved();
                setStep(returnStep ?? { id: 'root' });
                setReturnStep(null);
              }}
            />
          </>
        )}

        {/* ---- priceModel (pick a model to set pricing for) ---- */}
        {step.id === 'priceModel' && (
          <>
            <Text color="gray">{t('set.priceModel', { name: step.provider.name })}</Text>
            <SelectList
              items={[
                ...step.provider.models.map((m) => {
                  const pr = priceFor(step.provider, m);
                  return {
                    label: m,
                    value: m,
                    hint: pr
                      ? `($${pr.input}/M in · $${pr.output}/M out${step.provider.prices?.[m] ? ' — override' : ''})`
                      : `(${t('set.priceUnknown')})`,
                  };
                }),
                { label: t('set.back'), value: '__back__' },
              ]}
              height={listHeight}
              allowInput
              inputPlaceholder={t('wiz.provider.model.ph')}
              onSelect={(v) => {
                if (v === '__back__') {
                  setStep(returnStep ?? { id: 'root' });
                  setReturnStep(null);
                  return;
                }
                goSub({ id: 'priceValue', provider: step.provider, model: v });
              }}
              onInput={(m) => goSub({ id: 'priceValue', provider: step.provider, model: m.trim() })}
            />
          </>
        )}

        {/* ---- priceValue (enter input/output prices) ---- */}
        {step.id === 'priceValue' && (
          <>
            <Text color="gray">{t('set.priceValue', { model: step.model })}</Text>
            <SelectList
              items={[]}
              height={listHeight}
              allowInput
              inputPlaceholder="0.27, 1.10"
              onInput={(v) => {
                const m = v.match(/^\s*([\d.]+)\s*[,;\s]\s*([\d.]+)\s*$/);
                if (!m) return setFlash(t('set.priceBad'));
                step.provider.prices = {
                  ...step.provider.prices,
                  [step.model]: { input: parseFloat(m[1]), output: parseFloat(m[2]) },
                };
                ctl.saveProvider(step.provider);
                saved();
                setStep(returnStep ?? { id: 'root' });
                setReturnStep(null);
              }}
            />
          </>
        )}

        {/* ---- key (set API key for a provider) ---- */}
        {step.id === 'key' && (
          <>
            <Text color="gray">{t('wiz.provider.key.title', { name: step.provider.name })}</Text>
            <SelectList
              items={[]}
              height={listHeight}
              allowInput
              mask
              inputPlaceholder="sk-…"
              onInput={(k) => {
                const provider = { ...step.provider, apiKey: k.trim() };
                if (step.setup) {
                  if (scope === 'session') {
                    setStep({ id: 'setupScope', provider });
                    return;
                  }
                  finishProviderSetup(provider);
                  return;
                } else {
                  ctl.saveProvider(provider);
                  saved();
                }
                setStep(returnStep ?? { id: 'root' });
                setReturnStep(null);
              }}
            />
          </>
        )}

        {/* ---- new provider creation flow ---- */}
        {step.id === 'newName' && (
          <>
            <Text color="gray">{t('wiz.provider.name.title')}</Text>
            <SelectList
              items={[]}
              height={listHeight}
              allowInput
              inputPlaceholder={t('wiz.provider.name.ph')}
              onInput={(name) => setStep({ id: 'newUrl', name })}
            />
          </>
        )}
        {step.id === 'newUrl' && (
          <>
            <Text color="gray">{t('wiz.provider.url.title')}</Text>
            <SelectList
              items={[]}
              height={listHeight}
              allowInput
              inputPlaceholder={t('wiz.provider.url.ph')}
              onInput={(url) => setStep({ id: 'newModel', name: step.name, url })}
            />
          </>
        )}
        {step.id === 'newModel' && (
          <>
            <Text color="gray">{t('wiz.provider.model.title')}</Text>
            <SelectList
              items={[]}
              height={listHeight}
              allowInput
              inputPlaceholder={t('wiz.provider.model.ph')}
              onInput={(model) => {
                const trimmed = model.trim();
                if (isPlaceholderModel(trimmed)) {
                  setFlash(t('set.modelPlaceholder'));
                  return;
                }
                const local = isLocalProvider({ baseUrl: step.url });
                setStep({
                  id: 'endpoint',
                  setup: true,
                  provider: {
                    name: step.name,
                    baseUrl: step.url,
                    apiKey: '',
                    models: [trimmed],
                    defaultModel: trimmed,
                    requiresApiKey: !local,
                  },
                });
              }}
            />
          </>
        )}
        {step.id === 'newKey' && (
          <>
            <Text color="gray">{t('wiz.provider.key.title', { name: step.name })}</Text>
            <SelectList
              items={[]}
              height={listHeight}
              allowInput
              mask
              inputPlaceholder="sk-…"
              onInput={(key) => finishProviderSetup({ name: step.name, baseUrl: step.url, apiKey: key.trim(), models: [step.model], defaultModel: step.model })}
            />
          </>
        )}

        {/* ---- newSkill / newSpecialist ---- */}
        {step.id === 'newSkill' && (
          <>
            <Text color="gray">{t('set.newSkillName')}</Text>
            <SelectList
              items={[]}
              height={listHeight}
              allowInput
              inputPlaceholder="review, deploy, tests…"
              onInput={(name) => {
                try {
                  const file = createSkillTemplate(name.trim(), '', 'global', ctl.projectRoot);
                  setFlash(t('m.skillCreated', { file }));
                } catch (e: any) {
                  setFlash(t('m.alreadyExists', { msg: e?.message ?? '' }));
                }
                setStep({ id: 'root' });
              }}
            />
          </>
        )}
        {step.id === 'newSpecialist' && (
          <>
            <Text color="gray">{t('set.newSpecialistName')}</Text>
            <SelectList
              items={[]}
              height={listHeight}
              allowInput
              inputPlaceholder="reviewer, architect, tester…"
              onInput={(name) => {
                try {
                  const file = createSpecialistTemplate(name.trim(), '', 'global', ctl.projectRoot);
                  setFlash(t('m.specCreated', { file }));
                } catch (e: any) {
                  setFlash(t('m.alreadyExists', { msg: e?.message ?? '' }));
                }
                setStep({ id: 'root' });
              }}
            />
          </>
        )}

        {/* ---- providers submenu ---- */}
        {step.id === 'providers' && (
          <>
            <Text color="gray">
              {step.scope === 'global' ? t('set.providers.title') : t('sset.providers.title')}
            </Text>
            <SelectList
              items={(() => {
                const configuredNames = new Set(cfg.providers.map((p) => p.name.toLowerCase()));
                const items: SelectItem[] = [];

                // Section: Configured
                if (cfg.providers.length > 0) {
                  items.push({ label: t('wiz.provider.section.configured'), value: '', section: true });
                  for (const p of cfg.providers) {
                    items.push({
                      label: p.name,
                      value: p.name,
                      detail: providerStatus(p, cfg.defaultProvider),
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
                      label: preset.name,
                      value: `__preset__${preset.name}`,
                      detail,
                    });
                  }
                }

                // Custom provider
                items.push({ label: t('wiz.provider.custom'), value: '__add__' });
                items.push({
                  label: step.scope === 'global' ? t('set.providers.back') : t('sset.providers.back'),
                  value: '__back__',
                });

                return items;
              })()}
              height={listHeight}
              onSelect={(v) => {
                if (v === '__back__') return setStep({ id: 'root' });
                if (v === '__add__') {
                  setReturnStep({ id: 'providers', scope: step.scope });
                  return setStep({ id: 'newName' });
                }

                // Preset selection (e.g. __preset__Anthropic)
                if (v.startsWith('__preset__')) {
                  const presetName = v.slice('__preset__'.length);
                  const preset = PROVIDER_PRESETS.find((p) => p.name === presetName);
                  if (!preset) return;

                  if (preset.category === 'local') {
                    setFlash(t('wiz.provider.ollama.checking', { url: preset.baseUrl }));
                    void (async () => {
                      const detected = await detectProviderModels(preset);
                      setFlash(
                        detected
                          ? t('wiz.provider.ollama.found', { n: detected.models.length })
                          : t('wiz.provider.ollama.notFound', { url: preset.baseUrl }),
                      );
                      setReturnStep({ id: 'providers', scope: step.scope });
                      setStep({
                        id: 'model',
                        provider: {
                          ...preset,
                          apiKey: 'local',
                          models: detected?.models ?? [...preset.models],
                          defaultModel: detected?.defaultModel ?? preset.defaultModel,
                        },
                        setup: true,
                      });
                    })();
                    return;
                  }

                  // Preset setup: choose model, review endpoint, then ask for API key if needed.
                  setReturnStep({ id: 'providers', scope: step.scope });
                  return setStep({ id: 'model', provider: { ...preset, models: [...preset.models] }, setup: true });
                }

                // Existing configured provider
                const p = cfg.providers.find((x) => x.name === v);
                if (!p) return;
                if (step.scope === 'session') {
                  setReturnStep({ id: 'root' });
                  setStep({ id: 'model', provider: p });
                } else {
                  setStep({ id: 'providerDetail', provider: p, scope: 'global' });
                }
              }}
            />
          </>
        )}

        {/* ---- providerDetail (per-provider actions) ---- */}
        {step.id === 'providerDetail' && (
          <>
            <Text color="gray">{t('set.providerDetail.title', { name: step.provider.name })}</Text>
            <SelectList
              items={[
                {
                  label: t('set.providerDetail.key'),
                  value: 'key',
                  hint: masked(step.provider.apiKey),
                },
                ...(step.provider.apiKey
                  ? [
                      {
                        label: t('set.providerDetail.clearKey'),
                        value: 'clearKey',
                      },
                    ]
                  : []),
                {
                  label: t('set.providerDetail.endpoint'),
                  value: 'endpoint',
                  hint: `(${step.provider.baseUrl})`,
                },
                {
                  label: t('set.providerDetail.models'),
                  value: 'models',
                  hint: `(${step.provider.models.length})`,
                },
                { label: t('set.providerDetail.pricing'), value: 'pricing' },
                {
                  label: t('set.providerDetail.setDefault'),
                  value: 'setDefault',
                  hint:
                    step.provider.name.toLowerCase() === cfg.defaultProvider.toLowerCase()
                      ? `(${t('set.status.default')})`
                      : undefined,
                },
                { label: t('set.providerDetail.remove'), value: 'remove' },
                { label: t('set.providerDetail.back'), value: '__back__' },
              ]}
              height={listHeight}
              onSelect={(v) => {
                if (v === '__back__') return setStep({ id: 'providers', scope: step.scope });
                if (v === 'key') {
                  setReturnStep({ id: 'providerDetail', provider: step.provider, scope: step.scope });
                  return setStep({ id: 'key', provider: step.provider });
                }
                if (v === 'clearKey') {
                  ctl.saveProvider({ ...step.provider, apiKey: '' });
                  saved();
                  return setStep({ id: 'providerDetail', provider: { ...step.provider, apiKey: '' }, scope: step.scope });
                }
                if (v === 'endpoint') {
                  setReturnStep({ id: 'providerDetail', provider: step.provider, scope: step.scope });
                  return setStep({ id: 'endpoint', provider: step.provider });
                }
                if (v === 'models') {
                  setReturnStep({ id: 'providerDetail', provider: step.provider, scope: step.scope });
                  return setStep({ id: 'modelList', provider: step.provider });
                }
                if (v === 'pricing') {
                  setReturnStep({ id: 'providerDetail', provider: step.provider, scope: step.scope });
                  return setStep({ id: 'priceModel', provider: step.provider });
                }
                if (v === 'setDefault') {
                  ctl.setDefaultProvider(step.provider.name);
                  saved();
                  return setStep({ id: 'providers', scope: step.scope });
                }
                if (v === 'remove')
                  return setStep({ id: 'removeProvider', provider: step.provider, scope: step.scope });
              }}
            />
          </>
        )}

        {/* ---- removeProvider confirmation ---- */}
        {step.id === 'removeProvider' && (
          <>
            <Text color="gray">{t('set.removeProvider.title', { name: step.provider.name })}</Text>
            <Text color="yellow">{t('set.removeProvider.confirm')}</Text>
            <SelectList
              items={[
                { label: t('set.removeProvider.yes'), value: 'yes' },
                { label: t('set.removeProvider.no'), value: 'no' },
              ]}
              height={listHeight}
              onSelect={(v) => {
                if (v === 'no') return setStep({ id: 'providerDetail', provider: step.provider, scope: step.scope });
                if (v === 'yes') {
                  ctl.removeProvider(step.provider.name);
                  saved();
                  setStep({ id: 'providers', scope: step.scope });
                }
              }}
            />
          </>
        )}
      </Box>
      <Box marginTop={1}>
        <Text color="gray">{t('set.esc')}</Text>
      </Box>
    </Box>
  );
}
