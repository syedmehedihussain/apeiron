import {
  closeSync,
  existsSync,
  openSync,
  readdirSync,
  readFileSync,
  readSync,
  realpathSync,
  statSync,
} from 'node:fs';
import path from 'node:path';
import type {
  DiffLine,
  DocItem,
  DocsList,
  FileDiff,
  FileView,
  GitLetter,
  Tree,
  TreeEntry,
} from '@apeiron/shared';
import { git, gitStatus } from '../git.ts';
import { badRequest, notFound } from '../http.ts';
import { isSecretFile, resolveInside } from '../paths.ts';

export const IGNORED_DIRS = new Set([
  'node_modules',
  'dist',
  'build',
  '.next',
  '.venv',
  'venv',
  '__pycache__',
  'target',
  'coverage',
  '.turbo',
  '.cache',
]);
const MAX_FILE_BYTES = 1024 * 1024;

/** The project folder for an id, checked to be a direct child of the projects folder. */
export function projectDir(projectsDir: string, id: string): string {
  if (!id || id.startsWith('.') || id.includes('/') || id.includes('\\'))
    throw notFound(`No project called ${id}`);
  const dir = resolveInside(projectsDir, id);
  if (path.dirname(dir) !== safeReal(path.resolve(projectsDir)))
    throw notFound(`No project called ${id}`);
  if (!existsSync(dir) || !statSync(dir).isDirectory()) throw notFound(`No project called ${id}`);
  return dir;
}

function safeReal(p: string): string {
  try {
    return realpathSync(p);
  } catch {
    return p;
  }
}

const toPosix = (p: string) => p.split(path.sep).join('/');

export function fileTag(name: string): string | null {
  const lower = name.toLowerCase();
  if (lower === 'dockerfile') return 'DOCK';
  if (lower.startsWith('.env')) return 'ENV';
  if (lower === 'license') return 'TXT';
  const ext = path.extname(lower).slice(1);
  if (!ext) return null;
  const map: Record<string, string> = {
    tsx: 'TSX',
    jsx: 'JSX',
    mjs: 'JS',
    cjs: 'JS',
    yaml: 'YML',
    markdown: 'MD',
  };
  return map[ext] ?? ext.slice(0, 4).toUpperCase();
}

const LANGS: Record<string, string> = {
  ts: 'typescript',
  tsx: 'tsx',
  js: 'javascript',
  jsx: 'jsx',
  mjs: 'javascript',
  cjs: 'javascript',
  json: 'json',
  md: 'markdown',
  py: 'python',
  rs: 'rust',
  go: 'go',
  css: 'css',
  scss: 'scss',
  html: 'html',
  sh: 'shellscript',
  bash: 'shellscript',
  yml: 'yaml',
  yaml: 'yaml',
  toml: 'toml',
  sql: 'sql',
  c: 'c',
  h: 'c',
  cpp: 'cpp',
  hpp: 'cpp',
  ino: 'cpp',
  java: 'java',
  kt: 'kotlin',
  swift: 'swift',
  rb: 'ruby',
  php: 'php',
  lua: 'lua',
  vue: 'vue',
  svelte: 'svelte',
  xml: 'xml',
  dockerfile: 'dockerfile',
};

export function languageFor(file: string): string {
  const base = path.basename(file).toLowerCase();
  if (base === 'dockerfile') return 'dockerfile';
  if (base === 'makefile') return 'makefile';
  return LANGS[path.extname(base).slice(1)] ?? 'text';
}

async function statusMap(dir: string): Promise<Map<string, GitLetter>> {
  const status = await gitStatus(dir);
  const map = new Map<string, GitLetter>();
  for (const e of status?.entries ?? []) map.set(e.path.replace(/\/$/, ''), e.letter);
  return map;
}

