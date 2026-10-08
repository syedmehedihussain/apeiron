import { X } from 'lucide-react';
import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import { create } from 'zustand';
import { ApiFailure } from '../../api/client.ts';
import { useLiveProject, useProjectDetail } from '../../api/workspace.ts';
import { FileTree } from '../../components/FileTree/FileTree.tsx';
import { FileViewer } from '../../components/FileViewer/FileViewer.tsx';
import { GitPanel } from '../../components/GitHubBox/GitPanel.tsx';
import { AgentsPanel } from '../../components/AgentsPanel/AgentsPanel.tsx';
import { StatusBlock } from '../../components/StatusBlock/StatusBlock.tsx';
import { TopBar } from '../../components/TopBar/TopBar.tsx';
import { tildify } from '../../lib/paths.ts';
import { useNow } from '../../lib/useNow.ts';
import { sendChat, useChat, useChatDraft, usePendingApprovals } from '../../api/chat.ts';
import { Pill } from '../../components/Pill/Pill.tsx';
import { ChatTab, NewChatButton, useSessionMeta } from './ChatTab.tsx';
import { DocsTab } from './DocsTab.tsx';
import { NotesTab } from './NotesTab.tsx';
import styles from './Workspace.module.css';

type Tab = 'chat' | 'docs' | 'notes' | 'file';

/** The last file opened per project, so its tab stays while you visit other tabs. */
const useOpenFiles = create<{
  files: Record<string, string | undefined>;
  set(id: string, path: string | undefined): void;
}>((set) => ({
  files: {},
  set: (id, path) => set((s) => ({ files: { ...s.files, [id]: path } })),
}));

function parseSplat(splat: string): { tab: Tab; path: string | null } {
  if (splat.startsWith('docs')) return { tab: 'docs', path: splat.slice(5) || null };
  if (splat.startsWith('files/')) return { tab: 'file', path: splat.slice(6) || null };
  if (splat === 'notes') return { tab: 'notes', path: null };
  return { tab: 'chat', path: null };
}

