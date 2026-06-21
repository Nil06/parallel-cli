import React, { useState } from 'react';
import { Box, Text } from 'ink';
import { Controller } from '../controller.js';
import { createSkillTemplate, createSpecialistTemplate } from '../skills.js';
import { priceFor } from '../pricing.js';
import { SelectList, type SelectItem } from './Wizard.js';
import { LANGS, getLang, setLang, t } from '../i18n.js';
import type { Lang, ProviderConfig, ShellApprovalMode } from '../types.js';

type Step =
  | { id: 'root' }
  | { id: 'lang' }
  | { id: 'pickProvider'; next: 'model' | 'key' | 'prices' | 'models' }
  | { id: 'model'; provider: ProviderConfig; custom?: boolean }
  | { id: 'modelList'; provider: ProviderConfig }
  | { id: 'key'; provider: ProviderConfig }
  | { id: 'priceModel'; provider: ProviderConfig }
  | { id: 'priceValue'; provider: ProviderConfig; model: string }
  | { id: 'newSkill' }
  | { id: 'newSpecialist' }
  | { id: 'newName' }
  | { id: 'newUrl'; name: string }
  | { id: 'newModel'; name: string; url: string }
  | { id: 'newKey'; name: string; url: string; model: string };

function masked(key: string): string {
  if (!key) return '—';
  return '••••' + key.slice(-4);
}

function nextApprovalMode(mode: ShellApprovalMode): ShellApprovalMode {
  if (mode === 'ask') return 'auto-safe';
  if (mode === 'auto-safe') return 'yolo';
  return 'ask';
}

/**
 * /settings        → scope 'global'  : persisted in ~/.parallel/config.json
 * /settings-session → scope 'session' : this session only, never persisted
 */
