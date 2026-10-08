import {
  Check,
  ChevronRight,
  FileText,
  Pencil,
  ShieldAlert,
  Terminal,
  Wrench,
  X,
} from 'lucide-react';
import { useState } from 'react';
import type { ChatItem } from '@apeiron/shared';
import styles from './Timeline.module.css';

export type ToolItem = Extract<ChatItem, { kind: 'tool' }>;

type RowKind = 'read' | 'edit' | 'ran' | 'running' | 'waiting' | 'failed' | 'denied' | 'other';

function rowKind(t: ToolItem): RowKind {
  if (t.status === 'waiting') return 'waiting';
  if (t.status === 'denied') return 'denied';
  if (t.status === 'failed') return 'failed';
  if (t.verb === 'run') return t.status === 'running' ? 'running' : 'ran';
  if (t.verb === 'edit') return t.status === 'running' ? 'running' : 'edit';
  if (t.verb === 'read') return 'read';
  return t.status === 'running' ? 'running' : 'other';
}

const VERB: Record<RowKind, (t: ToolItem) => string> = {
  read: () => 'Read',
  edit: (t) => (t.tool === 'Write' ? 'Wrote' : 'Edited'),
  ran: () => 'Ran',
  running: (t) => (t.verb === 'edit' ? 'Editing' : t.verb === 'run' ? 'Running' : t.tool),
  waiting: () => 'Waiting',
  failed: () => 'Failed',
  denied: () => 'Denied',
  other: (t) => t.tool,
};

function Icon({ kind }: { kind: RowKind }) {
  const p = { size: 11, strokeWidth: 2.2, 'aria-hidden': true } as const;
  switch (kind) {
    case 'read':
      return <FileText {...p} strokeWidth={2} />;
    case 'edit':
      return <Pencil {...p} />;
    case 'ran':
      return <Check {...p} strokeWidth={2.4} />;
    case 'running':
      return <span className="spinner" style={{ width: 9, height: 9 }} />;
    case 'waiting':
      return <ShieldAlert {...p} strokeWidth={2} />;
    case 'failed':
    case 'denied':
      return <X {...p} strokeWidth={2.4} />;
    default:
      return <Wrench {...p} strokeWidth={2} />;
  }
}

export function TimelineRow({ item, last }: { item: ToolItem; last?: boolean }) {
  const kind = rowKind(item);
  const meta =
    kind === 'waiting' ? (
      'needs approval'
    ) : item.verb === 'edit' && item.added !== null && kind === 'edit' ? (
      <>
        <span className={styles.add}>+{item.added}</span>{' '}
        <span className={item.removed ? styles.del : styles.zero}>−{item.removed}</span>
      </>
    ) : (
      item.meta
    );
  return (
    <div className={styles.row} data-kind={kind}>
      {!last && <span className={styles.rail} aria-hidden="true" />}
      <span className={styles.icon}>
        <Icon kind={kind} />
      </span>
      <span className={styles.verb}>{VERB[kind](item)}</span>
      <span className={styles.target} title={item.target}>
        {item.verb === 'run' && (
          <Terminal size={11} strokeWidth={2} aria-hidden="true" className={styles.termIcon} />
        )}
        {item.target}
      </span>
      <span className={styles.meta}>{meta}</span>
    </div>
  );
}

/** Three or more reads in a row collapse into "Read N files". */
export function ReadGroup({ items }: { items: ToolItem[] }) {
  const [open, setOpen] = useState(false);
  const names = items.map((i) => i.target.split('/').pop() ?? i.target);
  return (
    <div className={styles.group}>
      <button
        type="button"
        className={styles.groupHead}
        aria-expanded={open}
        onClick={() => setOpen(!open)}
      >
        <ChevronRight
          size={12}
          strokeWidth={2}
          aria-hidden="true"
          style={{ transform: open ? 'rotate(90deg)' : undefined }}
        />
        <span className={styles.groupTitle}>Read {items.length} files</span>
        <span className={styles.groupNames}>
          {names.slice(0, 2).join(', ')}
          {names.length > 2 ? `, +${names.length - 2}` : ''}
        </span>
      </button>
      {open && (
        <div className={styles.groupBody}>
          {items.map((i, n) => (
            <TimelineRow key={i.id} item={i} last={n === items.length - 1} />
          ))}
        </div>
      )}
    </div>
  );
}
