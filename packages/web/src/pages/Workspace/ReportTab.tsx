import { ArrowUpRight, Play } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router';
import { relativeTime, type ReportMeta } from '@cherry/shared';
import { ApiFailure } from '../../api/client.ts';
import { runScan, useLiveScans, useReport, useReports, useScanAgents } from '../../api/scans.ts';
import { openInEditor } from '../../api/workspace.ts';
import { Markdown } from '../../components/Markdown/Markdown.tsx';
import { Pill, type PillTone } from '../../components/Pill/Pill.tsx';
import { countsLine, reportTone, SCAN_ICON } from '../../components/ScanAgents/ScanAgents.tsx';
import styles from './Workspace.module.css';

const TONE: Record<ReturnType<typeof reportTone>, { tone: PillTone; label: string }> = {
  pass: { tone: 'success', label: 'Pass' },
  warn: { tone: 'warning', label: 'Needs work' },
  fail: { tone: 'danger', label: 'Problems found' },
  failed: { tone: 'danger', label: 'Did not finish' },
  none: { tone: 'neutral', label: 'Report' },
};

const when = (at: number) =>
  new Date(at).toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });

/** One scan agent's reports: history on the left, the chosen report on the right. */
export function ReportTab({
  projectId,
  agentId,
  reportId,
  now,
}: {
  projectId: string;
  agentId: string;
  reportId: string | null;
  now: number;
}) {
  const navigate = useNavigate();
  const scans = useScanAgents(projectId);
  useLiveScans(projectId);
  const list = useReports(projectId, agentId);
  const agent = scans.data?.agents.find((a) => a.id === agentId);
  const reports = list.data?.reports ?? [];
  const href = (id: string) => `/p/${encodeURIComponent(projectId)}/reports/${agentId}/${id}`;
  const newest = reports[0]?.id;

  // No report chosen (or a new one just landed while looking at the empty state): show the newest.
  useEffect(() => {
    if (!reportId && newest) void navigate(href(newest), { replace: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reportId, newest]);

  return (
    <div className={styles.docs}>
      <nav aria-label="Report history" className={styles.docList}>
        <div className={styles.docGroup}>
          <div className="label" style={{ padding: '0 8px 4px' }}>
            {agent?.name ?? agentId}
          </div>
          {list.data && reports.length === 0 && (
            <p className={styles.muted} style={{ padding: '0 8px' }}>
              No reports yet.
            </p>
          )}
          {reports.map((r) => (
            <Link
              key={r.id}
              to={href(r.id)}
              className={styles.docLink}
              aria-current={r.id === reportId ? 'page' : undefined}
            >
              <span className={styles.reportDot} data-tone={reportTone(r)} aria-hidden="true" />
              <span className={styles.docTitle}>
                {when(r.startedAt)}
                <span className={styles.reportCounts}>
                  {countsLine(r) ?? TONE[reportTone(r)].label}
                </span>
              </span>
            </Link>
          ))}
        </div>
      </nav>
      <div className={styles.docScroll}>
        {reportId ? (
          <ReportReader
            projectId={projectId}
            agentId={agentId}
            reportId={reportId}
            name={agent?.name ?? agentId}
            icon={agent?.icon ?? 'bot'}
            running={!!agent?.run}
            now={now}
          />
        ) : (
          <EmptyReport projectId={projectId} agentId={agentId} running={!!agent?.run} />
        )}
      </div>
    </div>
  );
}

function RunAgain({
  projectId,
  agentId,
  running,
}: {
  projectId: string;
  agentId: string;
  running: boolean;
}) {
  const [error, setError] = useState<string | null>(null);
  return (
    <>
      <button
        type="button"
        className="btn btn-secondary btn-md"
        disabled={running}
        onClick={() =>
          void runScan(projectId, agentId).catch((e: unknown) =>
            setError(e instanceof ApiFailure ? e.message : 'Could not start the scan.'),
          )
        }
      >
        {running ? (
          <>
            <span className="spinner" style={{ width: 10, height: 10 }} aria-hidden="true" />
            Scanning…
          </>
        ) : (
          <>
            <Play size={11} fill="currentColor" aria-hidden="true" />
            Run again
          </>
        )}
      </button>
      {error && <span className={styles.reportError}>{error}</span>}
    </>
  );
}

function EmptyReport({
  projectId,
  agentId,
  running,
}: {
  projectId: string;
  agentId: string;
  running: boolean;
}) {
  return (
    <div className={styles.article}>
      <p className={styles.muted}>
        {running
          ? 'Scanning now. The report opens here when it is done.'
          : 'This agent has not written a report for this project yet.'}
      </p>
      {!running && <RunAgain projectId={projectId} agentId={agentId} running={false} />}
    </div>
  );
}

function ReportReader({
  projectId,
  agentId,
  reportId,
  name,
  icon,
  running,
  now,
}: {
  projectId: string;
  agentId: string;
  reportId: string;
  name: string;
  icon: keyof typeof SCAN_ICON;
  running: boolean;
  now: number;
}) {
  const report = useReport(projectId, agentId, reportId);
  if (report.isError)
    return (
      <p className={styles.muted} style={{ padding: 36 }}>
        {(report.error as Error).message}
      </p>
    );
  if (!report.data) return null;
  const m: ReportMeta = report.data.meta;
  const Icon = SCAN_ICON[icon];
  const tone = TONE[reportTone(m)];
  const counts = countsLine(m);
  const secs = Math.max(1, Math.round((m.endedAt - m.startedAt) / 1000));

  return (
    <article className={styles.article}>
      <div className={styles.docHead}>
        <div className={styles.docMeta}>
          <div className={styles.reportKicker}>
            <Icon size={14} strokeWidth={1.8} aria-hidden="true" />
            Agent report
          </div>
          <h1>{name}</h1>
          <div className={styles.docSub}>
            <Pill tone={tone.tone} dot>
              {tone.label}
            </Pill>
            {counts && <span>{counts}</span>}
            <span>·</span>
            <span title={new Date(m.startedAt).toLocaleString()}>
              {relativeTime(m.startedAt, now)}
            </span>
            <span>·</span>
            <span>
              {m.model} · {secs < 90 ? `${secs}s` : `${Math.round(secs / 60)} min`}
            </span>
          </div>
        </div>
        <div className={styles.docActions}>
          <RunAgain projectId={projectId} agentId={agentId} running={running} />
          <button
            type="button"
            className="btn btn-ghost btn-md"
            onClick={() => void openInEditor(projectId, m.path)}
          >
            Open in editor
            <ArrowUpRight size={12} strokeWidth={2} aria-hidden="true" />
          </button>
        </div>
      </div>
      {m.summary && <p className={styles.reportSummary}>{m.summary}</p>}
      <div className={styles.rule} />
      <Markdown source={report.data.markdown} docPath={m.path} />
    </article>
  );
}
