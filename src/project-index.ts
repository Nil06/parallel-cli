import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { writeFileAtomicPrivate } from './security.js';

const INDEX_VERSION = 1 as const;
const IGNORED = new Set(['.git', '.parallel', '.cursor', 'node_modules', 'dist', 'build', 'coverage', '.next']);
const TEXT_EXTENSIONS = new Set([
  '.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs', '.json', '.md', '.py', '.rs', '.go', '.java', '.kt', '.sh', '.yaml', '.yml', '.toml',
]);

export interface IndexedSymbol {
  name: string;
  line: number;
  kind: string;
}

export interface IndexedFile {
  path: string;
  hash: string;
  size: number;
  mtimeMs: number;
  symbols: IndexedSymbol[];
  imports: string[];
  terms: string[];
}

interface ProjectIndexData {
  version: 1;
  generatedAt: string;
  files: IndexedFile[];
}

export interface ProjectIndexStatus {
  files: number;
  symbols: number;
  generatedAt?: string;
}

function hash(content: string): string {
  return crypto.createHash('sha256').update(content).digest('hex').slice(0, 16);
}

function safeTextFile(name: string, size: number): boolean {
  const lower = name.toLowerCase();
  const sensitive = lower === '.env' || lower.startsWith('.env.') || /(^|[._-])(secret|credential|private-key|id_rsa)([._-]|$)/.test(lower);
  return !sensitive && size <= 750_000 && TEXT_EXTENSIONS.has(path.extname(name).toLowerCase());
}

function symbolsOf(content: string): IndexedSymbol[] {
  const out: IndexedSymbol[] = [];
  const patterns = [
    { kind: 'class', re: /\bclass\s+([A-Za-z_$][\w$]*)/g },
    { kind: 'function', re: /\b(?:async\s+)?function\s+([A-Za-z_$][\w$]*)/g },
    { kind: 'type', re: /\b(?:interface|type|enum)\s+([A-Za-z_$][\w$]*)/g },
    { kind: 'export', re: /\bexport\s+(?:const|let|var)\s+([A-Za-z_$][\w$]*)/g },
    { kind: 'method', re: /(?:^|[;{}]\s*)(?:private\s+|public\s+|protected\s+|static\s+|async\s+)*([A-Za-z_$][\w$]*)\s*\([^)]*\)\s*[:{]/gm },
  ];
  for (const { kind, re } of patterns) {
    for (const match of content.matchAll(re)) {
      const index = match.index ?? 0;
      out.push({ name: match[1], line: content.slice(0, index).split('\n').length, kind });
      if (out.length >= 200) return out;
    }
  }
  return out;
}

