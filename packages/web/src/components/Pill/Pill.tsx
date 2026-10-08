import type { ReactNode } from 'react';
import { STATE_LABEL, gitChip, type GitSummary, type ProjectState } from '@apeiron/shared';
import styles from './Pill.module.css';

export type PillTone = 'success' | 'accent' | 'warning' | 'danger' | 'neutral' | 'edited';

export function Pill({
  tone,
  dot,
  spin,
  children,
}: {
  tone: PillTone;
  dot?: boolean;
  spin?: boolean;
  children: ReactNode;
}) {
  return (
    <span className={styles.pill} data-tone={tone}>
      {spin ? (
        <span className={styles.spin} aria-hidden="true" />
      ) : dot ? (
        <span className={styles.dot} aria-hidden="true" />
      ) : null}
      {children}
    </span>
  );
}

const STATE_TONE: Record<ProjectState, PillTone> = {
  ready: 'success',
  cctop: 'accent',
  uncalibrated: 'warning',
};

export function StatePill({ state }: { state: ProjectState }) {
  return <Pill tone={STATE_TONE[state]}>{STATE_LABEL[state]}</Pill>;
}

export function GitChip({ git }: { git: GitSummary | null }) {
  const chip = gitChip(git);
  return (
    <span className={styles.git} data-tone={chip.tone}>
      {chip.label}
    </span>
  );
}
