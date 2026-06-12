import { execFileSync } from 'node:child_process';

const PNG_MAGIC = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

function human(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/**
 * Read a PNG image from the system clipboard (Wayland: wl-paste, X11: xclip).
 * Returns a data URI usable in multimodal chat messages, or null if the
 * clipboard holds no image / no tool is available.
 */
export function readClipboardImage(): { dataUri: string; label: string } | null {
  const attempts: [string, string[]][] = [
    ['wl-paste', ['--type', 'image/png']],
    ['xclip', ['-selection', 'clipboard', '-t', 'image/png', '-o']],
  ];
  for (const [cmd, args] of attempts) {
    try {
      const buf = execFileSync(cmd, args, {
        maxBuffer: 32 * 1024 * 1024,
        stdio: ['ignore', 'pipe', 'ignore'],
        timeout: 3000,
      });
      if (buf && buf.length > 8 && buf.subarray(0, 8).equals(PNG_MAGIC)) {
        return { dataUri: `data:image/png;base64,${buf.toString('base64')}`, label: human(buf.length) };
      }
    } catch {
      // tool missing or clipboard not an image — try the next one
    }
  }
  return null;
}
