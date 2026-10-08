import styles from './ClaudeStatus.module.css';

/** `checking` is shown until the daemon has looked for the `claude` CLI. */
export type ClaudeState = 'checking' | 'ok' | 'working' | 'missing';

const LABEL: Record<ClaudeState, string> = {
  checking: 'Claude Code',
  ok: 'Claude Code',
  working: 'Claude Code',
  missing: 'Claude Code not found',
};

const DESCRIPTION: Record<ClaudeState, string> = {
  checking: 'Checking for Claude Code',
  ok: 'Claude Code is ready',
  working: 'Claude Code is working',
  missing: 'Claude Code is not installed or not logged in',
};

export function ClaudeStatus({ state }: { state: ClaudeState }) {
  return (
    <span className={styles.status} data-state={state} title={DESCRIPTION[state]}>
      <span className={styles.dot} aria-hidden="true" />
      {LABEL[state]}
      <span className={styles.srOnly}>: {DESCRIPTION[state]}</span>
    </span>
  );
}
