import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { createRegistry, validateConfig, type VaultEntry } from '@agentage/memory-core';
import {
  createMemoryServer,
  type CreateServerOptions,
} from '../../src/server/create-memory-server.js';

export interface ConnectedClient {
  client: Client;
  server: McpServer;
  close: () => Promise<void>;
}

// Connect an in-memory MCP client to a server built from the given vaults.
export const connect = async (
  vaults: Record<string, VaultEntry>,
  opts: { default?: string; scope?: CreateServerOptions['scope'] } = {}
): Promise<ConnectedClient> => {
  const reg = await createRegistry(validateConfig({ version: 1, default: opts.default, vaults }));
  const server = createMemoryServer(reg, { scope: opts.scope ?? 'local' });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  await server.connect(serverTransport);
  const client = new Client({ name: 'test-client', version: '0.0.0' });
  await client.connect(clientTransport);
  return {
    client,
    server,
    close: async () => {
      await client.close();
      await server.close();
    },
  };
};

// Convenience: call a tool and return the parsed result fields.
export const call = async (
  client: Client,
  name: string,
  args: Record<string, unknown>
): Promise<{ structured: unknown; text: string; isError: boolean }> => {
  const res = (await client.callTool({ name, arguments: args })) as {
    content?: Array<{ type: string; text?: string }>;
    structuredContent?: unknown;
    isError?: boolean;
  };
  const text = (res.content ?? [])
    .filter((c) => c.type === 'text')
    .map((c) => c.text ?? '')
    .join('\n');
  return { structured: res.structuredContent, text, isError: res.isError === true };
};