/** One directory level of the project, with git letters. */
export async function listTree(dir: string, rel: string): Promise<Tree> {
  const target = resolveInside(dir, rel);
  if (!existsSync(target) || !statSync(target).isDirectory()) throw notFound(`No folder ${rel}`);
  const letters = await statusMap(dir);
  const dirents = readdirSync(target, { withFileTypes: true }).filter(
    (e) => e.name !== '.git' && e.name !== '.DS_Store',
  );
  const gitIgnored = await ignoredByGit(
    dir,
    dirents.map((e) => toPosix(path.relative(dir, path.join(target, e.name)))),
  );
  const entries: TreeEntry[] = dirents
    .map((e) => {
      const p = toPosix(path.relative(dir, path.join(target, e.name)));
      const isDir = e.isDirectory() || (e.isSymbolicLink() && safeIsDir(path.join(target, e.name)));
      let changedInside = 0;
      if (isDir) for (const k of letters.keys()) if (k.startsWith(p + '/')) changedInside++;
      return {
        name: e.name,
        path: p,
        type: isDir ? ('dir' as const) : ('file' as const),
        tag: isDir ? null : fileTag(e.name),
        git: letters.get(p) ?? null,
        ignored: (isDir && IGNORED_DIRS.has(e.name)) || gitIgnored.has(p),
        changedInside,
      };
    })
    .sort((a, b) => (a.type === b.type ? a.name.localeCompare(b.name) : a.type === 'dir' ? -1 : 1));
  return { path: toPosix(rel), entries };
}

/** Which of these paths .gitignore excludes (shown dimmed in the tree). */
async function ignoredByGit(dir: string, paths: string[]): Promise<Set<string>> {
  if (paths.length === 0) return new Set();
  const { execFile } = await import('node:child_process');
  return new Promise((resolve) => {
    const child = execFile(
      'git',
      ['check-ignore', '--stdin', '-z'],
      { cwd: dir, timeout: 5000 },
      (_err, stdout) => {
        resolve(new Set(String(stdout).split('\0').filter(Boolean)));
      },
    );
    // git exits before reading stdin when the folder is not a repo; that EPIPE must not crash.
    child.stdin?.on('error', () => undefined);
    child.stdin?.end(paths.join('\0') + '\0');
  });
}

function safeIsDir(p: string): boolean {
  try {
    return statSync(p).isDirectory();
  } catch {
    return false;
  }
}

function looksBinary(buf: Buffer): boolean {
  const n = Math.min(buf.length, 8000);
  for (let i = 0; i < n; i++) if (buf[i] === 0) return true;
  return false;
}

export async function readFileView(dir: string, rel: string): Promise<FileView> {
  const target = resolveInside(dir, rel);
  if (!existsSync(target) || !statSync(target).isFile()) throw notFound(`No file ${rel}`);
  const st = statSync(target);
  const relPosix = toPosix(path.relative(dir, target));
  const letters = await statusMap(dir);
  const base = {
    path: relPosix,
    language: languageFor(target),
    size: st.size,
    mtime: st.mtimeMs,
    git: letters.get(relPosix) ?? null,
  };
  if (isSecretFile(relPosix)) {
    return { ...base, lines: 0, content: '', truncated: false, hidden: true, binary: false };
  }
  const fd = openSync(target, 'r');
  const buf = Buffer.alloc(Math.min(st.size, MAX_FILE_BYTES));
  readSync(fd, buf, 0, buf.length, 0);
  closeSync(fd);
  if (looksBinary(buf))
    return { ...base, lines: 0, content: '', truncated: false, hidden: false, binary: true };
  const content = buf.toString('utf8');
  return {
    ...base,
    content,
    lines: content.length ? content.split('\n').length - (content.endsWith('\n') ? 1 : 0) : 0,
    truncated: st.size > MAX_FILE_BYTES,
    hidden: false,
    binary: false,
  };
}

/** Parses a unified diff with full context into the whole file plus inline removed lines. */
export function parseFullDiff(out: string): { lines: DiffLine[]; added: number; removed: number } {
  const lines: DiffLine[] = [];
  let a = 0;
  let b = 0;
  let added = 0;
  let removed = 0;
  let inHunk = false;
  for (const raw of out.split('\n')) {
    const hunk = /^@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@/.exec(raw);
    if (hunk) {
      a = Number(hunk[1]) - 1;
      b = Number(hunk[2]) - 1;
      inHunk = true;
      continue;
    }
    if (!inHunk || raw.startsWith('\\')) continue;
    const kind = raw[0];
    const text = raw.slice(1);
    if (kind === '+') {
      b++;
      added++;
      lines.push({ kind: '+', a: null, b, text });
    } else if (kind === '-') {
      a++;
      removed++;
      lines.push({ kind: '-', a, b: null, text });
    } else if (kind === ' ') {
      a++;
      b++;
      lines.push({ kind: ' ', a, b, text });
    }
  }
  return { lines, added, removed };
}

