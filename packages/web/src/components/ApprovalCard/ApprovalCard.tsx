import { Check, ChevronRight, ShieldAlert, X } from 'lucide-react';
import { useEffect, useId, useRef, useState } from 'react';
import { relativeTime, type Approval, type ApprovalFile } from '@cherry/shared';
import { tildify } from '../../lib/paths.ts';
import { Pill } from '../Pill/Pill.tsx';
import styles from './ApprovalCard.module.css';

const PREVIEW_LINES = 12;

interface ApprovalCardProps {
  approval: Approval;
  now: number;
  onAnswer(answer: 'allow' | 'allow_session' | 'deny', reason?: string): Promise<void>;
  /** Focus the card when it appears (the card, never Allow, so a stray Enter cannot approve). */
  autoFocus?: boolean;
  /** Narrow columns (the GitHub box): no status pill, no "Runs in" note. */
  compact?: boolean;
}

export function ApprovalCard({ approval, now, onAnswer, autoFocus, compact }: ApprovalCardProps) {
  const ref = useRef<HTMLDivElement>(null);
  const titleId = useId();
  const [busy, setBusy] = useState(false);
  const [denying, setDenying] = useState(false);
  const [reason, setReason] = useState('');

  useEffect(() => {
    if (autoFocus && approval.status === 'pending') ref.current?.focus();
  }, [autoFocus, approval.status]);

  if (approval.status !== 'pending') return <AnsweredLine approval={approval} now={now} />;

  const answer = async (a: 'allow' | 'allow_session' | 'deny', r?: string) => {
    setBusy(true);
    try {
      await onAnswer(a, r);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div
      ref={ref}
      role="group"
      aria-labelledby={titleId}
      tabIndex={-1}
      className={styles.card}
      data-approval={approval.id}
    >
      <div className={styles.head}>
        <div className={styles.titleRow}>
          <span className={styles.icon}>
            <ShieldAlert size={13} strokeWidth={2} aria-hidden="true" />
          </span>
          <h3 id={titleId}>{approval.title}</h3>
        </div>
        {!compact && (
          <Pill tone="warning" dot>
            Waiting for approval
          </Pill>
        )}
      </div>
      {approval.kind === 'edit' &&
        approval.files.map((f, i) => <FileDiff key={f.path} file={f} defaultOpen={i === 0} />)}
      {(approval.kind === 'command' || approval.kind === 'push') && (
        <div className={styles.command}>
          <code>
            <span className={styles.dollar}>$</span> {approval.command}
          </code>
          <span className={styles.in}>in {tildify(approval.cwd)}</span>
        </div>
      )}
      {(approval.kind === 'other' || approval.kind === 'push') && approval.detail && (
        <pre className={styles.detail}>{approval.detail}</pre>
      )}
      {denying && (
        <div className={styles.reason}>
          <label htmlFor={`${titleId}-reason`}>Tell Claude why (optional)</label>
          <input
            id={`${titleId}-reason`}
            className="input"
            value={reason}
            placeholder="e.g. Use the existing helper instead"
            autoFocus
            onChange={(e) => setReason(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') void answer('deny', reason);
              if (e.key === 'Escape') setDenying(false);
            }}
          />
        </div>
      )}
      <div className={styles.foot}>
        {denying ? (
          <>
            <button
              type="button"
              className="btn btn-secondary btn-md"
              disabled={busy}
              onClick={() => setDenying(false)}
            >
              Back
            </button>
            <span className={styles.spacer} />
            <button
              type="button"
              className="btn btn-danger btn-md"
              disabled={busy}
              onClick={() => void answer('deny', reason)}
            >
              Deny
            </button>
          </>
        ) : (
          <>
            <button
              type="button"
              className="btn btn-primary btn-md"
              disabled={busy}
              onClick={() => void answer('allow')}
            >
              Allow
            </button>
            {approval.kind !== 'push' && (
              <button
                type="button"
                className="btn btn-secondary btn-md"
                disabled={busy}
                onClick={() => void answer('allow_session')}
              >
                Allow for this session
              </button>
            )}
            <span className={styles.spacer} />
            {!compact && (
              <span className={styles.runs}>
                Runs in <span className="mono">{tildify(approval.cwd)}</span>
              </span>
            )}
            <button
              type="button"
              className="btn btn-danger btn-md"
              disabled={busy}
              onClick={() => setDenying(true)}
            >
              Deny
            </button>
          </>
        )}
      </div>
    </div>
  );
}

export function FileDiff({ file, defaultOpen }: { file: ApprovalFile; defaultOpen: boolean }) {
  const [open, setOpen] = useState(defaultOpen);
  const [all, setAll] = useState(false);
  const shown = all ? file.lines : file.lines.slice(0, PREVIEW_LINES);
  return (
    <div className={styles.file}>
      <button
        type="button"
        className={styles.fileHead}
        aria-expanded={open}
        onClick={() => setOpen(!open)}
      >
        <ChevronRight
          size={12}
          strokeWidth={2}
          aria-hidden="true"
          style={{ transform: open ? 'rotate(90deg)' : undefined }}
        />
        <span className="mono">{file.path}</span>
        {file.isNew && <span className={styles.newTag}>New file</span>}
        <span className={styles.spacer} />
        <span className={styles.counts}>
          <span className={styles.add}>+{file.added}</span>{' '}
          <span className={file.removed ? styles.del : styles.zero}>−{file.removed}</span>
        </span>
      </button>
      {open && (
        <div className={styles.diff}>
          {shown.map((l, i) => (
            <div key={i} className={styles.line} data-kind={l.kind}>
              <span className={styles.num}>{l.b ?? l.a}</span>
              <span className={styles.sign}>
                {l.kind === ' ' ? '' : l.kind === '-' ? '−' : '+'}
              </span>
              <span>{l.text || ' '}</span>
            </div>
          ))}
          {file.lines.length === 0 && <div className={styles.more}>No changes to show.</div>}
          {!all && file.lines.length > PREVIEW_LINES && (
            <div className={styles.more}>
              {file.lines.length - PREVIEW_LINES} more lines ·{' '}
              <button type="button" onClick={() => setAll(true)}>
                Show all
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function AnsweredLine({ approval, now }: { approval: Approval; now: number }) {
  const allowed = approval.status === 'allowed' || approval.status === 'allowed_session';
  const what =
    approval.kind === 'command' || approval.kind === 'push' ? (
      <>
        Run <span className="mono">{approval.command}</span>
      </>
    ) : approval.kind === 'edit' ? (
      `Edit ${approval.files.length} file${approval.files.length === 1 ? '' : 's'} · ${approval.files.map((f) => f.path.split('/').pop()).join(', ')}`
    ) : (
      `Use ${approval.tool}`
    );
  const label = allowed
    ? approval.status === 'allowed_session'
      ? 'Allowed for session'
      : 'Allowed'
    : approval.status === 'cancelled'
      ? 'Cancelled'
      : 'Denied';
  return (
    <div
      className={styles.answered}
      data-allowed={allowed || undefined}
      data-status={approval.status}
    >
      <span className={styles.answeredIcon}>
        {allowed ? (
          <Check size={11} strokeWidth={2.4} aria-hidden="true" />
        ) : (
          <X size={11} strokeWidth={2.4} aria-hidden="true" />
        )}
      </span>
      <span className={styles.answeredLabel}>{label}</span>
      <span className={styles.answeredWhat}>{what}</span>
      {approval.reason && approval.status === 'denied' && (
        <span className={styles.answeredReason}>“{approval.reason}”</span>
      )}
      <span className={styles.spacer} />
      <span className={styles.when}>
        {approval.answeredAt ? relativeTime(approval.answeredAt, now) : ''}
      </span>
    </div>
  );
}
