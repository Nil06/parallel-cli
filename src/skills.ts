import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import type { Skill, Specialist } from './types.js';

/**
 * Skills and Specialists are plain markdown files with a tiny frontmatter:
 *
 *   ---
 *   name: review
 *   description: Code review checklist for this project
 *   model: deepseek-reasoner        (specialists only, optional)
 *   ---
 *   ...body (markdown)...
 *
 * Locations (project wins over global on name conflicts):
 *   global : ~/.parallel/skills/*.md         ~/.parallel/specialists/*.md
 *   project: <root>/.parallel/skills/*.md    <root>/.parallel/specialists/*.md
 */

interface FrontMatter {
  fields: Record<string, string>;
  body: string;
}

function parseFrontMatter(raw: string): FrontMatter {
  const m = raw.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/);
  if (!m) return { fields: {}, body: raw.trim() };
  const fields: Record<string, string> = {};
  for (const line of m[1].split(/\r?\n/)) {
    const kv = line.match(/^([A-Za-z][\w-]*)\s*:\s*(.*)$/);
    if (kv) fields[kv[1].toLowerCase()] = kv[2].trim();
  }
  return { fields, body: m[2].trim() };
}

function globalDir(kind: 'skills' | 'specialists'): string {
  return path.join(os.homedir(), '.parallel', kind);
}

function projectDir(projectRoot: string, kind: 'skills' | 'specialists'): string {
  return path.join(projectRoot, '.parallel', kind);
}

function readMarkdownFiles(dir: string): { file: string; raw: string }[] {
  let entries: string[];
  try {
    entries = fs.readdirSync(dir);
  } catch {
    return [];
  }
  const out: { file: string; raw: string }[] = [];
  for (const e of entries) {
    if (!e.endsWith('.md')) continue;
    const file = path.join(dir, e);
    try {
      out.push({ file, raw: fs.readFileSync(file, 'utf8') });
    } catch {
      /* unreadable file — skip */
    }
  }
  return out;
}

/** Load skills: global first, then project (project overrides same-name global). */
export function loadSkills(projectRoot: string): Skill[] {
  const byName = new Map<string, Skill>();
  for (const scope of ['global', 'project'] as const) {
    const dir = scope === 'global' ? globalDir('skills') : projectDir(projectRoot, 'skills');
    for (const { file, raw } of readMarkdownFiles(dir)) {
      const { fields, body } = parseFrontMatter(raw);
      const name = (fields.name || path.basename(file, '.md')).toLowerCase();
      if (!body) continue;
      byName.set(name, {
        name,
        description: fields.description || '',
        body,
        scope,
        file,
      });
    }
  }
  return [...byName.values()].sort((a, b) => a.name.localeCompare(b.name));
}

/** Load specialists: same layering as skills; body is the role definition. */
export function loadSpecialists(projectRoot: string): Specialist[] {
  const byName = new Map<string, Specialist>();
  for (const scope of ['global', 'project'] as const) {
    const dir = scope === 'global' ? globalDir('specialists') : projectDir(projectRoot, 'specialists');
    for (const { file, raw } of readMarkdownFiles(dir)) {
      const { fields, body } = parseFrontMatter(raw);
      const name = (fields.name || path.basename(file, '.md')).toLowerCase();
      if (!body) continue;
      byName.set(name, {
        name,
        description: fields.description || '',
        model: fields.model || undefined,
        role: body,
        scope,
        file,
      });
    }
  }
  return [...byName.values()].sort((a, b) => a.name.localeCompare(b.name));
}

function slug(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9_-]+/g, '-').replace(/^-+|-+$/g, '') || 'unnamed';
}

/** Create a skill template file; returns its path. Throws if it already exists. */
export function createSkillTemplate(
  name: string,
  description: string,
  scope: 'global' | 'project',
  projectRoot: string
): string {
  const dir = scope === 'global' ? globalDir('skills') : projectDir(projectRoot, 'skills');
  fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, `${slug(name)}.md`);
  if (fs.existsSync(file)) throw new Error(`already exists: ${file}`);
  const content = `---
name: ${slug(name)}
description: ${description || 'What this skill is for (used to decide relevance)'}
---

Write here the instructions, conventions or checklists the agent must follow
when this skill is loaded. Plain markdown.
`;
  fs.writeFileSync(file, content, 'utf8');
  return file;
}

/** Create a specialist template file; returns its path. Throws if it already exists. */
export function createSpecialistTemplate(
  name: string,
  description: string,
  scope: 'global' | 'project',
  projectRoot: string,
  model?: string
): string {
  const dir = scope === 'global' ? globalDir('specialists') : projectDir(projectRoot, 'specialists');
  fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, `${slug(name)}.md`);
  if (fs.existsSync(file)) throw new Error(`already exists: ${file}`);
  const content = `---
name: ${slug(name)}
description: ${description || 'What this specialist is good at'}
${model ? `model: ${model}\n` : ''}---

You are a ${name} specialist. Describe here the role, focus areas, constraints
and working style of this specialist. This text is appended to the agent's
system prompt.
`;
  fs.writeFileSync(file, content, 'utf8');
  return file;
}

/** Compact catalog of skills for the agent system prompt (name — description). */
export function skillsCatalog(skills: Skill[]): string {
  if (skills.length === 0) return '';
  return skills.map((s) => `- ${s.name}${s.description ? ` — ${s.description}` : ''}`).join('\n');
}