export function SettingsPanel({
  ctl,
  scope,
  onClose,
}: {
  ctl: Controller;
  scope: 'global' | 'session';
  onClose: () => void;
}) {
  const [step, setStep] = useState<Step>({ id: 'root' });
  const [flash, setFlash] = useState('');

  const saved = () => setFlash(t('set.saved'));
  const cfg = ctl.config;

  const rootItems: SelectItem[] =
    scope === 'global'
      ? [
          { label: t('set.language', { lang: LANGS.find((l) => l.code === getLang())?.label ?? getLang() }), value: 'lang' },
          {
            label: t('set.defaultPM', {
              pm: cfg.defaultProvider ? `${cfg.defaultProvider}:${cfg.providers.find((p) => p.name === cfg.defaultProvider)?.defaultModel ?? '?'}` : '—',
            }),
            value: 'defaultPM',
          },
          ...cfg.providers.map((p) => ({
            label: t('set.key', { name: p.name, masked: masked(p.apiKey) }),
            value: `key:${p.name}`,
          })),
          { label: t('set.addProvider'), value: 'add' },
          { label: t('set.models'), value: 'models' },
          { label: t('set.prices'), value: 'prices' },
          { label: t('set.newSkill'), value: 'newSkill' },
          { label: t('set.newSpecialist'), value: 'newSpecialist' },
          { label: t('set.approvals', { mode: cfg.approvalMode }), value: 'approvals' },
          { label: t('set.sound', { state: cfg.soundEnabled ? 'on' : 'off' }), value: 'sound' },
          { label: t('set.back'), value: 'back' },
        ]
      : [
          {
            label: t('sset.model', { pm: `${ctl.session.providerName || '—'}:${ctl.session.model || '—'}` }),
            value: 'model',
          },
          { label: t('sset.approvals', { mode: ctl.session.approvalMode }), value: 'approvals' },
          { label: t('sset.sound', { state: ctl.session.soundEnabled ? 'on' : 'off' }), value: 'sound' },
          { label: t('set.back'), value: 'back' },
        ];

  const chooseRoot = (v: string) => {
    setFlash('');
    if (v === 'back') return onClose();
    if (v === 'lang') return setStep({ id: 'lang' });
    if (v === 'defaultPM' || v === 'model') return setStep({ id: 'pickProvider', next: 'model' });
    if (v.startsWith('key:')) {
      const p = cfg.providers.find((x) => x.name === v.slice(4));
      if (p) setStep({ id: 'key', provider: p });
      return;
    }
    if (v === 'add') return setStep({ id: 'newName' });
    if (v === 'models') return setStep({ id: 'pickProvider', next: 'models' });
    if (v === 'prices') return setStep({ id: 'pickProvider', next: 'prices' });
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

  const pickModel = (provider: ProviderConfig, model: string) => {
    if (scope === 'global') {
      provider.defaultModel = model;
      if (!provider.models.includes(model)) provider.models.push(model);
      ctl.saveProvider(provider);
      ctl.setDefaultProvider(provider.name);
      saved();
    } else {
      ctl.setSessionModel(`${provider.name}:${model}`);
    }
    setStep({ id: 'root' });
  };

  const finishNewProvider = (name: string, url: string, model: string, key: string) => {
    ctl.saveProvider({ name, baseUrl: url, apiKey: key, models: [model], defaultModel: model });
    saved();
    setStep({ id: 'root' });
  };

  return (
    <Box borderStyle="round" borderColor="cyan" flexDirection="column" paddingX={1}>
      <Text bold color="cyan">
        {scope === 'global' ? t('set.title') : t('sset.title')}
      </Text>
      {flash ? <Text color="green">{flash}</Text> : null}
      <Box flexDirection="column" marginTop={1}>
        {step.id === 'root' && <SelectList items={rootItems} onSelect={chooseRoot} />}

        {step.id === 'lang' && (
          <SelectList
            items={LANGS.map((l) => ({ label: l.label, value: l.code }))}
            onSelect={(code) => {
              setLang(code as Lang);
              ctl.setLanguage(code as Lang);
              saved();
              setStep({ id: 'root' });
            }}
          />
        )}

        {step.id === 'pickProvider' && (
          <>
            <Text color="gray">{t('set.chooseProvider')}</Text>
            <SelectList
              items={[
                ...cfg.providers.map((p) => ({ label: p.name, value: p.name, hint: `(${p.baseUrl})` })),
                { label: t('set.back'), value: '__back__' },
              ]}
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
              allowInput
              inputPlaceholder={t('set.addModelName')}
              onSelect={(v) => {
                if (v === '__back__') return setStep({ id: 'root' });
                step.provider.defaultModel = v;
                ctl.saveProvider(step.provider);
                ctl.setDefaultProvider(step.provider.name);
                saved();
                setStep({ id: 'root' });
              }}
              onInput={(m) => {
                const model = m.trim();
                if (!model) return;
                if (!step.provider.models.includes(model)) step.provider.models.push(model);
                step.provider.defaultModel = model;
                ctl.saveProvider(step.provider);
                ctl.setDefaultProvider(step.provider.name);
                saved();
                setStep({ id: 'root' });
              }}
            />
          </>
        )}

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
                    hint: pr ? `($${pr.input}/M in · $${pr.output}/M out${step.provider.prices?.[m] ? ' — override' : ''})` : `(${t('set.priceUnknown')})`,
                  };
                }),
                { label: t('set.back'), value: '__back__' },
              ]}
              allowInput
              inputPlaceholder={t('wiz.provider.model.ph')}
              onSelect={(v) => {
                if (v === '__back__') return setStep({ id: 'root' });
                setStep({ id: 'priceValue', provider: step.provider, model: v });
              }}
              onInput={(m) => setStep({ id: 'priceValue', provider: step.provider, model: m.trim() })}
            />
          </>
        )}

        {step.id === 'priceValue' && (
          <>
            <Text color="gray">{t('set.priceValue', { model: step.model })}</Text>
            <SelectList
              items={[]}
              allowInput
              inputPlaceholder="0.27, 1.10"
              onInput={(v) => {
                const m = v.match(/^\s*([\d.]+)\s*[,;\s]\s*([\d.]+)\s*$/);
                if (!m) return setFlash(t('set.priceBad'));
                step.provider.prices = { ...step.provider.prices, [step.model]: { input: parseFloat(m[1]), output: parseFloat(m[2]) } };
                ctl.saveProvider(step.provider);
                saved();
                setStep({ id: 'root' });
              }}
            />
          </>
        )}

        {step.id === 'newSkill' && (
          <>
            <Text color="gray">{t('set.newSkillName')}</Text>
            <SelectList
              items={[]}
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
              allowInput
              inputPlaceholder={t('wiz.provider.model.ph')}
              onSelect={(v) => {
                if (v === '__back__') return setStep({ id: 'root' });
                pickModel(step.provider, v);
              }}
              onInput={(m) => pickModel(step.provider, m)}
            />
          </>
        )}

        {step.id === 'key' && (
          <>
            <Text color="gray">{t('wiz.provider.key.title', { name: step.provider.name })}</Text>
            <SelectList
              items={[]}
              allowInput
              mask
              inputPlaceholder="sk-…"
              onInput={(k) => {
                step.provider.apiKey = k.trim();
                ctl.saveProvider(step.provider);
                saved();
                setStep({ id: 'root' });
              }}
            />
          </>
        )}

        {step.id === 'newName' && (
          <>
            <Text color="gray">{t('wiz.provider.name.title')}</Text>
            <SelectList items={[]} allowInput inputPlaceholder={t('wiz.provider.name.ph')} onInput={(name) => setStep({ id: 'newUrl', name })} />
          </>
        )}
        {step.id === 'newUrl' && (
          <>
            <Text color="gray">{t('wiz.provider.url.title')}</Text>
            <SelectList
              items={[]}
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
              allowInput
              inputPlaceholder={t('wiz.provider.model.ph')}
              onInput={(model) => setStep({ id: 'newKey', name: step.name, url: step.url, model })}
            />
          </>
        )}
        {step.id === 'newKey' && (
          <>
            <Text color="gray">{t('wiz.provider.key.title', { name: step.name })}</Text>
            <SelectList
              items={[]}
              allowInput
              mask
              inputPlaceholder="sk-…"
              onInput={(key) => finishNewProvider(step.name, step.url, step.model, key.trim())}
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
