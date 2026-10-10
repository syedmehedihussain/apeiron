import { ChevronRight, Folder } from 'lucide-react';
import { useMemo, useState } from 'react';
import type { GitLetter, TreeEntry } from '@cherry/shared';
import { useChanges, useTree } from '../../api/workspace.ts';
import styles from './FileTree.module.css';

const PINNED = new Set(['CLAUDE.md', 'docs', '_project']);

interface FileTreeProps {
  projectId: string;
  projectPath: string;
  selected: string | null;
  onOpen(path: string): void;
  /** Files Claude changed this session (M3). */
  touched?: Set<string>;
}

export function FileTree({ projectId, projectPath, selected, onOpen, touched }: FileTreeProps) {
  const [open, setOpen] = useState<Set<string>>(() => initialOpen(selected));
  const [filter, setFilter] = useState<'all' | 'changed' | 'touched'>('all');
  const root = useTree(projectId, '');
  const changes = useChanges(projectId);

  const toggle = (p: string) =>
    setOpen((s) => {
      const next = new Set(s);
      if (next.has(p)) next.delete(p);
      else next.add(p);
      return next;
    });

  const counts = useMemo(() => {
    const c = { M: 0, A: 0, U: 0, D: 0, R: 0 } as Record<GitLetter, number>;
    for (const e of changes.data?.entries ?? []) c[e.letter]++;
    return c;
  }, [changes.data]);

  const entries = root.data?.entries ?? [];
  const pinned = entries.filter((e) => PINNED.has(e.name));
  const rest = entries.filter((e) => !PINNED.has(e.name));
  const flat =
    filter === 'changed'
      ? (changes.data?.entries ?? []).map((e) => e)
      : filter === 'touched'
        ? [...(touched ?? [])].map((p) => ({ path: p, letter: null }))
        : null;

  return (
    <aside aria-label="Files" className={styles.panel}>
      <div className={styles.head}>
        <span className={styles.title}>{projectId}</span>
        <span className={styles.path}>{projectPath}</span>
      </div>
      <div className={styles.scroll} role="tree" aria-label="Project files">
        <div className="label" style={{ padding: '4px 8px 6px' }}>
          {flat ? (filter === 'changed' ? 'Changed files' : 'Claude touched') : 'Project files'}
        </div>
        {root.isPending && <TreeSkeleton />}
        {flat ? (
          flat.map((e) => (
            <Row
              key={e.path}
              entry={{
                name: e.path,
                path: e.path,
                type: 'file',
                tag: tagOf(e.path),
                git: e.letter,
                ignored: false,
                changedInside: 0,
              }}
              depth={0}
              selected={selected === e.path}
              touched={touched?.has(e.path) ?? false}
              onClick={() => onOpen(e.path)}
            />
          ))
        ) : (
          <>
            {pinned.map((e) => (
              <Node
                key={e.path}
                projectId={projectId}
                entry={e}
                depth={0}
                open={open}
                toggle={toggle}
                selected={selected}
                onOpen={onOpen}
                touched={touched}
              />
            ))}
            {pinned.length > 0 && <div className={styles.divider} />}
            {rest.map((e) => (
              <Node
                key={e.path}
                projectId={projectId}
                entry={e}
                depth={0}
                open={open}
                toggle={toggle}
                selected={selected}
                onOpen={onOpen}
                touched={touched}
              />
            ))}
          </>
        )}
        {flat && flat.length === 0 && <p className={styles.empty}>Nothing here.</p>}
      </div>
      <div className={styles.foot}>
        <FilterChip
          active={filter === 'changed'}
          onClick={() => setFilter(filter === 'changed' ? 'all' : 'changed')}
        >
          <span className={styles.letter} data-letter="M">
            M
          </span>
          {counts.M + counts.R} modified
        </FilterChip>
        <FilterChip
          active={filter === 'changed'}
          onClick={() => setFilter(filter === 'changed' ? 'all' : 'changed')}
        >
          <span className={styles.letter} data-letter="A">
            A
          </span>
          {counts.A + counts.U} added
        </FilterChip>
        <FilterChip
          active={filter === 'touched'}
          onClick={() => setFilter(filter === 'touched' ? 'all' : 'touched')}
        >
          <span className={styles.touchedDot} />
          Claude touched
        </FilterChip>
      </div>
    </aside>
  );
}

