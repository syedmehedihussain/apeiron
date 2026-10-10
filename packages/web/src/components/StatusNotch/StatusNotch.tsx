import { ChevronDown } from 'lucide-react';
import { useEffect, useId, useRef, useState } from 'react';
import { relativeTime, type StatusDoc } from '@cherry/shared';
import { useNow } from '../../lib/useNow.ts';
import styles from './StatusNotch.module.css';

interface StatusNotchProps {
  /** undefined while the project is still loading. */
  status: StatusDoc | null | undefined;
  /** STATUS.md mtime; a change while you watch makes the notch light up. */
  updatedAt: number | null;
  now: number;
  onUpdate?: () => void;
  updateDisabledReason?: string;
}

const FLASH_MS = 6000;

/**
 * STATUS.md as a small notch in the tab row: the next step at a glance, the full status in a
 * popover. It lights up for a few seconds when STATUS.md changes, without moving the chat.
 */
export function StatusNotch({
  status,
  updatedAt,
  now,
  onUpdate,
  updateDisabledReason,
}: StatusNotchProps) {
  const [open, setOpen] = useState(false);
  const [mountedAt] = useState(() => Date.now());
  const wrap = useRef<HTMLDivElement>(null);
  const popId = useId();
  const steps = status?.nextSteps.filter((s) => !s.done).slice(0, 5) ?? [];
  const next = steps[0]?.text ?? null;
  const tick = useNow(1000);
  const flash = !!updatedAt && updatedAt > mountedAt && tick - updatedAt < FLASH_MS;

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (!wrap.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  // The notch only says "Status"; the dot tells the state: green ok, blue just updated, red missing.
  const tone = status === undefined ? 'loading' : !status ? 'missing' : flash ? 'updated' : 'ok';
  const label =
    status === undefined
      ? 'Status · loading'
      : !status
        ? 'Status · no STATUS.md yet'
        : flash
          ? 'Status · just updated'
          : `Status${next ? ` · next: ${next}` : ''}`;

  return (
    <div className={styles.wrap} ref={wrap}>
      <button
        type="button"
        className={styles.notch}
        data-tone={tone}
        aria-expanded={open}
        aria-controls={popId}
        aria-label={`Project status. ${label}`}
        title={label}
        onClick={() => setOpen(!open)}
      >
        <span className={styles.dot} aria-hidden="true" />
        <span className={styles.text}>Status</span>
        <ChevronDown size={12} strokeWidth={2} aria-hidden="true" className={styles.chev} />
      </button>
      {open && (
        <section id={popId} className={styles.pop} aria-label="Project status">
          {!status ? (
            <p className={styles.para}>
              This project has no <span className="mono">_project/STATUS.md</span> yet. Claude
              writes one after calibration, or when you ask it to.
            </p>
          ) : (
            <>
              <div>
                <div className={styles.label}>Where we left off</div>
                <p className={styles.para}>{status.leftOff ?? 'Nothing written yet.'}</p>
              </div>
              <div>
                <div className={styles.label}>Next steps</div>
                <ul className={styles.steps}>
                  {steps.length === 0 && <li className={styles.muted}>No open steps.</li>}
                  {steps.map((s, i) => (
                    <li key={s.text} data-first={i === 0 || undefined}>
                      <span className={styles.box} aria-hidden="true" />
                      {s.text}
                    </li>
                  ))}
                </ul>
              </div>
            </>
          )}
          <div className={styles.foot}>
            <span className={styles.muted}>
              {updatedAt ? `Updated ${relativeTime(updatedAt, now)}` : ''}
            </span>
            <button
              type="button"
              className="btn btn-secondary btn-sm"
              disabled={!onUpdate}
              title={
                onUpdate
                  ? 'Ask Claude to rewrite STATUS.md from this session'
                  : updateDisabledReason
              }
              onClick={() => {
                setOpen(false);
                onUpdate?.();
              }}
            >
              Update status
            </button>
          </div>
        </section>
      )}
    </div>
  );
}
