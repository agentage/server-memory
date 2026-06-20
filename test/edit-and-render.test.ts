import { describe, expect, it } from 'vitest';
import { call, connect } from './fixtures/mcp.js';
import { tmpVault } from './fixtures/index.js';

// The edit-validation guard branches + the empty/delete render paths - the branches
// the happy-path round-trip tests don't reach.
describe('memory__edit input guards', () => {
  const open = () =>
    connect({ work: { path: tmpVault({ 'n.md': 'hello world' }) } }, { default: 'work' });

  it('str_replace without old_str -> isError', async () => {
    const c = await open();
    try {
      const r = await call(c.client, 'memory__edit', { path: 'n.md', mode: 'str_replace' });
      expect(r.isError).toBe(true);
      expect(r.text).toContain('old_str');
    } finally {
      await c.close();
    }
  });

  it('str_replace with body -> isError', async () => {
    const c = await open();
    try {
      const r = await call(c.client, 'memory__edit', {
        path: 'n.md',
        mode: 'str_replace',
        old_str: 'hello',
        body: 'x',
      });
      expect(r.isError).toBe(true);
    } finally {
      await c.close();
    }
  });

  it('old_str without str_replace mode -> isError', async () => {
    const c = await open();
    try {
      const r = await call(c.client, 'memory__edit', { path: 'n.md', old_str: 'hello' });
      expect(r.isError).toBe(true);
    } finally {
      await c.close();
    }
  });

  it('no body and no frontmatter -> isError', async () => {
    const c = await open();
    try {
      const r = await call(c.client, 'memory__edit', { path: 'n.md' });
      expect(r.isError).toBe(true);
    } finally {
      await c.close();
    }
  });

  it('editing a missing path -> isError (not found)', async () => {
    const c = await open();
    try {
      const r = await call(c.client, 'memory__edit', { path: 'ghost.md', body: 'x' });
      expect(r.isError).toBe(true);
    } finally {
      await c.close();
    }
  });
});

describe('delete + empty render paths', () => {
  it('delete existing succeeds; delete missing -> isError', async () => {
    const c = await connect({ work: { path: tmpVault({ 'd.md': 'bye' }) } }, { default: 'work' });
    try {
      const ok = await call(c.client, 'memory__delete', { path: 'd.md' });
      expect(ok.isError).toBe(false);
      expect(ok.structured).toMatchObject({ deleted: true });
      const miss = await call(c.client, 'memory__delete', { path: 'gone.md' });
      expect(miss.isError).toBe(true);
    } finally {
      await c.close();
    }
  });

  it('empty search and empty list render friendly text', async () => {
    const c = await connect({ work: { path: tmpVault() } }, { default: 'work' });
    try {
      const s = await call(c.client, 'memory__search', { query: 'nothing' });
      expect(s.text).toContain('No memories');
      const l = await call(c.client, 'memory__list', {});
      expect(l.text).toContain('No memories');
    } finally {
      await c.close();
    }
  });
});