function importsOf(content: string): string[] {
  const imports = new Set<string>();
  for (const match of content.matchAll(/\b(?:from\s+|import\s*\(|require\s*\()\s*['"]([^'"]+)['"]/g)) imports.add(match[1]);
  return [...imports].slice(0, 100);
}

function termsOf(content: string, relPath: string): string[] {
  const terms = new Set<string>();
  const source = `${relPath} ${content.slice(0, 250_000)}`;
  for (const term of source.match(/[A-Za-z_$][A-Za-z0-9_$-]{2,}/g) ?? []) {
    if (term.length <= 40) terms.add(term.toLowerCase());
    if (terms.size >= 2_000) break;
  }
  return [...terms];
}

export class ProjectIndex {
  private data: ProjectIndexData = { version: INDEX_VERSION, generatedAt: '', files: [] };

  constructor(private projectRoot: string) {
    this.load();
  }

  private file(): string {
    return path.join(this.projectRoot, '.parallel', 'index', 'manifest.json');
  }

  private load(): void {
    try {
      const raw = JSON.parse(fs.readFileSync(this.file(), 'utf8')) as ProjectIndexData;
      if (raw.version === INDEX_VERSION && Array.isArray(raw.files)) this.data = raw;
    } catch {}
  }

  private paths(): string[] {
    const out: string[] = [];
    const walk = (dir: string, depth: number) => {
      if (depth > 10 || out.length > 10_000) return;
      let entries: fs.Dirent[];
      try {
        entries = fs.readdirSync(dir, { withFileTypes: true });
      } catch {
        return;
      }
      for (const entry of entries) {
        if (IGNORED.has(entry.name) || entry.name.startsWith('.env')) continue;
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) walk(full, depth + 1);
        else if (entry.isFile()) {
          try {
            if (safeTextFile(entry.name, fs.statSync(full).size)) out.push(path.relative(this.projectRoot, full));
          } catch {}
        }
      }
    };
    walk(this.projectRoot, 0);
    return out.sort();
  }

  refresh(): ProjectIndexStatus {
    const previous = new Map(this.data.files.map((file) => [file.path, file]));
    const files: IndexedFile[] = [];
    for (const relPath of this.paths()) {
      try {
        const absolute = path.join(this.projectRoot, relPath);
        const stat = fs.statSync(absolute);
        const old = previous.get(relPath);
        if (old?.size === stat.size && old.mtimeMs === stat.mtimeMs) {
          files.push(old);
          continue;
        }
        const content = fs.readFileSync(absolute, 'utf8');
        const currentHash = hash(content);
        if (old?.hash === currentHash) {
          files.push({ ...old, mtimeMs: stat.mtimeMs, size: stat.size });
          continue;
        }
        files.push({
          path: relPath,
          hash: currentHash,
          size: stat.size,
          mtimeMs: stat.mtimeMs,
          symbols: symbolsOf(content),
          imports: importsOf(content),
          terms: termsOf(content, relPath),
        });
      } catch {}
    }
    this.data = { version: INDEX_VERSION, generatedAt: new Date().toISOString(), files };
    writeFileAtomicPrivate(this.file(), JSON.stringify(this.data));
    return this.status();
  }

  status(): ProjectIndexStatus {
    return {
      files: this.data.files.length,
      symbols: this.data.files.reduce((sum, file) => sum + file.symbols.length, 0),
      generatedAt: this.data.generatedAt || undefined,
    };
  }

  retrieve(task = '', limit = 8): string {
    this.refresh();
    const stop = new Set(['the', 'and', 'for', 'with', 'why', 'how', 'does', 'this', 'that', 'dans', 'avec', 'pour', 'une', 'les', 'des']);
    const query = new Set(
      (task.toLowerCase().match(/[a-z_$][a-z0-9_$-]{2,}/g) ?? []).filter((term) => !stop.has(term)).slice(0, 80),
    );
    const ranked = this.data.files
      .map((file) => {
        let score = 0;
        const lowerPath = file.path.toLowerCase();
        for (const term of query) {
          if (lowerPath.includes(term)) score += 8;
          if (file.symbols.some((symbol) => symbol.name.toLowerCase().includes(term))) score += 6;
          if (file.terms.includes(term)) score += 1;
        }
        return { file, score };
      })
      .filter((item) => item.score > 0)
      .sort((a, b) => b.score - a.score || a.file.path.localeCompare(b.file.path))
      .slice(0, limit);
    if (ranked.length === 0) return 'Task-oriented index matches: none. Use one bounded search.';
    const lines = ranked.map(({ file, score }) => {
      const symbols = file.symbols.slice(0, 8).map((symbol) => `${symbol.name}@${symbol.line}`).join(', ');
      let matches = '';
      try {
        const contentLines = fs.readFileSync(path.join(this.projectRoot, file.path), 'utf8').split('\n');
        const excerpts: string[] = [];
        for (let index = 0; index < contentLines.length && excerpts.length < 3; index++) {
          const lower = contentLines[index].toLowerCase();
          if ([...query].some((term) => lower.includes(term))) {
            excerpts.push(`${index + 1}:${contentLines[index].trim().slice(0, 160)}`);
          }
        }
        if (excerpts.length > 0) matches = ` matches: ${excerpts.join(' | ')}`;
      } catch {}
      return `- ${file.path} [score ${score}]${symbols ? ` symbols: ${symbols}` : ''}${matches}`;
    });
    return `TASK-ORIENTED LOCAL INDEX\n${lines.join('\n')}\nStart with these candidates; do not explore unrelated folders.`;
  }
}
