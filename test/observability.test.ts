import { execFileSync, spawn } from 'node:child_process';
import {
  cpSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { init } from '@agentage/memory-core';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

// The regression this file exists to prevent: stdout is the JSON-RPC wire. Whether the optional
// @agentage/observability kit is installed alongside or not, nothing but JSON-RPC may reach it -
// the kit's own lines belong on stderr.
const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..');
const bin = join(repoRoot, 'dist/bin/server-memory.js');
const tmps: string[] = [];
const mk = (p: string): string => {
  const d = mkdtempSync(join(tmpdir(), p));
  tmps.push(d);
  return d;
};

interface Run {
  stdout: string;
  stderr: string;
}

// Drive one initialize + memory__list over raw stdio and capture both streams verbatim.
const runBin = async (
  binPath: string,
  configDir: string,
  env: NodeJS.ProcessEnv = {}
): Promise<Run> => {
  const child = spawn(process.execPath, [binPath], {
    env: { ...process.env, ...env, AGENTAGE_CONFIG_DIR: configDir },
    stdio: ['pipe', 'pipe', 'pipe'],
  });
  const run: Run = { stdout: '', stderr: '' };
  child.stdout.on('data', (d: Buffer) => (run.stdout += d.toString()));
  child.stderr.on('data', (d: Buffer) => (run.stderr += d.toString()));
  const send = (msg: unknown): void => void child.stdin.write(`${JSON.stringify(msg)}\n`);
  send({
    jsonrpc: '2.0',
    id: 1,
    method: 'initialize',
    params: {
      protocolVersion: '2025-06-18',
      capabilities: {},
      clientInfo: { name: 't', version: '0' },
    },
  });
  await new Promise((r) => setTimeout(r, 400));
  send({ jsonrpc: '2.0', method: 'notifications/initialized' });
  send({
    jsonrpc: '2.0',
    id: 2,
    method: 'tools/call',
    params: { name: 'memory__list', arguments: {} },
  });
  await new Promise((r) => setTimeout(r, 1200));
  child.kill();
  return run;
};

const jsonRpcOnly = (stdout: string): boolean =>
  stdout
    .split('\n')
    .filter(Boolean)
    .every((line) => {
      try {
        return (JSON.parse(line) as { jsonrpc?: string }).jsonrpc === '2.0';
      } catch {
        return false;
      }
    });

// A copy of dist beside a node_modules holding every runtime dependency but NOT the kit: exactly
// what a `npx @agentage/server-memory` cold start looks like.
const withoutKit = (): string => {
  const root = mk('sm-nokit-');
  cpSync(join(repoRoot, 'dist'), join(root, 'dist'), { recursive: true });
  writeFileSync(join(root, 'package.json'), '{"type":"module"}');
  const deps = Object.keys(
    (
      JSON.parse(readFileSync(join(repoRoot, 'package.json'), 'utf-8')) as {
        dependencies: Record<string, string>;
      }
    ).dependencies
  );
  for (const dep of deps) {
    const target = join(root, 'node_modules', dep);
    mkdirSync(dirname(target), { recursive: true });
    symlinkSync(join(repoRoot, 'node_modules', dep), target);
  }
  return join(root, 'dist/bin/server-memory.js');
};

describe('optional observability never touches stdout', () => {
  let configDir: string;

  beforeAll(async () => {
    execFileSync('npm', ['run', 'build'], { cwd: repoRoot, stdio: 'ignore' });
    configDir = mk('sm-obs-cfg-');
    await init({ configDir, vaultName: 'work', vaultPath: mk('sm-obs-vault-') });
  }, 60_000);

  afterAll(() => {
    while (tmps.length) rmSync(tmps.pop()!, { recursive: true, force: true });
  });

  it('with the kit installed: JSON-RPC on stdout, the tool event on stderr', async () => {
    const run = await runBin(bin, configDir);
    expect(jsonRpcOnly(run.stdout)).toBe(true);
    const tool = run.stderr
      .split('\n')
      .filter(Boolean)
      .map((l) => JSON.parse(l) as { kind?: string; tool?: string; service?: string });
    expect(tool).toContainEqual(
      expect.objectContaining({
        kind: 'tool',
        tool: 'memory__list',
        service: 'agentage-server-memory',
      })
    );
  }, 30_000);

  it('without the kit installed: JSON-RPC on stdout, a silent skip on stderr', async () => {
    const run = await runBin(withoutKit(), configDir);
    expect(jsonRpcOnly(run.stdout)).toBe(true);
    // initialize + the tool call both answered, so the server really served without the kit
    expect(run.stdout.split('\n').filter(Boolean)).toHaveLength(2);
    expect(run.stderr).toBe('');
  }, 30_000);

  it('without the kit installed: AGENTAGE_DEBUG explains the skip, on stderr', async () => {
    const run = await runBin(withoutKit(), configDir, { AGENTAGE_DEBUG: '1' });
    expect(jsonRpcOnly(run.stdout)).toBe(true);
    expect(run.stderr).toContain('[server-memory] observability off:');
  }, 30_000);
});
