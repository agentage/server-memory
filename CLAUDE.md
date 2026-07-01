# @agentage/server-memory — CLAUDE.md

The stdio **MCP server** for agentage Memory: exposes local vaults as the frozen 6
`memory__*` tools. Deliberately **tiny** — just the MCP definition. All memory logic
(backends, git, search, routing) lives in `@agentage/memory-core`; don't add it here.

## Layout (src/)
- `server/memory-tools.schema.ts` + `.mcpc.json` — the **frozen 6-tool contract** (Zod source + CI snapshot).
- `server/register-tools.ts` — wires the schema to memory-core's router.
- `server/render-markdown.ts` — the text channel renderer (pure; list=outline, read=raw doc).
- `server/create-memory-server.ts` — `createMemoryServer(registry, opts)`, transport-agnostic.
- `server/local-server.ts` — `loadLocalServer()` (reads `~/.agentage/vaults.json`).
- `bin/server-memory.ts` — ~15-line stdio entry.

## Rules
- The 6-tool `memory__*` contract is **frozen**. Schema + `.mcpc.json` must stay in sync.
- `.mcpc.json` is a CI snapshot (`z.toJSONSchema`, draft-2020-12) — it disagrees with the live `tools/list` (SDK, draft-07). **Verify contract claims against a dumped live `tools/list`, never the snapshot** — snapshot-only checks go false-green.
- Descriptions flow to BOTH serializers — the safe cross-model lever (the model routes on the description, not just the schema).
- Transport-agnostic by design: stdio bin here; the CLI daemon reuses `createMemoryServer` over Streamable HTTP. Keep it that way.
- `@agentage/memory-core` is a `file:` link until both publish — build core first (the e2e does this automatically).

## Verify
`npm run verify` (type-check + lint + format:check + test + build). Tests: contract (tools/list = 6) + tools (in-memory) + e2e (init → spawned bin → round-trip).