export function Workspace({ right }: { right?: (id: string) => ReactNode }) {
  const params = useParams();
  const id = params.id ?? '';
  const { tab, path } = parseSplat(params['*'] ?? '');
  const navigate = useNavigate();
  const now = useNow(60_000);
  const detail = useProjectDetail(id);
  useLiveProject(id);
  const chat = useChat(id);
  const approvals = usePendingApprovals();
  const setDraft = useChatDraft((s) => s.set);
  const pendingHere = (approvals.data ?? []).filter((a) => a.projectId === id);
  const running = !!chat.data?.running;
  const sessionMeta = useSessionMeta(chat.data, now);
  const touched = useMemo(() => new Set(chat.data?.touched ?? []), [chat.data?.touched]);

  const openFile = useOpenFiles((s) => s.files[id]);
  const setOpenFile = useOpenFiles((s) => s.set);
  useEffect(() => {
    if (tab === 'file' && path) setOpenFile(id, path);
  }, [tab, path, id, setOpenFile]);

  // Expanded on Chat, one line elsewhere, unless you toggled it on this tab.
  const [statusOverride, setStatusOverride] = useState<{ tab: Tab; open: boolean } | null>(null);
  const statusExpanded = statusOverride?.tab === tab ? statusOverride.open : tab === 'chat';

  const base = `/p/${encodeURIComponent(id)}`;

  if (detail.isError) {
    const gone = detail.error instanceof ApiFailure && detail.error.status === 404;
    return (
      <div className={styles.page}>
        <TopBar crumbs={[{ label: 'Projects', href: '/' }, { label: id }]} />
        <div className={styles.gone}>
          <h1>{gone ? 'This folder is gone' : 'Could not open this project'}</h1>
          <p>
            {gone
              ? `There is no folder called ${id} in your projects folder any more.`
              : (detail.error as Error).message}
          </p>
          <Link to="/" className="btn btn-secondary btn-md">
            Back to Home
          </Link>
        </div>
      </div>
    );
  }

  const card = detail.data?.card;

  return (
    <div className={styles.page}>
      <TopBar
        crumbs={[{ label: 'Projects', href: '/' }, { label: card?.name ?? id }]}
        phase={card ? card.phase : null}
        claude={running ? 'working' : undefined}
        status={
          pendingHere.length > 0 ? (
            <Pill tone="warning" dot>
              Approval needed
            </Pill>
          ) : running ? (
            <Pill tone="accent" spin>
              Claude is working
            </Pill>
          ) : null
        }
      />
      <div className={styles.grid}>
        <FileTree
          projectId={id}
          projectPath={card ? tildify(card.path) : ''}
          selected={tab === 'file' ? path : null}
          onOpen={(p) => void navigate(`${base}/files/${p}`)}
          touched={touched}
        />

        <section aria-label="Project" className={styles.centre}>
          <div className={styles.statusWrap}>
            <StatusBlock
              status={detail.data?.status ?? null}
              updatedAt={detail.data?.statusMtime ?? null}
              now={now}
              expanded={statusExpanded}
              onToggle={() => setStatusOverride({ tab, open: !statusExpanded })}
              onUpdate={
                running
                  ? undefined
                  : () => {
                      void sendChat(
                        id,
                        'Update _project/STATUS.md from what we did in this session: rewrite "Where we left off" and "Next steps", and keep its format and front matter.',
                        false,
                      );
                      void navigate(base);
                    }
              }
              updateDisabledReason="Claude is working; wait for the turn to finish"
            />
          </div>
          <nav aria-label="Workspace tabs" className={styles.tabs}>
            <TabLink to={base} active={tab === 'chat'}>
              Chat
              {tab !== 'chat' && pendingHere.length > 0 && (
                <span className={styles.needsYou} title="Needs you" />
              )}
            </TabLink>
            <TabLink to={`${base}/docs`} active={tab === 'docs'}>
              Docs
            </TabLink>
            <TabLink to={`${base}/notes`} active={tab === 'notes'}>
              Notes &amp; Tasks
            </TabLink>
            {openFile && (
              <>
                <span className={styles.tabSep} aria-hidden="true" />
                <span className={styles.fileTab} data-active={tab === 'file' || undefined}>
                  <Link
                    to={`${base}/files/${openFile}`}
                    className="mono"
                    aria-current={tab === 'file' ? 'page' : undefined}
                  >
                    {openFile.split('/').pop()}
                  </Link>
                  <button
                    type="button"
                    aria-label={`Close ${openFile.split('/').pop()}`}
                    onClick={() => {
                      setOpenFile(id, undefined);
                      if (tab === 'file') void navigate(base);
                    }}
                  >
                    <X size={12} aria-hidden="true" />
                  </button>
                </span>
              </>
            )}
            <span className={styles.tabSpacer} />
            {tab === 'chat' && (
              <>
                {sessionMeta && <span className={styles.sessionMeta}>{sessionMeta}</span>}
                <NewChatButton projectId={id} state={chat.data} />
              </>
            )}
          </nav>
          <div className={styles.tabBody}>
            {tab === 'chat' && <ChatTab projectId={id} now={now} />}
            {tab === 'docs' && (
              <DocsTab
                projectId={id}
                docPath={path}
                now={now}
                onAskClaude={(doc) => {
                  setDraft(id, `About ${doc}: `);
                  void navigate(base);
                }}
              />
            )}
            {tab === 'notes' && <NotesTab projectId={id} />}
            {tab === 'file' && path && <FileViewer key={path} projectId={id} path={path} />}
          </div>
        </section>

        <aside aria-label="Repository and agents" className={styles.right}>
          <div className={styles.rightTop}>
            <GitPanel key={id} projectId={id} now={now} />
          </div>
          {right ? (
            right(id)
          ) : (
            <AgentsPanel
              projectId={id}
              branch={detail.data?.card.git?.branch ?? null}
              now={now}
              magnet={<div className={styles.soon}>Magnet arrives with milestone M8.</div>}
            />
          )}
        </aside>
      </div>
    </div>
  );
}

function TabLink({ to, active, children }: { to: string; active: boolean; children: ReactNode }) {
  return (
    <Link to={to} className={styles.tab} aria-current={active ? 'page' : undefined}>
      {children}
    </Link>
  );
}
