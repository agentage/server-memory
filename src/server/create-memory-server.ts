import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { createRouter, type McpScope, type VaultRegistry } from '@agentage/memory-core';
import { registerTools } from './register-tools.js';

export const SERVER_NAME = 'agentage-memory';
export const SERVER_TITLE = 'Agentage Memory';
export const SERVER_VERSION = '0.0.1';

export interface CreateServerOptions {
  scope: McpScope; // which vaults to surface: only those whose mcp includes this scope
  version?: string;
}

const instructionsFor = (vaultIds: string[]): string => {
  const line =
    vaultIds.length > 1
      ? `\nThis connection serves these vaults: ${vaultIds.join(', ')}. A path starting @<vault>/ addresses that vault (e.g. @${vaultIds[1]}/notes.md); every other path goes to the default vault. memory__list with no folder shows the vaults.`
      : '';
  return (
    `agentage Memory is the user's persistent memory, shared across every AI they use. Engage it proactively: check it when past context could help, and save decisions, preferences, and durable facts as you learn them.\n` +
    `Memories are plain markdown files at POSIX paths (e.g. work/tasks/plan.md). Browse with memory__list, find by keyword with memory__search (single literal substring), read one with memory__read. Save with memory__write (new note or full rewrite) or memory__edit (in place: str_replace for small changes, append to add). Read a memory before editing it.` +
    line
  );
};

// Build an MCP server exposing the frozen 6 tools over the registry's surfaced
// vaults (those whose mcp scope includes opts.scope). Transport-agnostic: connect
// it to a stdio or Streamable-HTTP transport. The vault router federates per-call.
export const createMemoryServer = (reg: VaultRegistry, opts: CreateServerOptions): McpServer => {
  const surfaced = reg.surfaced(opts.scope);
  const fallbackDefault = reg.default();
  const defaultHandle = surfaced.find((h) => h.id === fallbackDefault?.id) ?? surfaced[0];
  const router = createRouter(surfaced, defaultHandle);
  const server = new McpServer(
    {
      name: SERVER_NAME,
      title: SERVER_TITLE,
      version: opts.version ?? SERVER_VERSION,
      websiteUrl: 'https://agentage.io',
    },
    { capabilities: { tools: {} }, instructions: instructionsFor(surfaced.map((h) => h.id)) }
  );
  registerTools(server, router);
  return server;
};
