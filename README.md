# @agentage/mcp-memory

The **MCP server** for agentage Memory: exposes your local vaults
(`~/.agentage/vaults.json`, read through [`@agentage/memory-core`](https://github.com/agentage/memory-core))
as the frozen 6 `memory__*` tools over stdio. The open, cross-vendor counterpart to
`@modelcontextprotocol/server-memory`.

This package is intentionally **small** - it is just the MCP definition (the 6-tool Zod
schema + `.mcpc.json`, the text renderer, `createMemoryServer`, and a ~15-line stdio bin).
All memory logic (backends, git, search, routing) lives in `@agentage/memory-core`.

## Use it

```bash
# one-time, offline: scaffold ~/.agentage + a starter vault
#   (memory-core's `init`, also surfaced by the agentage CLI)
npx @agentage/mcp-memory          # serves ~/.agentage/vaults.json over stdio
```

Point any stdio MCP client (Windsurf, Zed, Claude Desktop) at `npx @agentage/mcp-memory`.

## Reused by the CLI daemon

The server builder is transport-agnostic, so the agentage CLI reuses the exact same
pieces and only swaps the transport:

```ts
import { createMemoryServer, loadLocalServer } from '@agentage/mcp-memory';

// stdio bin:        await (await loadLocalServer()).connect(new StdioServerTransport());
// CLI daemon:       const server = createMemoryServer(registry, { scope: 'local' });
//                   await server.connect(new StreamableHTTPServerTransport(...));
```

## Develop

```bash
npm install        # links @agentage/memory-core via file:../memory-core
npm test           # vitest: contract (tools/list = 6) + tools (in-memory) + e2e (init -> spawned bin -> round-trip)
npm run verify     # type-check + lint + format:check + test + build
```

`@agentage/memory-core` is a local `file:` link until both packages publish to npm; build
core before running here (the e2e does this automatically). The 6-tool schema and
`.mcpc.json` snapshot are the frozen MCP contract - keep them in sync if the contract changes.
