import { ArrowUpRight } from 'lucide-react';
import { useEffect } from 'react';
import { Link, useNavigate } from 'react-router';
import { relativeTime, type DocItem } from '@cherry/shared';
import { openInEditor, useDocs, useFile } from '../../api/workspace.ts';
import { Markdown } from '../../components/Markdown/Markdown.tsx';
import styles from './Workspace.module.css';

interface DocsTabProps {
  projectId: string;
  docPath: string | null;
  now: number;
  onAskClaude?: (docPath: string) => void;
}

export function DocsTab({ projectId, docPath, now, onAskClaude }: DocsTabProps) {
  const docs = useDocs(projectId);
  const navigate = useNavigate();
  const href = (p: string) => `/p/${encodeURIComponent(projectId)}/docs/${p}`;
  const all = docs.data
    ? [...docs.data.project, ...docs.data.engineering, ...docs.data.decisions]
    : [];
  const first = docs.data?.engineering[0] ?? docs.data?.project[0];

  useEffect(() => {
    if (!docPath && first) void navigate(href(first.path), { replace: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [docPath, first?.path]);

  const group = (label: string, items: DocItem[]) =>
    items.length > 0 && (
      <div className={styles.docGroup}>
        <div className="label" style={{ padding: '0 8px 4px' }}>
          {label}
        </div>
        {items.map((d) => (
          <Link
            key={d.path}
            to={href(d.path)}
            className={styles.docLink}
            aria-current={d.path === docPath ? 'page' : undefined}
          >
            <span className={styles.docTag}>{d.tag}</span>
            <span className={styles.docTitle}>{d.title}</span>
          </Link>
        ))}
      </div>
    );

  return (
    <div className={styles.docs}>
      <nav aria-label="Documents" className={styles.docList}>
        {docs.data && all.length === 0 && (
          <p className={styles.muted}>No documents yet. Calibration writes them.</p>
        )}
        {docs.data && (
          <>
            {group('Project', docs.data.project)}
            {group('Engineering', docs.data.engineering)}
            {group('Decisions', docs.data.decisions)}
          </>
        )}
      </nav>
      <div className={styles.docScroll}>
        {docPath ? (
          <DocReader
            projectId={projectId}
            path={docPath}
            item={all.find((d) => d.path === docPath)}
            now={now}
            href={href}
            adrPath={(n) => docs.data?.decisions.find((d) => d.tag === n)?.path ?? null}
            onAskClaude={onAskClaude}
          />
        ) : (
          <p className={styles.muted} style={{ padding: 36 }}>
            Pick a document.
          </p>
        )}
      </div>
    </div>
  );
}

function DocReader({
  projectId,
  path,
  item,
  now,
  href,
  adrPath,
  onAskClaude,
}: {
  projectId: string;
  path: string;
  item: DocItem | undefined;
  now: number;
  href(p: string): string;
  adrPath(n: string): string | null;
  onAskClaude?: (docPath: string) => void;
}) {
  const file = useFile(projectId, path);
  if (file.isError)
    return (
      <p className={styles.muted} style={{ padding: 36 }}>
        {(file.error as Error).message}
      </p>
    );
  if (!file.data) return null;
  const content = file.data.content;
  const h1 = /^#\s+(.+)$/m.exec(content.slice(0, 500));
  const title = h1?.[1]?.replace(/^\d{4}\s*[—–-]\s*/, '') ?? item?.title ?? path.split('/').pop();
  const body =
    h1 && content.trimStart().startsWith('#') && !content.trimStart().startsWith('##')
      ? content.replace(/^\s*#\s+.+\n?/, '')
      : content;
  const isMarkdown = file.data.language === 'markdown';

  return (
    <article className={styles.article}>
      <div className={styles.docHead}>
        <div className={styles.docMeta}>
          <h1>{title}</h1>
          <div className={styles.docSub}>
            <span className="mono">{path}</span>
            <span>·</span>
            <span>Last changed {relativeTime(file.data.mtime, now)}</span>
          </div>
        </div>
        <div className={styles.docActions}>
          <button
            type="button"
            className="btn btn-secondary btn-md"
            onClick={() => onAskClaude?.(path)}
            disabled={!onAskClaude}
          >
            Ask Claude about this doc
          </button>
          <button
            type="button"
            className="btn btn-ghost btn-md"
            onClick={() => void openInEditor(projectId, path)}
          >
            Open in editor
            <ArrowUpRight size={12} strokeWidth={2} aria-hidden="true" />
          </button>
        </div>
      </div>
      <div className={styles.rule} />
      {isMarkdown ? (
        <Markdown source={body} docPath={path} docHref={href} adrPath={adrPath} />
      ) : (
        <pre className={styles.pre}>{content}</pre>
      )}
    </article>
  );
}
