import { ChevronDown } from 'lucide-react';
import { relativeTime, type StatusDoc } from '@apeiron/shared';
import styles from './StatusBlock.module.css';

interface StatusBlockProps {
  status: StatusDoc | null;
  updatedAt: number | null;
  now: number;
  expanded: boolean;
  onToggle(): void;
  onUpdate?: () => void;
  updateDisabledReason?: string;
}

/** "Where we left off" + "Next steps" from STATUS.md, full or as one compact line. */
export function StatusBlock({
  status,
  updatedAt,
  now,
  expanded,
  onToggle,
  onUpdate,
  updateDisabledReason,
}: StatusBlockProps) {
  if (!status) {
    return (
      <div className={styles.compact} data-empty>
        <span className={styles.label}>Where we left off</span>
        <span className={styles.line}>No STATUS.md yet. Claude writes one after calibration.</span>
      </div>
    );
  }
  const steps = status.nextSteps.filter((s) => !s.done).slice(0, 3);
  const next = steps[0]?.text ?? '—';

  if (!expanded) {
    return (
      <button type="button" className={styles.compact} aria-expanded={false} onClick={onToggle}>
        <span className={styles.label}>Where we left off</span>
        <span className={styles.line}>{status.leftOff ?? '—'}</span>
        <span className={styles.next}>
          Next: <span className={styles.nextText}>{next}</span>
        </span>
        <ChevronDown size={12} strokeWidth={2} aria-hidden="true" className={styles.chev} />
      </button>
    );
  }

  return (
    <section aria-label="Project status" className={styles.full}>
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
      <div className={styles.side}>
        <span className={styles.updated}>
          {updatedAt ? `Updated ${relativeTime(updatedAt, now)}` : ''}
        </span>
        <button
          type="button"
          className={styles.update}
          onClick={onUpdate}
          disabled={!onUpdate}
          title={
            onUpdate ? 'Ask Claude to rewrite STATUS.md from this session' : updateDisabledReason
          }
        >
          Update status
        </button>
        <button type="button" className={styles.collapse} onClick={onToggle} aria-expanded>
          Collapse
        </button>
      </div>
    </section>
  );
}
