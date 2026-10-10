import {
  Bot,
  FileText,
  FlaskConical,
  HeartPulse,
  Package,
  Play,
  ShieldCheck,
  Square,
  type LucideIcon,
} from 'lucide-react';
import { useState } from 'react';
import { useNavigate } from 'react-router';
import { relativeTime, type ReportMeta, type ScanAgent } from '@apeiron/shared';
import { ApiFailure } from '../../api/client.ts';
import { runScan, stopScan, useLiveScans, useScanAgents } from '../../api/scans.ts';
import styles from './ScanAgents.module.css';

export const SCAN_ICON: Record<ScanAgent['icon'], LucideIcon> = {
  shield: ShieldCheck,
  flask: FlaskConical,
  heart: HeartPulse,
  package: Package,
  bot: Bot,
};

const VERDICT: Record<ReportMeta['verdict'], string> = {
  pass: 'Pass',
  warn: 'Needs work',
  fail: 'Problems',
  none: 'Report',
};

/** "1 high, 2 low" from the finding counts, worst first. */
export function countsLine(r: ReportMeta): string | null {
  if (!r.counts) return null;
  const parts = (['critical', 'high', 'medium', 'low'] as const)
    .filter((k) => r.counts![k] > 0)
    .map((k) => `${r.counts![k]} ${k}`);
  return parts.length ? parts.join(', ') : 'no findings';
}

export const reportTone = (r: ReportMeta) => (r.status === 'failed' ? 'failed' : r.verdict);

/** Ready-made agents: one click scans the project and writes a report you read in the centre. */
export function ScanAgents({ projectId, now }: { projectId: string; now: number }) {
  const scans = useScanAgents(projectId);
  useLiveScans(projectId);
  const [error, setError] = useState<string | null>(null);
  if (!scans.data) return null;
  return (
    <section className={styles.wrap} aria-label="Scan agents">
      <div className={styles.head}>
        <span className="label">Scans</span>
        <span
          className={styles.howto}
          title={
            'Add your own: ~/.apeiron/agents/<name>.md\n\n---\nname: Accessibility check\ndescription: Labels and contrast\nicon: shield | flask | heart | package | bot\nmodel: sonnet\ncommands: pnpm lint, pnpm test\n---\nWhat to look for and how to report it.'
          }
        >
          Add your own
        </span>
      </div>
      <ul className={styles.list}>
        {scans.data.agents.map((a) => (
          <ScanRow key={a.id} projectId={projectId} agent={a} now={now} onError={setError} />
        ))}
      </ul>
      {error && <p className={styles.error}>{error}</p>}
      {scans.data.problems.map((p) => (
        <p key={p.file} className={styles.error}>
          <span className="mono">~/.apeiron/agents/{p.file}</span>: {p.error}
        </p>
      ))}
    </section>
  );
}

function ScanRow({
  projectId,
  agent: a,
  now,
  onError,
}: {
  projectId: string;
  agent: ScanAgent;
  now: number;
  onError(e: string | null): void;
}) {
  const navigate = useNavigate();
  const [busy, setBusy] = useState(false);
  const Icon = SCAN_ICON[a.icon];
  const step = a.run?.activity.at(-1);
  const open = () =>
    void navigate(
      `/p/${encodeURIComponent(projectId)}/reports/${a.id}${a.last ? `/${a.last.id}` : ''}`,
    );
  const act = async (fn: () => Promise<unknown>) => {
    setBusy(true);
    onError(null);
    try {
      await fn();
    } catch (e) {
      onError(e instanceof ApiFailure ? e.message : 'Something went wrong.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <li className={styles.row} data-running={a.run ? true : undefined}>
      <span className={styles.icon} data-icon={a.icon} aria-hidden="true">
        <Icon size={15} strokeWidth={1.8} />
      </span>
      <div className={styles.body}>
        <div className={styles.name}>
          {a.name}
          {a.source === 'custom' && <span className={styles.custom}>custom</span>}
        </div>
        <div className={styles.sub}>
          {a.run ? (
            <>
              <span className="spinner" style={{ width: 9, height: 9 }} aria-hidden="true" />
              <span className={styles.step}>
                {step?.kind === 'tool' ? step.target : 'Starting…'}
              </span>
            </>
          ) : a.last ? (
            <>
              <span className={styles.verdict} data-tone={reportTone(a.last)}>
                {a.last.status === 'failed' ? 'Failed' : VERDICT[a.last.verdict]}
              </span>
              <span className={styles.step}>
                {relativeTime(a.last.startedAt, now)}
                {countsLine(a.last) ? ` · ${countsLine(a.last)}` : ''}
              </span>
            </>
          ) : (
            <span className={styles.step} title={a.description}>
              {a.description}
            </span>
          )}
        </div>
      </div>
      <div className={styles.actions}>
        {a.last && !a.run && (
          <button
            type="button"
            className={styles.btn}
            data-icon-only
            onClick={open}
            title={`Open the report: ${a.last.summary}`}
            aria-label={`Open the ${a.name} report`}
          >
            <FileText size={13} strokeWidth={1.8} aria-hidden="true" />
          </button>
        )}
        {a.run ? (
          <button
            type="button"
            className={styles.btn}
            disabled={busy}
            onClick={() => void act(() => stopScan(projectId, a.id))}
            aria-label={`Stop ${a.name}`}
          >
            <Square size={9} fill="currentColor" aria-hidden="true" />
            Stop
          </button>
        ) : (
          <button
            type="button"
            className={styles.btn}
            data-primary
            disabled={busy}
            onClick={() => void act(() => runScan(projectId, a.id))}
            title={`Scan the project read-only with ${a.model}${a.commands.length ? `. May run: ${a.commands.slice(0, 6).join(', ')}${a.commands.length > 6 ? '…' : ''}` : ''}`}
            aria-label={`Run ${a.name}`}
          >
            <Play size={10} fill="currentColor" aria-hidden="true" />
            Run
          </button>
        )}
      </div>
    </li>
  );
}
