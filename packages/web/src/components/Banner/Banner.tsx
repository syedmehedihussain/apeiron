import { AlertCircle } from 'lucide-react';
import { Link } from 'react-router';
import styles from './Banner.module.css';

export function ClaudeMissingBanner({
  onCheckAgain,
  checking,
}: {
  onCheckAgain: () => void;
  checking: boolean;
}) {
  return (
    <div role="alert" className={styles.banner}>
      <AlertCircle size={15} strokeWidth={2} className={styles.icon} aria-hidden="true" />
      <span className={styles.title}>Claude Code isn't installed or logged in.</span>
      <span className={styles.why}>
        Apeiron needs it to plan and build. Your projects are still readable.
      </span>
      <span className={styles.spacer} />
      <Link to="/settings/claude" className={styles.fix}>
        How to fix
      </Link>
      <button
        type="button"
        className="btn btn-secondary btn-sm"
        onClick={onCheckAgain}
        disabled={checking}
      >
        {checking ? 'Checking…' : 'Check again'}
      </button>
    </div>
  );
}