function FilterChip({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick(): void;
  children: React.ReactNode;
}) {
  return (
    <button type="button" className={styles.chip} aria-pressed={active} onClick={onClick}>
      {children}
    </button>
  );
}

function initialOpen(selected: string | null): Set<string> {
  const s = new Set<string>();
  if (!selected) return s;
  const parts = selected.split('/');
  for (let i = 1; i < parts.length; i++) s.add(parts.slice(0, i).join('/'));
  return s;
}

function tagOf(p: string): string | null {
  const ext = p.split('.').pop();
  return ext && ext !== p ? ext.slice(0, 4).toUpperCase() : null;
}

interface NodeProps {
  projectId: string;
  entry: TreeEntry;
  depth: number;
  open: Set<string>;
  toggle(p: string): void;
  selected: string | null;
  onOpen(p: string): void;
  touched?: Set<string>;
}

function Node({ projectId, entry, depth, open, toggle, selected, onOpen, touched }: NodeProps) {
  const isOpen = entry.type === 'dir' && open.has(entry.path);
  const children = useTree(projectId, entry.path, isOpen);
  return (
    <>
      <Row
        entry={entry}
        depth={depth}
        expanded={entry.type === 'dir' ? isOpen : undefined}
        selected={selected === entry.path}
        touched={touched?.has(entry.path) ?? false}
        onClick={() => (entry.type === 'dir' ? toggle(entry.path) : onOpen(entry.path))}
      />
      {isOpen &&
        (children.data?.entries ?? []).map((c) => (
          <Node
            key={c.path}
            projectId={projectId}
            entry={c}
            depth={depth + 1}
            open={open}
            toggle={toggle}
            selected={selected}
            onOpen={onOpen}
            touched={touched}
          />
        ))}
    </>
  );
}

function Row({
  entry,
  depth,
  expanded,
  selected,
  touched,
  onClick,
}: {
  entry: TreeEntry;
  depth: number;
  expanded?: boolean;
  selected: boolean;
  touched: boolean;
  onClick(): void;
}) {
  return (
    <button
      type="button"
      role="treeitem"
      aria-expanded={expanded}
      aria-selected={selected}
      className={styles.row}
      data-ignored={entry.ignored || undefined}
      data-deleted={entry.git === 'D' || undefined}
      style={{ paddingLeft: 8 + depth * 16 }}
      onClick={onClick}
      title={entry.path}
    >
      {Array.from({ length: depth }, (_, i) => (
        <span key={i} className={styles.guide} style={{ left: 15 + i * 16 }} aria-hidden="true" />
      ))}
      <span className={styles.chev} aria-hidden="true">
        {entry.type === 'dir' && (
          <ChevronRight
            size={12}
            strokeWidth={2}
            style={{ transform: expanded ? 'rotate(90deg)' : undefined }}
          />
        )}
      </span>
      <span className={styles.type} data-tag={entry.tag ?? undefined} aria-hidden="true">
        {entry.type === 'dir' ? <Folder size={14} strokeWidth={1.6} /> : entry.tag}
      </span>
      <span className={styles.name}>{entry.name}</span>
      {touched && <span className={styles.touchedDot} title="Touched by Claude this session" />}
      {entry.ignored && <span className={styles.meta}>ignored</span>}
      {entry.git && (
        <span
          className={styles.letter}
          data-letter={entry.git}
          aria-label={LETTER_LABEL[entry.git]}
        >
          {entry.git}
        </span>
      )}
    </button>
  );
}

const LETTER_LABEL: Record<GitLetter, string> = {
  M: 'modified',
  A: 'added',
  U: 'untracked',
  D: 'deleted',
  R: 'renamed',
};

function TreeSkeleton() {
  return (
    <div
      aria-hidden="true"
      style={{ display: 'flex', flexDirection: 'column', gap: 8, padding: 8 }}
    >
      {Array.from({ length: 8 }, (_, i) => (
        <span
          key={i}
          className="shimmer"
          style={{ height: 14, width: `${50 + ((i * 17) % 40)}%` }}
        />
      ))}
    </div>
  );
}
