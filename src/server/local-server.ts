import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { createRegistry, loadConfig } from '@agentage/memory-core';
import { createMemoryServer } from './create-memory-server.js';

// The whole local stack in one call: read vaults.json -> registry (memory-core) ->
// a server exposing the local-scoped vaults via the 6 tools. The transport (stdio,
// HTTP) is the caller's choice. Used by the stdio bin and the daemon.
export const loadLocalServer = async (opts: { configDir?: string } = {}): Promise<McpServer> => {
  const config = await loadConfig({ configDir: opts.configDir });
  const registry = await createRegistry(config);
  return createMemoryServer(registry, { scope: 'local' });
};
