import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { connect } from './fixtures/mcp.js';
import { tmpVault } from './fixtures/index.js';

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..');
const contract = JSON.parse(readFileSync(join(repoRoot, '.mcpc.json'), 'utf8')) as {
  tools: Array<{
    name: string;
    title: string;
    description: string;
    annotations: Record<string, unknown>;
    inputSchema: { properties?: Record<string, unknown>; required?: string[] };
    outputSchema: { properties?: Record<string, unknown>; required?: string[] };
  }>;
};

const props = (s: { properties?: Record<string, unknown> }) =>
  Object.keys(s.properties ?? {}).sort();

// tools/list = exactly the frozen 6, matching the .mcpc.json contract. Compares
// the load-bearing, draft-stable facets (names/titles/descriptions/annotations/required/
// property sets) - NOT raw JSON-Schema bytes, which differ by draft between the snapshot
// (z.toJSONSchema) and the live SDK serializer.
describe('tools/list matches the frozen contract', () => {
  it('exposes exactly the 6 frozen tools with matching shapes', async () => {
    const c = await connect({ work: { path: tmpVault() } }, { default: 'work' });
    try {
      const { tools } = await c.client.listTools();
      expect(tools.map((t) => t.name).sort()).toEqual(contract.tools.map((t) => t.name).sort());

      for (const expected of contract.tools) {
        const live = tools.find((t) => t.name === expected.name)!;
        expect(live, expected.name).toBeDefined();
        expect(live.description, expected.name).toBe(expected.description);
        expect(live.annotations?.title ?? live.title, expected.name).toBe(expected.title);
        expect(live.annotations, expected.name).toMatchObject(expected.annotations);
        expect(props(live.inputSchema as never), `${expected.name} input props`).toEqual(
          props(expected.inputSchema)
        );
        expect((live.inputSchema as { required?: string[] }).required?.sort() ?? []).toEqual(
          (expected.inputSchema.required ?? []).sort()
        );
        expect(props(live.outputSchema as never), `${expected.name} output props`).toEqual(
          props(expected.outputSchema)
        );
      }
    } finally {
      await c.close();
    }
  });
});
