import { describe, expect, it } from 'vitest';
import { READ_BODY_BUDGET, restrictedMessage } from '@agentage/memory-core';
import { call, connect } from './fixtures/mcp.js';
import { tmpVault } from './fixtures/index.js';

// The engine refuses secrets on write/edit; the MCP layer surfaces the refusal as an
// isError tool result carrying the canonical message (never a raw protocol crash).
describe('secret refusal over MCP', () => {
  it('write with a secret returns isError + the canonical message', async () => {
    const c = await connect({ work: { path: tmpVault() } }, { default: 'work' });
    try {
      const w = await call(c.client, 'memory__write', {
        path: 'creds.md',
        body: 'the key is AKIAIOSFODNN7EXAMPLE, keep it safe',
      });
      expect(w.isError).toBe(true);
      expect(w.text).toBe(restrictedMessage('an API key or access token'));

      // nothing was persisted
      const r = await call(c.client, 'memory__read', { path: 'creds.md' });
      expect(r.isError).toBe(true);
    } finally {
      await c.close();
    }
  });

  it('write with a secret in frontmatter is refused', async () => {
    const c = await connect({ work: { path: tmpVault() } }, { default: 'work' });
    try {
      const w = await call(c.client, 'memory__write', {
        path: 'meta.md',
        body: 'clean body',
        frontmatter: { api_key: 'sk-abcdefghijklmnopqrstuvwxyz012345' },
      });
      expect(w.isError).toBe(true);
      expect(w.text).toBe(restrictedMessage('an API key or access token'));
    } finally {
      await c.close();
    }
  });

  it('edit str_replace injecting a secret is refused, note untouched', async () => {
    const c = await connect(
      { work: { path: tmpVault({ 'n.md': 'placeholder' }) } },
      { default: 'work' }
    );
    try {
      const e = await call(c.client, 'memory__edit', {
        path: 'n.md',
        mode: 'str_replace',
        old_str: 'placeholder',
        new_str: 'password: hunter2secret',
      });
      expect(e.isError).toBe(true);
      expect(e.text).toBe(restrictedMessage('a password or secret value'));

      const r = await call(c.client, 'memory__read', { path: 'n.md' });
      expect((r.structured as { body: string }).body).toBe('placeholder');
    } finally {
      await c.close();
    }
  });

  it('clean write and edit still succeed', async () => {
    const c = await connect({ work: { path: tmpVault() } }, { default: 'work' });
    try {
      const w = await call(c.client, 'memory__write', {
        path: 'ok.md',
        body: 'notes on the login flow',
      });
      expect(w.isError).toBe(false);
      const e = await call(c.client, 'memory__edit', {
        path: 'ok.md',
        mode: 'append',
        body: 'more clean notes',
      });
      expect(e.isError).toBe(false);
    } finally {
      await c.close();
    }
  });
});

// read output is bounded to the engine budget in BOTH channels (text + structuredContent).
describe('read output budget over MCP', () => {
  it('clamps an oversized body and marks it; the stored file stays complete', async () => {
    const big = 'x'.repeat(READ_BODY_BUDGET + 8192);
    const c = await connect({ work: { path: tmpVault({ 'big.md': big }) } }, { default: 'work' });
    try {
      const r = await call(c.client, 'memory__read', { path: 'big.md' });
      const body = (r.structured as { body: string }).body;
      expect(Buffer.byteLength(body, 'utf8')).toBeLessThan(READ_BODY_BUDGET + 512);
      expect(body).toContain('The stored memory file is complete and unchanged.');
      expect(r.text).toContain('The stored memory file is complete and unchanged.');
    } finally {
      await c.close();
    }
  });

  it('returns a small body verbatim (no marker)', async () => {
    const c = await connect(
      { work: { path: tmpVault({ 'small.md': 'tiny note' }) } },
      { default: 'work' }
    );
    try {
      const r = await call(c.client, 'memory__read', { path: 'small.md' });
      expect((r.structured as { body: string }).body).toBe('tiny note');
      expect(r.text).not.toContain('Truncated for display');
    } finally {
      await c.close();
    }
  });
});
