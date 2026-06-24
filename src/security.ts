import fs from 'node:fs';
import path from 'node:path';

const PRIVATE_DIR = 0o700;
const PRIVATE_FILE = 0o600;

export function ensurePrivateDir(dir: string): void {
  fs.mkdirSync(dir, { recursive: true, mode: PRIVATE_DIR });
  try {
    fs.chmodSync(dir, PRIVATE_DIR);
  } catch {
    // Best effort: some filesystems do not support chmod.
  }
}

export function chmodPrivateFile(file: string): void {
  try {
    fs.chmodSync(file, PRIVATE_FILE);
  } catch {
    // Best effort only.
  }
}

export function chmodPrivateTree(root: string): void {
  if (!fs.existsSync(root)) return;
  const stat = fs.statSync(root);
  if (stat.isDirectory()) {
    try {
      fs.chmodSync(root, PRIVATE_DIR);
    } catch {}
    for (const entry of fs.readdirSync(root, { withFileTypes: true })) {
      chmodPrivateTree(path.join(root, entry.name));
    }
    return;
  }
  if (stat.isFile()) chmodPrivateFile(root);
}

export function writeFileAtomicPrivate(file: string, content: string): void {
  ensurePrivateDir(path.dirname(file));
  const tmp = path.join(path.dirname(file), `.${path.basename(file)}.${process.pid}.${Date.now()}.tmp`);
  let fd: number | undefined;
  try {
    fd = fs.openSync(tmp, 'w', PRIVATE_FILE);
    fs.writeFileSync(fd, content, 'utf8');
    fs.fsyncSync(fd);
    fs.closeSync(fd);
    fd = undefined;
    fs.renameSync(tmp, file);
    chmodPrivateFile(file);
  } finally {
    if (fd !== undefined) {
      try {
        fs.closeSync(fd);
      } catch {}
    }
    try {
      if (fs.existsSync(tmp)) fs.unlinkSync(tmp);
    } catch {}
  }
}

export function appendFilePrivate(file: string, content: string): void {
  ensurePrivateDir(path.dirname(file));
  fs.appendFileSync(file, content, { encoding: 'utf8', mode: PRIVATE_FILE });
  chmodPrivateFile(file);
}

export function writeJsonAtomicPrivate(file: string, value: unknown): void {
  writeFileAtomicPrivate(file, JSON.stringify(value, null, 2));
}

export function sanitizeTerminalText(text: string): string {
  return text
    // OSC sequences, including hyperlinks/window-title changes.
    .replace(/\x1B\][^\x07\x1B]*(?:\x07|\x1B\\)/g, '')
    // CSI sequences.
    .replace(/\x1B\[[0-?]*[ -/]*[@-~]/g, '')
    // Other one-byte ESC sequences.
    .replace(/\x1B[@-Z\\-_]/g, '')
    // C0 controls except tab/newline/carriage return.
    .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '');
}

export function redactPersistedText(text: string): string {
  return text
    .replace(/data:image\/png;base64,[A-Za-z0-9+/=]+/g, 'data:image/png;base64,[redacted]')
    .replace(/([A-Za-z0-9_]*API[_-]?KEY[A-Za-z0-9_]*\s*[:=]\s*)['"]?[A-Za-z0-9._~+/=-]{12,}['"]?/gi, '$1[redacted]')
    .replace(/(sk-[A-Za-z0-9]{16,})/g, '[redacted-api-key]');
}

export function sanitizeForPersistence(text: string): string {
  return redactPersistedText(sanitizeTerminalText(text));
}
