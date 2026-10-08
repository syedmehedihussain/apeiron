import { Link } from 'react-router';
import { relativeTime, type ProjectCard as Card } from '@apeiron/shared';
import { PhaseBarCompact } from '../PhaseBar/PhaseBar.tsx';
import { GitChip, StatePill } from '../Pill/Pill.tsx';
import styles from './ProjectCard.module.css';

export function projectHref(card: Card): string {
  return card.state === 'uncalibrated'
    ? `/p/${encodeURIComponent(card.id)}/calibrate`
    : `/p/${encodeURIComponent(card.id)}`;
}

export function ProjectCard({ card, now }: { card: Card; now: number }) {
  return (
    <Link to={projectHref(card)} className={styles.card}>
      <div className={styles.head}>
        <span className={styles.name}>{card.name}</span>
        <StatePill state={card.state} />
      </div>
      <span className={styles.summary}>
        {card.summary || <span className={styles.muted}>No summary yet</span>}
      </span>
      <PhaseBarCompact phase={card.phase} />
      <div className={styles.next}>
        Next:{' '}
        <span className={styles.nextText}>
          {card.nextStep ?? (card.state === 'uncalibrated' ? 'Calibrate this folder' : '—')}
        </span>
      </div>
      <div className={styles.foot}>
        <GitChip git={card.git} />
        <span className={styles.last}>
          {card.lastWorked ? `Last worked ${relativeTime(card.lastWorked, now)}` : ''}
        </span>
      </div>
    </Link>
  );
}

export function ProjectCardSkeleton() {
  return (
    <div className={styles.card} aria-hidden="true">
      <span className="shimmer" style={{ height: 18, width: '50%' }} />
      <span className="shimmer" style={{ height: 32 }} />
      <span className="shimmer" style={{ height: 6 }} />
      <span className="shimmer" style={{ height: 16, width: '70%' }} />
    </div>
  );
}
