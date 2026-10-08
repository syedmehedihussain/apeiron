import { ArrowUpRight, Lock } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { Fragment, useState } from 'react';
import type { ThemedToken } from 'shiki';
import type { DiffLine } from '@apeiron/shared';
import { openInEditor, useDiff, useFile } from '../../api/workspace.ts';
import { highlightLines } from '../../lib/highlight.ts';
import { Switch } from '../Switch/Switch.tsx';
import styles from './FileViewer.module.css';

const LANG_LABEL: Record<string, string> = {
  typescript: 'TypeScript',
  tsx: 'TypeScript (TSX)',
  javascript: 'JavaScript',
  jsx: 'JavaScript (JSX)',
  json: 'JSON',
  markdown: 'Markdown',
  python: 'Python',
  rust: 'Rust',
  go: 'Go',
  css: 'CSS',
  html: 'HTML',
  shellscript: 'Shell',
  yaml: 'YAML',
  toml: 'TOML',
  sql: 'SQL',
  c: 'C',
  cpp: 'C++',
  text: 'Plain text',
};

export function FileViewer({ projectId, path }: { projectId: string; path: string }) {
  const file = useFile(projectId, path);
  const changed = !!file.data?.git && !file.data.hidden && !file.data.binary;
  const [showChanges, setShowChanges] = useState(true);
  const diff = useDiff(projectId, path, changed);
  const diffOn = changed && showChanges && !!diff.data && diff.data.lines.length > 0;

  const code = file.data?.content ?? '';
  const highlightSource = diffOn
    ? diff.data!.lines.map((l) => l.text).join('\n')
    : code.replace(/\n$/, '');
  const lang = file.data?.language ?? 'text';
  const highlighted = useQuery({
    queryKey: ['highlight', projectId, path, file.data?.mtime, diffOn, lang],
    queryFn: () => highlightLines(highlightSource, lang),
    enabled: !!file.data,
    staleTime: Infinity,
  });
  const tokens: ThemedToken[][] | null = highlighted.data ?? null;

  if (file.isError) return <p className={styles.message}>{(file.error as Error).message}</p>;
  if (!file.data)
    return (
      <div className={styles.loading}>
        <span className="shimmer" style={{ height: 300 }} />
      </div>
    );

  const parts = file.data.path.split('/');
  const lines: DiffLine[] = diffOn
    ? diff.data!.lines
    : highlightSource.split('\n').map((text, i) => ({ kind: ' ', a: i + 1, b: i + 1, text }));

  return (
    <div className={styles.viewer}>
      <div className={styles.bar}>
        <div className={styles.crumbs} aria-label="File path">
          {parts.map((p, i) => (
            <Fragment key={i}>
              {i > 0 && <span>/</span>}
              <span className={i === parts.length - 1 ? styles.leaf : undefined}>{p}</span>
            </Fragment>
          ))}
        </div>
        <span className={styles.readonly}>
          <Lock size={11} strokeWidth={2} aria-hidden="true" />
          Read-only
        </span>
        <span className={styles.meta}>
          {file.data.lines} lines · {LANG_LABEL[file.data.language] ?? file.data.language}
          {file.data.truncated && ' · first 1 MB'}
        </span>
        <span className={styles.spacer} />
        {changed && (
          <>
            <Switch checked={showChanges} onChange={setShowChanges} label="Show changes" />
            {diff.data && (
              <span className={styles.counts}>
                <span className={styles.add}>+{diff.data.added}</span>{' '}
                <span className={styles.del}>−{diff.data.removed}</span>
              </span>
            )}
          </>
        )}
        <button
          type="button"
          className="btn btn-secondary"
          onClick={() => void openInEditor(projectId, path)}
        >
          Open in editor
          <ArrowUpRight size={12} strokeWidth={2} aria-hidden="true" />
        </button>
      </div>
      {file.data.hidden ? (
        <p className={styles.message}>
          Hidden for safety. Apeiron never reads secret files like {parts[parts.length - 1]}.
        </p>
      ) : file.data.binary ? (
        <p className={styles.message}>This is a binary file.</p>
      ) : (
        <div
          className={styles.code}
          role="region"
          aria-label={`Contents of ${file.data.path}`}
          tabIndex={0}
        >
          <div className={styles.lines} data-diff={diffOn || undefined}>
            {lines.map((l, i) => (
              <div key={i} className={styles.line} data-kind={l.kind}>
                {diffOn ? (
                  <>
                    <span className={styles.num}>{l.a ?? ''}</span>
                    <span className={styles.num}>{l.b ?? ''}</span>
                    <span className={styles.sign}>
                      {l.kind === ' ' ? '' : l.kind === '-' ? '−' : '+'}
                    </span>
                  </>
                ) : (
                  <span className={styles.num}>{l.b}</span>
                )}
                <span className={styles.text}>
                  {tokens?.[i]
                    ? tokens[i].map((t, j) => (
                        <span key={j} style={{ color: t.color }}>
                          {t.content}
                        </span>
                      ))
                    : l.text || ' '}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
