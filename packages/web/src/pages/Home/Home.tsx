import { ArrowDown, Plus, Search } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router';
import { tildify } from '../../lib/paths.ts';
import { recheckHealth, useHealth, useProjects } from '../../api/queries.ts';
import { ClaudeMissingBanner } from '../../components/Banner/Banner.tsx';
import { MagnetAvatar } from '../../components/MagnetAvatar/MagnetAvatar.tsx';
import { ProjectCard, ProjectCardSkeleton } from '../../components/ProjectCard/ProjectCard.tsx';
import { ProjectTable } from '../../components/ProjectTable/ProjectTable.tsx';
import { PromptBox } from '../../components/PromptBox/PromptBox.tsx';
import { TopBar } from '../../components/TopBar/TopBar.tsx';
import { useNow } from '../../lib/useNow.ts';
import { useUi } from '../../state/ui.ts';
import styles from './Home.module.css';

export function greeting(hour: number): string {
  if (hour < 5) return 'Working late';
  if (hour < 12) return 'Good morning';
  if (hour < 18) return 'Good afternoon';
  return 'Good evening';
}

type Sort = 'last' | 'name';

export function Home() {
  const projects = useProjects();
  const health = useHealth();
  const navigate = useNavigate();
  const openMagnet = useUi((s) => s.openMagnet);
  const now = useNow(60_000);
  const [query, setQuery] = useState('');
  const [sort, setSort] = useState<Sort>('last');
  const [checking, setChecking] = useState(false);

  const cards = useMemo(() => projects.data?.cards ?? [], [projects.data]);
  const claudeMissing = health.data
    ? !(health.data.claude.found && health.data.claude.loggedIn)
    : false;
  const recent = cards.slice(0, 4);
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const list = q
      ? cards.filter((c) =>
          [c.name, c.summary, ...c.stack].some((s) => s.toLowerCase().includes(q)),
        )
      : cards;
    return sort === 'name' ? [...list].sort((a, b) => a.name.localeCompare(b.name)) : list;
  }, [cards, query, sort]);
  const projectsDir = projects.data ? tildify(projects.data.projectsDir) : '~/Projects';
  const empty = projects.isSuccess && cards.length === 0;

  const checkAgain = async () => {
    setChecking(true);
    try {
      await recheckHealth();
    } finally {
      setChecking(false);
    }
  };

  return (
    <div className={styles.page}>
      <TopBar crumbs={[]} />
      {claudeMissing && (
        <ClaudeMissingBanner onCheckAgain={() => void checkAgain()} checking={checking} />
      )}
      <main className={styles.main}>
        <section aria-label="Start" className={styles.start}>
          <div className={styles.hello}>
            <span className={styles.greeting}>{greeting(new Date(now).getHours())}</span>
            <h1 className={styles.title}>What are we building?</h1>
          </div>
          <PromptBox
            disabled={claudeMissing}
            calibratable={cards.filter((c) => c.state !== 'ready' && !c.draft)}
            onNewProject={(idea) => void navigate(`/new?idea=${encodeURIComponent(idea)}`)}
            onAskMagnet={(text) => openMagnet(text)}
            onCalibrate={(id) => void navigate(`/p/${encodeURIComponent(id)}/calibrate`)}
          />
          {!empty && (
            <div className={styles.cta}>
              <Link
                to="/new"
                className="btn btn-primary btn-lg"
                aria-disabled={claudeMissing}
                title={claudeMissing ? 'Connect Claude Code first' : undefined}
                onClick={(e) => claudeMissing && e.preventDefault()}
              >
                <Plus size={15} strokeWidth={2.2} aria-hidden="true" />
                Start project
              </Link>
              <span className={styles.hint}>
                A short survey first. Claude drafts the plan before any code.
              </span>
            </div>
          )}
        </section>

        {empty ? (
          <section aria-label="Projects" className={styles.empty}>
            <span className={styles.emptyIcon}>
              <MagnetAvatar size={48} display={38} />
            </span>
            <div className={styles.emptyText}>
              <h2>
                Your <span className="mono">{projectsDir}</span> folder is empty
              </h2>
              <p>Every folder you put there shows up here as a project.</p>
            </div>
            <div className={styles.emptyActions}>
              <Link
                to="/new"
                className="btn btn-primary btn-lg"
                aria-disabled={claudeMissing}
                onClick={(e) => claudeMissing && e.preventDefault()}
              >
                <Plus size={15} strokeWidth={2.2} aria-hidden="true" />
                Start project
              </Link>
              <Link to="/settings/general" className="btn btn-secondary btn-lg">
                Choose another folder
              </Link>
            </div>
          </section>
        ) : (
          <>
            <section aria-labelledby="recent" className={styles.section}>
              <div className={styles.sectionHead}>
                <h2 id="recent">Recent</h2>
                <span className={styles.meta}>Last worked on</span>
              </div>
              <div className={styles.grid}>
                {projects.isPending
                  ? Array.from({ length: 4 }, (_, i) => <ProjectCardSkeleton key={i} />)
                  : recent.map((c) => <ProjectCard key={c.id} card={c} now={now} />)}
              </div>
            </section>

            <section aria-labelledby="all" className={styles.section}>
              <div className={styles.sectionHead}>
                <div className={styles.titleRow}>
                  <h2 id="all">All projects</h2>
                  <span className={styles.meta}>
                    {cards.length} folder{cards.length === 1 ? '' : 's'} in{' '}
                    <span className="mono">{projectsDir}</span>
                  </span>
                </div>
                <div className={styles.tools}>
                  <button
                    type="button"
                    className={styles.sort}
                    onClick={() => setSort(sort === 'last' ? 'name' : 'last')}
                    aria-label={`Sorted by ${sort === 'last' ? 'last worked' : 'name'}. Change sort.`}
                  >
                    {sort === 'last' ? 'Last worked' : 'Name'}
                    <ArrowDown size={12} strokeWidth={2} aria-hidden="true" />
                  </button>
                  <label className={styles.search}>
                    <Search size={14} strokeWidth={1.8} aria-hidden="true" />
                    <span className="sr-only">Search projects</span>
                    <input
                      placeholder="Search projects"
                      value={query}
                      onChange={(e) => setQuery(e.target.value)}
                    />
                  </label>
                </div>
              </div>
              <ProjectTable cards={filtered} now={now} loading={projects.isPending} />
              {projects.isSuccess && filtered.length === 0 && (
                <p className={styles.noMatch}>No project matches “{query}”.</p>
              )}
            </section>
          </>
        )}
      </main>
    </div>
  );
}
