import { ArrowUp, Square } from 'lucide-react';
import { useLayoutEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router';
import {
  PHASE_LABEL,
  STATE_LABEL,
  gitChip,
  type ChatItem,
  type MagnetAction,
  type ProjectCard,
} from '@apeiron/shared';
import { ApiFailure } from '../../api/client.ts';
import { answerApproval } from '../../api/chat.ts';
import {
  approveAction,
  cancelAction,
  sendMagnet,
  stopMagnet,
  useMagnet,
} from '../../api/magnet.ts';
import { useProjects } from '../../api/queries.ts';
import { useNow } from '../../lib/useNow.ts';
import { ApprovalCard } from '../ApprovalCard/ApprovalCard.tsx';
import { MagnetAvatar } from '../MagnetAvatar/MagnetAvatar.tsx';
import { Markdown } from '../Markdown/Markdown.tsx';
import { projectHref } from '../ProjectCard/ProjectCard.tsx';
import styles from './MagnetChat.module.css';

const CHIPS = ["What's stuck this week?", 'Start a project', 'Summarise today'] as const;

type Row = { t: 'item'; item: ChatItem } | { t: 'looked'; id: string; n: number; running: boolean };

/** Tool calls collapse into one quiet "Looked at N files" line per run. */
function rows(items: ChatItem[]): Row[] {
  const out: Row[] = [];
  for (const item of items) {
    if (item.kind === 'tool') {
      const last = out[out.length - 1];
      if (last?.t === 'looked') {
        last.n++;
        last.running = item.status === 'running';
      } else out.push({ t: 'looked', id: item.id, n: 1, running: item.status === 'running' });
    } else if (item.kind === 'text' && !item.text.trim()) continue;
    else out.push({ t: 'item', item });
  }
  return out;
}

export function MagnetChat({
  projectId,
  onNavigate,
}: {
  /** The project being looked at (workspace tab). */
  projectId?: string;
  /** Called before following a link (the Home panel closes itself). */
  onNavigate?: () => void;
}) {
  const magnet = useMagnet();
  const projects = useProjects();
  const navigate = useNavigate();
  const now = useNow(60_000);
  const [text, setText] = useState('');
  const [error, setError] = useState<string | null>(null);
  const scroller = useRef<HTMLDivElement>(null);
  const running = !!magnet.data?.running;
  const items = magnet.data?.items ?? [];
  const cards = projects.data?.cards ?? [];
  const lastItem = items.at(-1);

  const send = async (value: string) => {
    const v = value.trim();
    if (!v || running) return;
    setError(null);
    try {
      await sendMagnet(v, projectId);
      setText('');
    } catch (e) {
      setError(e instanceof ApiFailure ? e.message : 'Magnet could not be reached.');
    }
  };

  useLayoutEffect(() => {
    const el = scroller.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [items.length, lastItem]);

  const go = (href: string) => {
    onNavigate?.();
    void navigate(href);
  };

  return (
    <div className={styles.chat}>
      <div className={styles.messages} ref={scroller} aria-live="polite">
        {items.length === 0 && !running && (
          <div className={styles.empty}>
            <MagnetAvatar size={48} />
            <p>
              Ask about any project. Magnet reads your projects and proposes actions; nothing
              changes until you approve.
            </p>
          </div>
        )}
        {rows(items).map((r) =>
          r.t === 'looked' ? (
            <div key={r.id} className={styles.looked}>
              {r.running && <span className="spinner" style={{ width: 9, height: 9 }} />}
              Looked at {r.n} file{r.n === 1 ? '' : 's'}
            </div>
          ) : (
            <ItemView key={r.item.id} item={r.item} cards={cards} now={now} onGo={go} />
          ),
        )}
        {running && (
          <div className={styles.thinking}>
            <span className="spinner" style={{ width: 10, height: 10 }} /> Magnet is thinking…
          </div>
        )}
        {error && <p className={styles.error}>{error}</p>}
      </div>
      <div className={styles.foot}>
        <div className={styles.chips}>
          {CHIPS.map((c) => (
            <button
              key={c}
              type="button"
              className={styles.chip}
              disabled={running && c !== 'Start a project'}
              onClick={() =>
                c === 'Start a project'
                  ? go('/new')
                  : void send(
                      c === 'Summarise today'
                        ? 'Summarise what happened today across my projects.'
                        : c,
                    )
              }
            >
              {c}
            </button>
          ))}
        </div>
        <form
          className={styles.input}
          onSubmit={(e) => {
            e.preventDefault();
            void send(text);
          }}
        >
          <label htmlFor="magnet-input" className="sr-only">
            Ask Magnet
          </label>
          <input
            id="magnet-input"
            value={text}
            placeholder={
              projectId ? `Ask Magnet about ${projectId}…` : 'Ask Magnet about any project…'
            }
            onChange={(e) => setText(e.target.value)}
          />
          {running ? (
            <button
              type="button"
              className={styles.send}
              aria-label="Stop Magnet"
              onClick={() => void stopMagnet()}
            >
              <Square size={12} aria-hidden="true" />
            </button>
          ) : (
            <button
              type="submit"
              className={styles.send}
              aria-label="Send to Magnet"
              disabled={!text.trim()}
            >
              <ArrowUp size={15} aria-hidden="true" />
            </button>
          )}
        </form>
      </div>
    </div>
  );
}

function ItemView({
  item,
  cards,
  now,
  onGo,
}: {
  item: ChatItem;
  cards: ProjectCard[];
  now: number;
  onGo(href: string): void;
}) {
  switch (item.kind) {
    case 'user':
      return (
        <div className={styles.userRow}>
          <div className={styles.user}>{item.text}</div>
        </div>
      );
    case 'text':
      return (
        <div className={styles.text}>
          <Markdown source={item.text} variant="chat" />
        </div>
      );
    case 'projects':
      return (
        <div className={styles.cards}>
          {item.ids.map((id) => {
            const c = cards.find((x) => x.id === id);
            if (!c) return null;
            return (
              <Link
                key={id}
                to={projectHref(c)}
                className={styles.mini}
                onClick={(e) => {
                  e.preventDefault();
                  onGo(projectHref(c));
                }}
              >
                <span className={styles.miniDot} data-state={c.draft ? 'draft' : c.state} />
                <span className={styles.miniName}>{c.name}</span>
                <span className={styles.miniMeta}>{miniMeta(c)}</span>
              </Link>
            );
          })}
        </div>
      );
    case 'action':
      return <ActionCard action={item.action} onGo={onGo} />;
    case 'approval':
      return (
        <ApprovalCard
          approval={item.approval}
          now={now}
          compact
          onAnswer={async (answer, reason) => {
            await answerApproval(item.approval.id, { answer, ...(reason ? { reason } : {}) });
          }}
        />
      );
    case 'turn-end':
      return !item.ok && !item.stopped ? (
        <p className={styles.error}>{item.error ?? 'Magnet stopped with an error.'}</p>
      ) : null;
    default:
      return null;
  }
}

function miniMeta(c: ProjectCard): string {
  const parts = [c.draft ? 'Survey draft' : STATE_LABEL[c.state]];
  if (c.phase && !c.draft) parts.push(PHASE_LABEL[c.phase]);
  const git = gitChip(c.git).label;
  if (c.git && git !== 'clean') parts.push(git);
  return parts.join(' · ');
}

function ActionCard({ action, onGo }: { action: MagnetAction; onGo(href: string): void }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const run = async (fn: () => Promise<MagnetAction>) => {
    setBusy(true);
    setError(null);
    try {
      const done = await fn();
      if (done.status === 'approved' && done.href) onGo(done.href);
    } catch (e) {
      setError(e instanceof ApiFailure ? e.message : 'That did not work.');
    } finally {
      setBusy(false);
    }
  };
  return (
    <section className={styles.action} data-status={action.status} aria-label={action.title}>
      <div className={styles.actionHead}>
        <MagnetAvatar size={16} />
        <span>{action.title}</span>
      </div>
      <p className={styles.actionDetail}>{action.detail}</p>
      {action.status === 'proposed' ? (
        <div className={styles.actionButtons}>
          <button
            type="button"
            className="btn btn-primary btn-sm"
            disabled={busy}
            onClick={() => void run(() => approveAction(action.id))}
          >
            Approve
          </button>
          <button
            type="button"
            className="btn btn-secondary btn-sm"
            disabled={busy}
            onClick={() => void run(() => cancelAction(action.id))}
          >
            Cancel
          </button>
        </div>
      ) : (
        <p className={styles.actionResult}>
          {action.status === 'approved'
            ? 'Approved. '
            : action.status === 'cancelled'
              ? 'Cancelled.'
              : 'Failed: '}
          {action.result}
          {action.status === 'approved' && action.href && (
            <>
              {' '}
              <button type="button" className={styles.linkBtn} onClick={() => onGo(action.href!)}>
                Open
              </button>
            </>
          )}
        </p>
      )}
      {error && <p className={styles.error}>{error}</p>}
    </section>
  );
}
