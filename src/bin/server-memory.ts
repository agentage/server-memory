#!/usr/bin/env node
// @agentage/server-memory - the stdio MCP keystone. `npx @agentage/server-memory`
// exposes the user's local vaults (~/.agentage/vaults.json, read via
// @agentage/memory-core) as the 6 memory__* tools over stdio, for stdio-only clients
// (Windsurf, Zed) and as the published npm artifact. Zero memory logic - it binds the
// memory-core server to a StdioServerTransport.
//
// stdout is the JSON-RPC wire; all diagnostics MUST go to stderr.

const reason = (err: unknown): string => (err instanceof Error ? err.message : String(err));

// Optional observability. @agentage/observability is deliberately NOT a dependency: this package is
// run through `npx`, and the kit would triple a cold start's install. Installed alongside (global,
// or via the agentage CLI) its bootstrap adds tool spans, wide events and crash capture; absent, it
// is a silent skip. Either way stdout stays the JSON-RPC wire - the kit logs to stderr only, and
// stays inert until OTEL_EXPORTER_OTLP_ENDPOINT names a collector.
const startObservability = async (): Promise<void> => {
  // The kit (1.0.0) announces an enabled tracer with one console.log, which on this process would
  // land mid-handshake on the JSON-RPC wire. Divert stdout to stderr while it boots; drop this once
  // the kit writes that line to stderr itself.
  const stdoutWrite = process.stdout.write;
  process.stdout.write = process.stderr.write.bind(process.stderr) as typeof process.stdout.write;
  try {
    if (!process.env.OTEL_SERVICE_NAME) process.env.OTEL_SERVICE_NAME = 'agentage-server-memory';
    await import('@agentage/observability/bootstrap');
  } catch (err) {
    if (process.env.AGENTAGE_DEBUG) {
      process.stderr.write(`[server-memory] observability off: ${reason(err)}\n`);
    }
  } finally {
    process.stdout.write = stdoutWrite;
  }
};

// Loaded behind the bootstrap, not at the top: the kit instruments MCP tool registration through
// module hooks, which only see a module imported after they are registered.
await startObservability();
const { StdioServerTransport } = await import('@modelcontextprotocol/sdk/server/stdio.js');
const { loadLocalServer } = await import('../server/local-server.js');

const main = async (): Promise<void> => {
  const server = await loadLocalServer();
  await server.connect(new StdioServerTransport());
  // The transport keeps the process alive until the client disconnects (stdin EOF).
};

main().catch((err: unknown) => {
  process.stderr.write(`[server-memory] fatal: ${reason(err)}\n`);
  process.exit(1);
});
