import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { afterEach } from 'vitest';
import type { VaultEntry } from '@agentage/memory-core';

const created: string[] = [];

afterEach(() => {
  while (created.length) {
    const dir = created.pop();
    if (dir) rmSync(dir, { recursive: true, force: true });
  }
});

const tmp = (prefix: string): string => {
  const dir = mkdtempSync(join(tmpdir(), prefix));
  created.push(dir);
  return dir;
};

const git = (cwd: string, args: string[]): void => {
  execFileSync('git', args, {
    cwd,
    env: {
      ...process.env,
      GIT_AUTHOR_NAME: 'test',
      GIT_AUTHOR_EMAIL: 'test@agentage.io',
      GIT_COMMITTER_NAME: 'test',
      GIT_COMMITTER_EMAIL: 'test@agentage.io',
    },
    stdio: 'ignore',
  });
};

// A temp markdown folder, git-init-ed + all files committed (the realistic synced
// vault state). `files` maps a POSIX path to its full .md content (frontmatter fences
// included). Returns the folder path.
export const tmpVault = (files: Record<string, string> = {}): string => {
  const dir = tmp('mc-vault-');
  git(dir, ['init', '-b', 'main']);
  for (const [path, content] of Object.entries(files)) {
    const abs = join(dir, path);
    mkdirSync(dirname(abs), { recursive: true });
    writeFileSync(abs, content, 'utf8');
  }
  if (Object.keys(files).length) {
    git(dir, ['add', '-A']);
    git(dir, ['commit', '-m', 'seed']);
  }
  return dir;
};

// A temp AGENTAGE_CONFIG_DIR holding a vaults.json built from the given vault map.
// Returns the dir; pass it as loadConfig({ configDir }).
export const tmpConfig = (
  vaults: Record<string, VaultEntry>,
  opts: { default?: string } = {}
): string => {
  const dir = tmp('mc-config-');
  const config = { version: 1, default: opts.default, vaults };
  writeFileSync(join(dir, 'vaults.json'), JSON.stringify(config, null, 2), 'utf8');
  return dir;
};

// Write raw text as vaults.json (for malformed-config tests). Returns the dir.
export const tmpConfigRaw = (raw: string): string => {
  const dir = tmp('mc-config-');
  writeFileSync(join(dir, 'vaults.json'), raw, 'utf8');
  return dir;
};
