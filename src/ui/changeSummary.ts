import * as Diff from 'diff';
import type { FileChange } from '../types.js';

export interface ChangeStats {
  files: number;
  additions: number;
  deletions: number;
  paths: string[];
}

export function changesForAgent(changes: FileChange[] = [], agentId: string): FileChange[] {
  return changes.filter((change) => change.agentId === agentId);
}

export function summarizeChanges(changes: FileChange[] = []): ChangeStats {
  const paths = [...new Set(changes.map((change) => change.path))];
  let additions = 0;
  let deletions = 0;
  for (const change of changes) {
    const patch = Diff.createPatch(change.path, change.before, change.after, '', '', { context: 0 });
    for (const line of patch.split('\n').slice(4)) {
      if (line.startsWith('+++') || line.startsWith('---')) continue;
      if (line.startsWith('+')) additions++;
      else if (line.startsWith('-')) deletions++;
    }
  }
  return { files: paths.length, additions, deletions, paths };
}

export function formatChangeStats(stats: ChangeStats): string {
  if (stats.files === 0) return 'Aucune modification suivie';
  const fileLabel = `${stats.files} fichier${stats.files === 1 ? '' : 's'}`;
  return `${fileLabel} · +${stats.additions}/-${stats.deletions} · /diff`;
}
