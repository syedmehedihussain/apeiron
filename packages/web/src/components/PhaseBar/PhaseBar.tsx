import { Check } from 'lucide-react';
import { PHASES, PHASE_LABEL, type Phase } from '@cherry/shared';
import styles from './PhaseBar.module.css';

type SegState = 'done' | 'current' | 'future';

function segState(i: number, current: number): SegState {
  if (current < 0) return 'future';
  return i < current ? 'done' : i === current ? 'current' : 'future';
}

/** Five 6 px segments with a label (cards and tables). */
export function PhaseBarCompact({ phase, width }: { phase: Phase | null; width?: number }) {
  const current = phase ? PHASES.indexOf(phase) : -1;
  const label = phase ? PHASE_LABEL[phase] : 'Unknown';
  return (
    <div className={styles.compact}>
      <div
        className={styles.segs}
        style={width ? { width } : undefined}
        role="img"
        aria-label={phase ? `Phase ${current + 1} of 5: ${label}` : 'Phase unknown'}
      >
        {PHASES.map((p, i) => (
          <span key={p} className={styles.seg} data-state={segState(i, current)} />
        ))}
      </div>
      <span className={styles.label}>{label}</span>
    </div>
  );
}

/** Five pills in the workspace top bar. */
export function PhaseBarFull({ phase }: { phase: Phase | null }) {
  const current = phase ? PHASES.indexOf(phase) : -1;
  return (
    <ol className={styles.full} aria-label="Project phase">
      {PHASES.map((p, i) => {
        const state = segState(i, current);
        return (
          <li
            key={p}
            className={styles.pill}
            data-state={state}
            aria-current={state === 'current' ? 'step' : undefined}
          >
            {state === 'done' && <Check size={12} strokeWidth={2.2} aria-hidden="true" />}
            {state === 'current' && <span className={styles.dot} aria-hidden="true" />}
            {PHASE_LABEL[p]}
          </li>
        );
      })}
    </ol>
  );
}
