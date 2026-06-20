// The frozen 6-tool surface. Changing any tool name or shape is a breaking change to
// the MCP contract, guarded by the .mcpc.json snapshot test. Descriptions are
// multi-sentence and cross-model-tuned; input param keys stay snake_case.

import { z } from 'zod';

const pathField = z
  .string()
  .trim()
  .min(1)
  .max(1024)
  .describe(
    'Exact POSIX .md address - not a title or search query. Case-sensitive, no leading slash. e.g. work/tasks/foo.md'
  );
const limitField = z
  .number()
  .int()
  .min(1)
  .max(50)
  .describe('Optional. Max results in this page; defaults to 20, capped at 50.')
  .optional();
const cursorField = z
  .string()
  .min(1)
  .describe(
    "Opaque pagination token - pass the previous response's nextCursor here verbatim for the next page. Omit for the first page; never construct or edit it."
  )
  .optional();
const folderField = z
  .string()
  .trim()
  .max(1024)
  .describe(
    'Folder, POSIX, no leading slash (trailing slash optional), e.g. work/tasks. Matches that folder only - not a string prefix. Omit = whole memory'
  )
  .optional();
const tagsField = z
  .array(z.string().trim().min(1).max(128))
  .max(50)
  .describe(
    'Tags to filter by (frontmatter tags: or inline #tag), AND-matched (all must be present), case-sensitive, bare without #. e.g. [project, active]. Omit = no tag filter'
  )
  .optional();
const frontmatterField = z
  .record(z.string(), z.unknown())
  .describe(
    'YAML metadata as a key->value map (no --- fences), e.g. {"type":"task","status":"active","tags":["project"]}. write replaces the whole map; edit shallow-merges top-level keys (nested values replaced wholesale; a key cannot be removed via edit - use write to fully replace)'
  )
  .optional();

const searchInput = {
  query: z
    .string()
    .trim()
    .min(1)
    .describe(
      'Literal text to find (case-insensitive). Matched as ONE exact substring across titles/bodies/tags - not semantic, not split into words - so a multi-word query matches only that exact phrase; search a SINGLE distinctive keyword. e.g. pkce'
    ),
  folder: folderField,
  tags: tagsField,
  limit: limitField,
  cursor: cursorField,
};

const searchOutput = {
  results: z.array(
    z.object({
      path: z.string(),
      title: z.string(),
      snippet: z.string(),
      score: z.number(),
      updated: z.string(),
    })
  ),
  nextCursor: z.string().optional(),
};

const readInput = { path: pathField };

const readOutput = {
  path: z.string(),
  title: z.string(),
  frontmatter: z.record(z.string(), z.unknown()),
  body: z.string(),
  tags: z.array(z.string()),
  updated: z.string(),
  deleted: z.boolean(),
};

const listInput = {
  folder: folderField,
  depth: z
    .number()
    .int()
    .min(1)
    .max(2)
    .describe(
      'Optional. 1 = direct children of the folder only; 2 (default) = also expand each subfolder one more level.'
    )
    .optional(),
  tags: tagsField,
};

const treeFileSchema = z.object({
  type: z.literal('file'),
  path: z.string(),
  title: z.string(),
  updated: z.string(),
});
const treeSubfolderSchema = z.object({
  type: z.literal('folder'),
  path: z.string(),
  files: z.number().describe('Recursive file count inside this folder'),
  truncated: z
    .boolean()
    .describe(
      'True = this folder was NOT expanded (over the per-folder entry limit or the response budget); call memory__list with this folder path to see inside'
    )
    .optional(),
});
const treeFolderSchema = treeSubfolderSchema.extend({
  entries: z
    .array(z.discriminatedUnion('type', [treeFileSchema, treeSubfolderSchema]))
    .describe('Direct children, present when this folder is expanded (within depth and limits)')
    .optional(),
});

const listOutput = {
  folder: z.string().describe('The browsed folder, normalized; empty = memory root'),
  entries: z.array(z.discriminatedUnion('type', [treeFileSchema, treeFolderSchema])),
  truncated: z
    .boolean()
    .describe(
      'True = something was omitted anywhere in this response (a folder over the per-folder limit, or the response budget); narrow with a subfolder or memory__search'
    ),
  files: z.number().describe('Total files under the browsed folder (after the tags filter)'),
};

const writeInput = {
  path: pathField,
  body: z
    .string()
    .describe(
      'The complete Markdown body, excluding frontmatter (no --- fences). write overwrites the entire existing body.'
    ),
  frontmatter: frontmatterField,
};

