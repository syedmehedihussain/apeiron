import { Fragment, type ReactNode } from 'react';
import { Link } from 'react-router';
import { SlidersHorizontal } from 'lucide-react';
import type { Phase } from '@apeiron/shared';
import appMark from '../../assets/app-mark.svg';
import { useHealth } from '../../api/queries.ts';
import { useSocketStatus } from '../../api/socket.ts';
import { useUi } from '../../state/ui.ts';
import { ClaudeStatus, type ClaudeState } from '../ClaudeStatus/ClaudeStatus.tsx';
import { MagnetAvatar } from '../MagnetAvatar/MagnetAvatar.tsx';
import { PhaseBarFull } from '../PhaseBar/PhaseBar.tsx';
import { Pill } from '../Pill/Pill.tsx';
import styles from './TopBar.module.css';

export interface Crumb {
  label: string;
  href?: string;
}

interface TopBarProps {
  crumbs: Crumb[];
  /** Workspace only: the full phase bar in the centre. */
  phase?: Phase | null;
  /** A status pill after the crumbs ("Approval needed", "Claude is working"). */
  status?: ReactNode;
  /** Replaces the right side (survey: "Draft saved", Save and exit). */
  right?: ReactNode;
  /** Overrides the health-based state (e.g. working while a turn runs). */
  claude?: ClaudeState;
}

export function useClaudeState(): ClaudeState {
  const health = useHealth();
  if (!health.data) return 'checking';
  return health.data.claude.found && health.data.claude.loggedIn ? 'ok' : 'missing';
}

export function TopBar({ crumbs, phase, status, right, claude }: TopBarProps) {
  const healthState = useClaudeState();
  const socketStatus = useSocketStatus((s) => s.status);
  const openMagnet = useUi((s) => s.openMagnet);

  return (
    <header className={styles.bar}>
      <div className={styles.left}>
        <Link to="/" className={styles.home} aria-label="Apeiron home">
          <img src={appMark} width={22} height={22} alt="" />
          <span className={styles.wordmark}>Apeiron</span>
        </Link>
        {crumbs.length > 0 && (
          <nav aria-label="Breadcrumb" className={styles.crumbs}>
            {crumbs.map((crumb, i) => (
              <Fragment key={`${i}-${crumb.label}`}>
                <span className={styles.sep} aria-hidden="true">
                  /
                </span>
                {crumb.href && i < crumbs.length - 1 ? (
                  <Link to={crumb.href} className={styles.crumb}>
                    {crumb.label}
                  </Link>
                ) : (
                  <span className={styles.current} aria-current="page">
                    {crumb.label}
                  </span>
                )}
              </Fragment>
            ))}
          </nav>
        )}
        {status}
        {socketStatus === 'reconnecting' && (
          <Pill tone="warning" dot>
            Reconnecting…
          </Pill>
        )}
      </div>
      <div className={styles.centre}>{phase !== undefined && <PhaseBarFull phase={phase} />}</div>
      <div className={styles.right}>
        {right ?? (
          <>
            <ClaudeStatus state={claude ?? healthState} />
            <Link to="/settings/general" className={styles.iconButton} aria-label="Settings">
              <SlidersHorizontal size={16} strokeWidth={1.6} aria-hidden="true" />
            </Link>
            <button
              type="button"
              className={styles.magnet}
              aria-label="Open Magnet"
              onClick={() => openMagnet()}
            >
              <MagnetAvatar size={48} display={22} />
            </button>
          </>
        )}
      </div>
    </header>
  );
}
