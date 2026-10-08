import { Link } from 'react-router';
import { relativeTime, type ProjectCard } from '@apeiron/shared';
import { PhaseBarCompact } from '../PhaseBar/PhaseBar.tsx';
import { GitChip, StatePill } from '../Pill/Pill.tsx';
import { projectHref } from '../ProjectCard/ProjectCard.tsx';
import styles from './ProjectTable.module.css';

export function ProjectTable({
  cards,
  now,
  loading,
}: {
  cards: ProjectCard[];
  now: number;
  loading?: boolean;
}) {
  return (
    <div className={styles.wrap}>
      <table className={styles.table}>
        <thead>
          <tr>
            <th scope="col">Project</th>
            <th scope="col">State</th>
            <th scope="col">Phase</th>
            <th scope="col">Stack</th>
            <th scope="col">Last worked</th>
            <th scope="col">Git</th>
            <th scope="col">
              <span className="sr-only">Action</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {loading &&
            Array.from({ length: 5 }, (_, i) => (
              <tr key={i} aria-hidden="true">
                <td colSpan={7}>
                  <span className="shimmer" style={{ display: 'block', height: 28 }} />
                </td>
              </tr>
            ))}
          {cards.map((c) => (
            <tr key={c.id}>
              <td>
                <div className={styles.project}>
                  <Link to={projectHref(c)} className={styles.name}>
                    {c.name}
                  </Link>
                  <span className={styles.summary}>{c.summary}</span>
                </div>
              </td>
              <td>
                <StatePill state={c.state} />
              </td>
              <td>
                <PhaseBarCompact phase={c.phase} width={110} />
              </td>
              <td>
                <div className={styles.stack}>
                  {c.stack.length ? (
                    c.stack.map((s) => (
                      <span key={s} className="tag">
                        {s}
                      </span>
                    ))
                  ) : (
                    <span className="tag">—</span>
                  )}
                </div>
              </td>
              <td className={styles.last}>
                {c.lastWorked ? relativeTime(c.lastWorked, now) : '—'}
              </td>
              <td>
                <GitChip git={c.git} />
              </td>
              <td className={styles.action}>
                {c.state === 'uncalibrated' && (
                  <Link to={projectHref(c)} className="btn btn-secondary btn-sm">
                    Calibrate
                  </Link>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
