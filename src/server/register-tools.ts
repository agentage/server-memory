import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import {
  UnknownVaultError,
  type EditInput,
  type ListQuery,
  type Router,
  type SearchQuery,
  type WriteInput,
} from '@agentage/memory-core';
import { MEMORY_TOOLS } from './memory-tools.schema.js';
import {
  renderDelete,
  renderEdit,
  renderList,
  renderRead,
  renderSearch,
  renderWrite,
} from './render-markdown.js';

const byName = new Map(MEMORY_TOOLS.map((t) => [t.name, t]));
const toolConfig = (name: string) => {
  const def = byName.get(name);
  if (!def) throw new Error(`unknown tool: ${name}`);
  return {
    title: def.title,
    description: def.description,
    inputSchema: def.input,
    outputSchema: def.output,
    annotations: def.annotations,
  };
};

const ok = (data: object, text: string): CallToolResult => ({
  content: [{ type: 'text', text }],
  structuredContent: data as Record<string, unknown>,
});
const isError = (text: string): CallToolResult => ({
  content: [{ type: 'text', text }],
  isError: true,
});
const notFound = (
  path: string,
  hint = 'Use memory__search to find the right path, or memory__list to browse.'
): CallToolResult => isError(`No memory at path "${path}". ${hint}`);

// Map an UnknownVaultError to a tool error; let other throws propagate to the SDK.
const guard = async (fn: () => Promise<CallToolResult>): Promise<CallToolResult> => {
  try {
    return await fn();
  } catch (e) {
    if (e instanceof UnknownVaultError) return isError(e.message);
    throw e;
  }
};

// Register the frozen 6-tool surface onto the federated router. write/edit return
// {path,updated} (the commit SHA is internal, stripped); errors surface as isError.
export const registerTools = (server: McpServer, router: Router): void => {
  server.registerTool('memory__search', toolConfig('memory__search'), (args) =>
    guard(async () => {
      const query = args as unknown as SearchQuery;
      const result = await router.search(query);
      return ok(result, renderSearch(query, result));
    })
  );

  server.registerTool('memory__read', toolConfig('memory__read'), (args) =>
    guard(async () => {
      const { path } = args as { path: string };
      const view = await router.read(path);
      return view ? ok(view, renderRead(view)) : notFound(path);
    })
  );

  server.registerTool('memory__list', toolConfig('memory__list'), (args) =>
    guard(async () => {
      const query = args as unknown as ListQuery;
      const result = await router.list(query);
      return ok(result, renderList(query, result));
    })
  );

  server.registerTool('memory__write', toolConfig('memory__write'), (args) =>
    guard(async () => {
      const input = args as unknown as WriteInput;
      const r = await router.write(input);
      const view = { path: r.path, updated: r.updated };
      return ok(view, renderWrite(view));
    })
  );

  server.registerTool('memory__edit', toolConfig('memory__edit'), (args) =>
    guard(async () => {
      const input = args as unknown as EditInput;
      if (input.mode === 'str_replace') {
        if (!input.old_str)
          return isError(
            'mode=str_replace needs old_str: the exact body text to replace. Add new_str for the replacement, or omit it to delete old_str.'
          );
        if (input.body !== undefined)
          return isError(
            'mode=str_replace edits in place via old_str/new_str - do not send body. Use mode=replace to overwrite the whole body.'
          );
      } else if (input.old_str !== undefined || input.new_str !== undefined) {
        return isError('old_str/new_str work only with mode="str_replace".');
      } else if (input.body === undefined && input.frontmatter === undefined) {
        return isError(
          'memory__edit needs a change: provide body (with mode) and/or frontmatter. To create a new memory, use memory__write.'
        );
      }
      const r = await router.edit({ ...input, mode: input.mode ?? 'replace' });
      if (!r) return notFound(input.path, 'Use memory__write to create it.');
      const view = { path: r.path, updated: r.updated };
      return ok(view, renderEdit(view));
    })
  );

  server.registerTool('memory__delete', toolConfig('memory__delete'), (args) =>
    guard(async () => {
      const { path } = args as { path: string };
      const deleted = await router.delete(path);
      return deleted ? ok({ path, deleted: true }, renderDelete(path)) : notFound(path);
    })
  );
};