const writeOutput = { path: z.string(), updated: z.string() };

const editInput = {
  path: pathField,
  body: z
    .string()
    .describe(
      'Markdown body, excluding frontmatter (no --- fences). With mode=replace it becomes the new body; with mode=append it is added to the end. Not used with mode=str_replace. Omit to change only frontmatter.'
    )
    .optional(),
  frontmatter: frontmatterField,
  mode: z
    .enum(['replace', 'append', 'str_replace'])
    .describe(
      'Optional. "str_replace" swaps old_str for new_str in place; "append" adds body to the end; omit or "replace" overwrites the whole body. Frontmatter always shallow-merges regardless.'
    )
    .optional(),
  old_str: z
    .string()
    .min(1)
    .describe(
      'mode=str_replace only. The exact existing body text to replace - must match verbatim (including whitespace) and appear exactly once. Read the memory first to copy it.'
    )
    .optional(),
  new_str: z
    .string()
    .describe('mode=str_replace only. The replacement text. Omit to delete old_str.')
    .optional(),
};

const deleteInput = { path: pathField };

const deleteOutput = { path: z.string(), deleted: z.literal(true) };

export interface MemoryToolDef {
  name: string;
  title: string;
  description: string;
  annotations: {
    readOnlyHint: boolean;
    destructiveHint: boolean;
    openWorldHint: boolean;
    idempotentHint?: boolean;
  };
  input: z.ZodRawShape;
  output: z.ZodRawShape;
}

export const MEMORY_TOOLS: readonly MemoryToolDef[] = [
  {
    name: 'memory__search',
    title: 'Search memory',
    description:
      'Find memories by literal text, ranked by match count. Matches the query as ONE case-insensitive substring (not semantic, not tokenized) across titles/bodies/tags - so search a SINGLE keyword, not a phrase. Returns path+snippet+score (score = number of matches, not a relevance %), never full bodies. Use when you have a keyword to rank by; to browse the folder tree instead, use memory__list. Zero hits? try a synonym.',
    annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: false },
    input: searchInput,
    output: searchOutput,
  },
  {
    name: 'memory__read',
    title: 'Read memory',
    description:
      'Read ONE memory by its exact path: returns full frontmatter + body. Use a path you got from memory__search/list, a prior write/edit, or the user - do not invent or guess one from a title. No known path? use memory__search first.',
    annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: false },
    input: readInput,
    output: readOutput,
  },
  {
    name: 'memory__list',
    title: 'Browse memory',
    description:
      'Browse the memory as a folder tree: the files and subfolders under a folder, 2 levels deep by default, with per-folder file counts - no bodies, no ranking. Use to see what exists and how it is organized, or to list every note carrying a tag (tags filter); have a keyword to rank by instead? use memory__search. A folder shown without its own entries has more inside: call memory__list again with that folder. Folders over the per-folder entry limit are flagged truncated and not expanded - browse them directly or narrow with memory__search.',
    annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: false },
    input: listInput,
    output: listOutput,
  },
  {
    name: 'memory__write',
    title: 'Write memory',
    description:
      'Create a NEW memory or fully OVERWRITE an existing one at path - replaces the entire body and frontmatter (idempotent; the saved memory persists for every AI). Use when you have the complete final content. To change only part of an existing memory, use memory__edit. Store durable knowledge and notes only - never secrets, passwords, API keys, one-time codes, or payment/government identifiers (these are refused).',
    annotations: {
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    },
    input: writeInput,
    output: writeOutput,
  },
  {
    name: 'memory__edit',
    title: 'Edit memory',
    description:
      'Amend an EXISTING memory in place: mode=str_replace swaps one exact text match (old_str -> new_str) without resending the note - the default choice for small changes; append adds to the end; replace overwrites the whole body; frontmatter shallow-merges. Fails with not-found if the path does not exist - use memory__write to create. Do not introduce secrets, passwords, API keys, one-time codes, or payment/government identifiers (these are refused).',
    annotations: {
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: false,
      openWorldHint: false,
    },
    input: editInput,
    output: writeOutput,
  },
  {
    name: 'memory__delete',
    title: 'Delete memory',
    description:
      'Soft-delete (forget) a memory by path; recoverable from git history. Returns not-found if the path does not exist. To remove only part of a memory, use memory__edit.',
    annotations: {
      readOnlyHint: false,
      destructiveHint: true,
      idempotentHint: false,
      openWorldHint: false,
    },
    input: deleteInput,
    output: deleteOutput,
  },
] as const;
