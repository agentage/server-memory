import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { init } from '@agentage/memory-core';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { call } from './fixtures/mcp.js';

// The whole point: it works out of the box. `init` scaffolds ~/.agentage + a vault,
// then `npx @agentage/server-memory` (here: the built bin) serves it - nothing else.
const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..');
const bin = join(repoRoot, 'dist/bin/server-memory.js');
const tmps: string[] = [];
const mk = (p: string) => {
  const d = mkdtempSync(join(tmpdir(), p));
  tmps.push(d);
  return d;
};

describe('e2e: init, then the stdio server just works', () => {
  beforeAll(() => {
    // @agentage/memory-core resolves from npm (a normal dependency); just build this
    // package so the spawned bin exists.
    execFileSync('npm', ['run', 'build'], { cwd: repoRoot, stdio: 'ignore' });
  }, 60_000);

  afterAll(() => {
    while (tmps.length) rmSync(tmps.pop()!, { recursive: true, force: true });
  });

  it('init scaffolds, the bin serves the vault, and the 6 tools round-trip', async () => {
    const configDir = mk('mcp-e2e-cfg-');
    const vaultPath = mk('mcp-e2e-vault-');

    // 1. one call to set everything up - offline.
    const setup = await init({ configDir, vaultName: 'work', vaultPath });
    expect(setup.createdConfig).toBe(true);

    // 2. spawn the published-style bin against that config; nothing else configured.
    const transport = new StdioClientTransport({
      command: process.execPath,
      args: [bin],
      env: { ...(process.env as Record<string, string>), AGENTAGE_CONFIG_DIR: configDir },
    });
    const client = new Client({ name: 'e2e', version: '0' });
    await client.connect(transport);
    try {
      expect((await client.listTools()).tools).toHaveLength(6);

      const w = await call(client, 'memory__write', {
        path: 'hello.md',
        body: 'first memory, mentions pkce',
      });
      expect(w.isError).toBe(false);

      const r = await call(client, 'memory__read', { path: 'hello.md' });
      expect((r.structured as { body: string }).body).toBe('first memory, mentions pkce');

      const s = await call(client, 'memory__search', { query: 'pkce' });
      expect((s.structured as { results: Array<{ path: string }> }).results[0].path).toBe(
        'hello.md'
      );

      const l = await call(client, 'memory__list', {});
      expect((l.structured as { files: number }).files).toBe(1);
    } finally {
      await client.close();
    }
  }, 30_000);
});
