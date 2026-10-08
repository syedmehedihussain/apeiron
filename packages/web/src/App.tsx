import { TopBar } from './components/TopBar/TopBar.tsx';

export function App() {
  return (
    <>
      <TopBar crumbs={[]} claude="checking" />
      <main />
    </>
  );
}
