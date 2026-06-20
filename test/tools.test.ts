import { describe, expect, it } from 'vitest';
import { call, connect } from './fixtures/mcp.js';
import { tmpVault } from './fixtures/index.js';

// round-trip through MCP tools/call.
describe('tools/call round-trip', () => {
  it('write -> read -> search over the wire', async () => {
    const c = await connect({ work: { path: tmpVault() } }, { default: 'work' });
    try {
      const w = await call(c.client, 'memory__write', {
        path: 'notes/a.md',
        body: 'remember pkce',
        frontmatter: { type: 'note' },
      });
      expect(w.isError).toBe(false);
      expect(w.structured).toMatchObject({ path: 'notes/a.md' });

      const r = await call(c.client, 'memory__read', { path: 'notes/a.md' });
      expect(r.structured).toMatchObject({ body: 'remember pkce', title: 'a' });

      const s = await call(c.client, 'memory__search', { query: 'pkce' });
      expect((s.structured as { results: unknown[] }).results).toHaveLength(1);
    } finally {
      await c.close();
    }
  });
});

// @vault routing + bare path -> default.
describe('routing', () => {
  it('bare path hits default, @vault hits that vault', async () => {
    const c = await connect(
      { work: { path: tmpVault() }, personal: { path: tmpVault() } },
      { default: 'work' }
    );
    try {
      await call(c.client, 'memory__write', { path: 'bare.md', body: 'in work' });
      await call(c.client, 'memory__write', { path: '@personal/p.md', body: 'in personal' });

      // bare.md routed to work; addressable back as @work/bare.md (multi-vault tags)
      const inWork = await call(c.client, 'memory__read', { path: '@work/bare.md' });
      expect((inWork.structured as { body: string }).body).toBe('in work');

      const inPersonal = await call(c.client, 'memory__read', { path: '@personal/p.md' });
      expect((inPersonal.structured as { body: string }).body).toBe('in personal');

      // the bare path does NOT leak into personal
      const miss = await call(c.client, 'memory__read', { path: '@personal/bare.md' });
      expect(miss.isError).toBe(true);
    } finally {
      await c.close();
    }
  });
});

// unknown vault -> isError (no crash).
describe('unknown vault', () => {
  it('returns isError for an unknown @vault', async () => {
    const c = await connect({ work: { path: tmpVault() } }, { default: 'work' });
    try {
      const r = await call(c.client, 'memory__read', { path: '@ghost/x.md' });
      expect(r.isError).toBe(true);
      expect(r.text).toContain('ghost');
    } finally {
      await c.close();
    }
  });
});

// search/list fan out across surfaced vaults and tag each result with @vault.
describe('fan-out tagging', () => {
  it('search fans out and tags hits with @vault', async () => {
    const c = await connect({
      work: { path: tmpVault({ 'a.md': 'shared keyword' }) },
      personal: { path: tmpVault({ 'b.md': 'shared keyword too' }) },
    });
    try {
      const s = await call(c.client, 'memory__search', { query: 'shared' });
      const paths = (s.structured as { results: Array<{ path: string }> }).results
        .map((h) => h.path)
        .sort();
      expect(paths).toEqual(['@personal/b.md', '@work/a.md']);
    } finally {
      await c.close();
    }
  });

  it('list with no folder shows each vault as an @folder', async () => {
    const c = await connect({
      work: { path: tmpVault({ 'a.md': 'x' }) },
      personal: { path: tmpVault({ 'b.md': 'y' }) },
    });
    try {
      const l = await call(c.client, 'memory__list', {});
      const entries = (l.structured as { entries: Array<{ type: string; path: string }> }).entries;
      expect(entries.map((e) => e.path).sort()).toEqual(['@personal', '@work']);
      expect(entries.every((e) => e.type === 'folder')).toBe(true);
    } finally {
      await c.close();
    }
  });
});

// scope surfacing.
describe('scope surfacing', () => {
  it('hides mcp:[] vaults and surfaces only the requested scope', async () => {
    const vaults = {
      shown: { path: tmpVault({ 'a.md': 'visible' }), mcp: ['local' as const] },
      hidden: { path: tmpVault({ 'b.md': 'secret' }), mcp: [] },
    };
    const c = await connect(vaults, { scope: 'local' });
    try {
      // single surfaced vault -> transparent (no @ prefix), hidden vault absent
      const s = await call(c.client, 'memory__search', { query: 'visible' });
      expect((s.structured as { results: unknown[] }).results).toHaveLength(1);
      const miss = await call(c.client, 'memory__search', { query: 'secret' });
      expect((miss.structured as { results: unknown[] }).results).toHaveLength(0);
    } finally {
      await c.close();
    }
  });

  it('surfaces nothing usable when no vault matches the scope', async () => {
    const c = await connect(
      { a: { path: tmpVault({ 'x.md': 'hi' }), mcp: ['remote'] } },
      {
        scope: 'local',
      }
    );
    try {
      const r = await call(c.client, 'memory__read', { path: 'x.md' });
      expect(r.isError).toBe(true); // no surfaced vault -> handler errors, no crash
    } finally {
      await c.close();
    }
  });
});

// write/edit tool output omits rev (response-minimization).
describe('write/edit omit rev', () => {
  it('returns only {path, updated}', async () => {
    const c = await connect({ work: { path: tmpVault() } }, { default: 'work' });
    try {
      const w = await call(c.client, 'memory__write', { path: 'n.md', body: 'one' });
      expect(Object.keys(w.structured as object).sort()).toEqual(['path', 'updated']);
      const e = await call(c.client, 'memory__edit', { path: 'n.md', mode: 'append', body: 'two' });
      expect(Object.keys(e.structured as object).sort()).toEqual(['path', 'updated']);
      expect(e.structured).not.toHaveProperty('rev');
    } finally {
      await c.close();
    }
  });
});
