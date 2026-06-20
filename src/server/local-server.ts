import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import {
  createRegistry,
  loadConfig,
  type McpScope,
  type VaultsConfig,
} from '@agentage/memory-core';
import { createMemoryServer } from './create-memory-server.js';

export interface LocalServerOptions {
  configDir?: string;
}

const truthy = (v: string | undefined): boolean => v === '1' || v === 'true' || v === 'yes';

// Resolve config from the environment first (so `npx` works with no file):
//   AGENTAGE_VAULTS_DIR -> autodiscover every subfolder of that dir as a vault;
//   otherwise           -> read ~/.agentage/vaults.json (or the zero-config default).
const resolveConfig = async (configDir?: string): Promise<VaultsConfig> => {
  const vaultsDir = process.env.AGENTAGE_VAULTS_DIR;
  if (vaultsDir) return { version: 1, vaultsDir, autodiscover: true, autoInit: true };
  return loadConfig({ configDir });
};

// The whole local stack in one call: resolve config -> registry (memory-core) -> an
// MCP server over the surfaced vaults. Honors env knobs: AGENTAGE_VAULTS_DIR,
// AGENTAGE_VAULT (one vault), AGENTAGE_SCOPE (local|remote), AGENTAGE_READONLY.
export const loadLocalServer = async (opts: LocalServerOptions = {}): Promise<McpServer> => {
  const config = await resolveConfig(opts.configDir);
  const registry = await createRegistry(config);
  const scope = (process.env.AGENTAGE_SCOPE as McpScope) || 'local';
  return createMemoryServer(registry, {
    scope,
    readOnly: truthy(process.env.AGENTAGE_READONLY),
    only: process.env.AGENTAGE_VAULT || undefined,
  });
};
