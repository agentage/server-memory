// The model reads content[].text; we render lean per-tool markdown there (never a
// JSON dump) while structuredContent carries the typed object.

import {
  serializeDoc,
  type ListQuery,
  type ListResult,
  type MemoryView,
  type SearchQuery,
  type SearchResult,
  type TreeFile,
  type TreeFolder,
  type WriteResult,
} from '@agentage/memory-core';

const UNSAFE_RANGES: ReadonlyArray<[number, number]> = [
  [0x200b, 0x200d],
  [0xfeff, 0xfeff],
  [0x202a, 0x202e],
  [0x2066, 0x2069],
];
const hex = (n: number): string => `\\u${n.toString(16).padStart(4, '0')}`;
const UNSAFE_CHARS = new RegExp(
  `[${UNSAFE_RANGES.map(([a, b]) => `${hex(a)}-${hex(b)}`).join('')}]`,
  'g'
);

const sanitize = (s: string): string => s.replace(/<!--[\s\S]*?-->/g, '').replace(UNSAFE_CHARS, '');

const moreLine = (tool: string, cursor?: string): string =>
  cursor ? `\n\nMore: call ${tool} again with cursor \`${cursor}\`` : '';

export const renderSearch = (q: SearchQuery, result: SearchResult): string => {
  if (!result.results.length) return `No memories matched "${sanitize(q.query)}".`;
  const rows = result.results.map(
    (h, i) =>
      `${i + 1}. **${sanitize(h.title)}** — \`${h.path}\` · score ${h.score} · updated ${h.updated}\n   ${sanitize(h.snippet)}`
  );
  return `Found ${result.results.length} memories for "${sanitize(q.query)}":\n\n${rows.join('\n')}${moreLine('memory__search', result.nextCursor)}`;
};

const count = (n: number, one: string, many: string): string => `${n} ${n === 1 ? one : many}`;

export const renderList = (q: ListQuery, result: ListResult): string => {
  const scope = [
    q.tags?.length ? ` tagged \`${q.tags.join(', ')}\`` : '',
    q.folder ? ` under \`${q.folder}\`` : '',
  ].join('');
  if (!result.entries.length) return `No memories${scope || ' in this memory'}.`;

  const name = (path: string): string => path.slice(path.lastIndexOf('/') + 1);
  const fileLine = (f: TreeFile): string => `- ${name(f.path)} · ${f.updated.slice(0, 10)}`;
  const stubLine = (f: TreeFolder): string =>
    `- ${name(f.path)}/ · ${count(f.files, 'file', 'files')} (${
      f.truncated ? 'too many entries to expand' : 'not expanded'
    } - list \`${f.path}\`)`;

  const loose: string[] = [];
  const sections: string[] = [];
  for (const e of result.entries) {
    if (e.type === 'file') loose.push(fileLine(e));
    else if (!e.entries) loose.push(stubLine(e));
    else
      sections.push(
        [
          `**${e.path}/** · ${count(e.files, 'file', 'files')}`,
          ...e.entries.map((c) => (c.type === 'file' ? fileLine(c) : stubLine(c))),
        ].join('\n')
      );
  }

  const folders = result.entries.filter((e) => e.type === 'folder').length;
  const head = `${count(result.files, 'memory', 'memories')}${scope}${
    folders ? ` · ${count(folders, 'folder', 'folders')}` : ''
  }`;
  const blocks = [loose.join('\n'), ...sections].filter(Boolean);
  const note = result.truncated
    ? '\n\nSome entries were omitted (per-folder limit): list a subfolder directly or use memory__search.'
    : '';
  return `${head}\n\n${blocks.join('\n\n')}${note}`;
};

export const renderRead = (view: MemoryView): string =>
  `${view.deleted ? '(soft-deleted - recoverable)\n\n' : ''}${sanitize(
    serializeDoc(view.frontmatter, view.body)
  )}`;

export const renderWrite = (r: Pick<WriteResult, 'path' | 'updated'>): string =>
  `Wrote \`${r.path}\` (updated ${r.updated}). To change part of it, call memory__edit with this path.`;

export const renderEdit = (r: Pick<WriteResult, 'path' | 'updated'>): string =>
  `Edited \`${r.path}\` (updated ${r.updated}).`;

export const renderDelete = (path: string): string =>
  `Deleted \`${path}\` (soft-delete, recoverable). Recreate with memory__write if this was unintended.`;
