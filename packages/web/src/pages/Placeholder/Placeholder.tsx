import { Link } from 'react-router';
import { TopBar } from '../../components/TopBar/TopBar.tsx';

/** Temporary screen for routes whose milestone has not landed yet. */
export function Placeholder({ title, milestone }: { title: string; milestone: string }) {
  return (
    <>
      <TopBar crumbs={[{ label: 'Projects', href: '/' }, { label: title }]} />
      <main style={{ padding: '72px 24px', textAlign: 'center', color: 'var(--t2)' }}>
        <h1 style={{ color: 'var(--t1)', fontSize: 'var(--fs-3xl)', margin: '0 0 8px' }}>
          {title}
        </h1>
        <p>This screen is built in milestone {milestone}.</p>
        <Link to="/">Back to Home</Link>
      </main>
    </>
  );
}
