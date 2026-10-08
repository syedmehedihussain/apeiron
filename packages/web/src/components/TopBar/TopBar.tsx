import { Fragment } from 'react';
import { SlidersHorizontal } from 'lucide-react';
import appMark from '../../assets/app-mark.svg';
import magnet from '../../assets/magnet/magnet-48.svg';
import { ClaudeStatus, type ClaudeState } from '../ClaudeStatus/ClaudeStatus.tsx';
import styles from './TopBar.module.css';

export interface Crumb {
  label: string;
  href?: string;
}

interface TopBarProps {
  crumbs: Crumb[];
  claude: ClaudeState;
}

export function TopBar({ crumbs, claude }: TopBarProps) {
  return (
    <header className={styles.bar}>
      <a href="/" className={styles.home} aria-label="Apeiron home">
        <img src={appMark} width={22} height={22} alt="" />
        <span className={styles.wordmark}>Apeiron</span>
      </a>
      {crumbs.length > 0 && (
        <nav aria-label="Breadcrumb" className={styles.crumbs}>
          {crumbs.map((crumb, i) => (
            <Fragment key={`${i}-${crumb.label}`}>
              <span className={styles.sep} aria-hidden="true">
                /
              </span>
              {crumb.href && i < crumbs.length - 1 ? (
                <a href={crumb.href} className={styles.crumb}>
                  {crumb.label}
                </a>
              ) : (
                <span className={styles.current} aria-current="page">
                  {crumb.label}
                </span>
              )}
            </Fragment>
          ))}
        </nav>
      )}
      <span className={styles.spacer} />
      <ClaudeStatus state={claude} />
      <a href="/settings/general" className={styles.iconButton} aria-label="Settings">
        <SlidersHorizontal size={16} strokeWidth={1.6} aria-hidden="true" />
      </a>
      <button type="button" className={styles.magnet} aria-label="Open Magnet">
        <img src={magnet} width={22} height={22} alt="" />
      </button>
    </header>
  );
}
