import { spawn } from 'node:child_process';
import process from 'node:process';

let lastSystemBell = 0;

function systemBell(): void {
  const now = Date.now();
  if (now - lastSystemBell < 900) return;
  lastSystemBell = now;
  const script =
    process.platform === 'darwin'
      ? 'command -v afplay >/dev/null 2>&1 && afplay /System/Library/Sounds/Ping.aiff'
      : 'if command -v paplay >/dev/null 2>&1; then paplay /usr/share/sounds/freedesktop/stereo/message.oga; elif command -v aplay >/dev/null 2>&1; then aplay /usr/share/sounds/alsa/Front_Center.wav; fi';
  try {
    const child = spawn('sh', ['-c', script], { stdio: 'ignore', detached: true });
    child.on('error', () => {});
    child.unref();
  } catch {
    /* ignore unavailable shell/audio */
  }
}

export function ringBell(times = 1): void {
  for (let i = 0; i < times; i++) {
    setTimeout(() => {
      try {
        process.stdout.write('\x07');
        process.stderr.write('\x07');
      } catch {
        /* ignore unavailable streams */
      }
      if (i === 0) systemBell();
    }, i * 250);
  }
}
