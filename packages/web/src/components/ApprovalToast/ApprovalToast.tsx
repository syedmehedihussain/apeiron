import { ShieldAlert } from 'lucide-react';
import { useLocation, useNavigate } from 'react-router';
import { answerApproval, useLiveApprovals, usePendingApprovals } from '../../api/chat.ts';
import styles from './ApprovalToast.module.css';

/** Approvals that arrive while you look at something else (W-14). */
export function ApprovalToasts() {
  useLiveApprovals();
  const approvals = usePendingApprovals();
  const location = useLocation();
  const navigate = useNavigate();
  const visible = (approvals.data ?? []).filter((a) => {
    const chatPath = `/p/${encodeURIComponent(a.projectId)}`;
    // A push approval sits in the GitHub box, which every workspace tab shows.
    if (a.kind === 'push' && location.pathname.startsWith(chatPath)) return false;
    return !(location.pathname === chatPath || location.pathname === `${chatPath}/`);
  });
  if (visible.length === 0) return null;
  return (
    <div className={styles.stack} role="region" aria-label="Approvals waiting">
      {visible.slice(-3).map((a) => (
        <div key={a.id} className={styles.toast} role="alert">
          <div className={styles.head}>
            <ShieldAlert size={13} strokeWidth={2} aria-hidden="true" className={styles.icon} />
            <span className={styles.title}>
              {a.title} <span className={styles.project}>· {a.projectId}</span>
            </span>
          </div>
          <code className={styles.what}>
            {a.command ?? a.files.map((f) => f.path).join(', ') ?? a.tool}
          </code>
          <div className={styles.actions}>
            <button
              type="button"
              className="btn btn-primary btn-sm"
              onClick={() => {
                const target = a.source.startsWith('agent:')
                  ? `/p/${encodeURIComponent(a.projectId)}?agent=${a.source.slice(6)}`
                  : `/p/${encodeURIComponent(a.projectId)}`;
                void navigate(target);
              }}
            >
              Review
            </button>
            <button
              type="button"
              className="btn btn-danger btn-sm"
              onClick={() => void answerApproval(a.id, { answer: 'deny' })}
            >
              Deny
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}
