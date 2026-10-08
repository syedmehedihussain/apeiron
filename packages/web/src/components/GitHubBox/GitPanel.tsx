import { useEffect, useState } from 'react';
import type { GitResult } from '@apeiron/shared';
import { ApiFailure } from '../../api/client.ts';
import { answerApproval, usePendingApprovals } from '../../api/chat.ts';
import { socket } from '../../api/socket.ts';
import { pullProject, pushProject, useGitInfo, usePullRequests } from '../../api/workspace.ts';
import { ApprovalCard } from '../ApprovalCard/ApprovalCard.tsx';
import { GitHubBox } from './GitHubBox.tsx';

/** The GitHub box with working Pull, Push (behind an approval) and the open PR list (M6). */
export function GitPanel({
  projectId,
  now,
  compact,
}: {
  projectId: string;
  now: number;
  compact?: boolean;
}) {
  const git = useGitInfo(projectId);
  const approvals = usePendingApprovals();
  const [pulling, setPulling] = useState(false);
  const [result, setResult] = useState<GitResult | null>(null);
  const [prsOpen, setPrsOpen] = useState(false);
  const prs = usePullRequests(projectId, prsOpen);
  const push = (approvals.data ?? []).find(
    (a) => a.projectId === projectId && a.kind === 'push' && a.status === 'pending',
  );

  useEffect(() => {
    return socket.on((event) => {
      if (event.type === 'git.result' && event.projectId === projectId)
        setResult({ action: event.action, ok: event.ok, message: event.message });
    });
  }, [projectId]);

  const fail = (action: GitResult['action'], e: unknown) =>
    setResult({
      action,
      ok: false,
      message: e instanceof ApiFailure ? e.message : `Could not ${action}.`,
    });

  return (
    <GitHubBox
      git={git.data}
      now={now}
      compact={compact}
      busy={pulling ? 'pull' : push ? 'push' : null}
      result={result}
      prs={prs.data ?? null}
      prsOpen={prsOpen}
      onTogglePrs={() => setPrsOpen(!prsOpen)}
      onPull={() => {
        setPulling(true);
        setResult(null);
        pullProject(projectId)
          .then(setResult, (e: unknown) => fail('pull', e))
          .finally(() => setPulling(false));
      }}
      onPush={() => {
        setResult(null);
        pushProject(projectId).catch((e: unknown) => fail('push', e));
      }}
    >
      {push && (
        <ApprovalCard
          approval={push}
          now={now}
          autoFocus
          compact
          onAnswer={async (answer, reason) => {
            await answerApproval(push.id, {
              answer: answer === 'allow_session' ? 'allow' : answer,
              ...(reason ? { reason } : {}),
            });
          }}
        />
      )}
    </GitHubBox>
  );
}