export async function fileDiff(dir: string, rel: string): Promise<FileDiff> {
  const target = resolveInside(dir, rel);
  const relPosix = toPosix(path.relative(dir, target));
  if (isSecretFile(relPosix)) throw badRequest('Hidden for safety');
  const letters = await statusMap(dir);
  const letter = letters.get(relPosix);
  if (!letter) return { path: relPosix, added: 0, removed: 0, lines: [] };
  if (letter === 'U' || letter === 'A') {
    const view = existsSync(target) ? readFileSync(target, 'utf8') : '';
    const body = view.endsWith('\n') ? view.slice(0, -1) : view;
    const lines: DiffLine[] = body
      .split('\n')
      .map((text, i) => ({ kind: '+', a: null, b: i + 1, text }));
    return { path: relPosix, added: lines.length, removed: 0, lines };
  }
  const res = await git(dir, [
    'diff',
    '--no-color',
    '--no-ext-diff',
    '-U1000000',
    'HEAD',
    '--',
    relPosix,
  ]);
  return { path: relPosix, ...parseFullDiff(res.stdout) };
}

function titleFromMarkdown(file: string, fallback: string): string {
  try {
    const head = readFileSync(file, 'utf8').slice(0, 2000);
    const h1 = /^#\s+(.+)$/m.exec(head)?.[1]?.trim();
    if (h1) return h1.replace(/^\d{4}\s*[—–-]\s*/, '');
  } catch {
    // fall through
  }
  return fallback;
}

const ENGINEERING_LABELS: Record<string, [string, string]> = {
  'prd.md': ['PRD', 'Requirements'],
  'architecture.md': ['ARC', 'Architecture'],
  'data-model.md': ['DM', 'Data model'],
  'api.md': ['API', 'API'],
  'roadmap.md': ['MAP', 'Roadmap'],
  'security.md': ['SEC', 'Security'],
  'testing.md': ['TST', 'Testing'],
  'design-system.md': ['DS', 'Design system'],
  'screens.md': ['UI', 'Screens'],
  'components.md': ['UI', 'Components'],
};

function item(dir: string, rel: string, tag: string, title: string): DocItem | null {
  const file = path.join(dir, rel);
  if (!existsSync(file)) return null;
  return { path: rel, tag, title, mtime: statSync(file).mtimeMs };
}

/** Docs grouped as Project / Engineering / Decisions (components.md → DocsList). */
export function listDocs(dir: string): DocsList {
  const project = [
    item(dir, '_project/STATUS.md', 'MD', 'STATUS.md'),
    item(dir, 'CLAUDE.md', 'MD', 'CLAUDE.md'),
    item(dir, 'README.md', 'MD', 'README.md'),
    item(dir, '_project/notes.md', 'MD', 'notes.md'),
    item(dir, '_project/decisions.md', 'MD', 'decisions.md'),
  ].filter((d): d is DocItem => d !== null);

  const engineering: DocItem[] = [];
  const decisions: DocItem[] = [];
  const docsDir = path.join(dir, 'docs');
  const walk = (sub: string) => {
    const abs = path.join(docsDir, sub);
    if (!existsSync(abs)) return;
    for (const e of readdirSync(abs, { withFileTypes: true }).sort((x, y) =>
      x.name.localeCompare(y.name),
    )) {
      const relInDocs = sub ? `${sub}/${e.name}` : e.name;
      if (e.isDirectory()) {
        if (!e.name.startsWith('.') && !IGNORED_DIRS.has(e.name)) walk(relInDocs);
        continue;
      }
      if (!/\.md$/i.test(e.name) || (e.name.toLowerCase() === 'readme.md' && sub === '')) continue;
      const rel = `docs/${relInDocs}`;
      const adr = /^(\d{4})-.+\.md$/.exec(e.name);
      if (adr?.[1] && /(^|\/)(adr|decisions)$/.test(sub)) {
        decisions.push({
          path: rel,
          tag: adr[1],
          title: titleFromMarkdown(path.join(abs, e.name), e.name),
          mtime: statSync(path.join(abs, e.name)).mtimeMs,
        });
      } else if (e.name !== 'template.md') {
        const known = sub === '' ? ENGINEERING_LABELS[e.name.toLowerCase()] : undefined;
        const title =
          known?.[1] ?? titleFromMarkdown(path.join(abs, e.name), e.name.replace(/\.md$/i, ''));
        engineering.push({
          path: rel,
          tag: known?.[0] ?? 'MD',
          title,
          mtime: statSync(path.join(abs, e.name)).mtimeMs,
        });
      }
    }
  };
  walk('');
  const docsReadme = item(dir, 'docs/README.md', 'MD', 'Docs map');
  if (docsReadme) engineering.unshift(docsReadme);
  return { project, engineering, decisions };
}
