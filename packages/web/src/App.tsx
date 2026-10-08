import { QueryClientProvider } from '@tanstack/react-query';
import { createBrowserRouter, RouterProvider } from 'react-router';
import { queryClient } from './api/queries.ts';
import { Calibrate } from './pages/Calibrate/Calibrate.tsx';
import { Home } from './pages/Home/Home.tsx';
import { Placeholder } from './pages/Placeholder/Placeholder.tsx';
import { Shell } from './pages/Shell/Shell.tsx';
import { Survey } from './pages/Survey/Survey.tsx';
import { Settings } from './pages/Settings/Settings.tsx';
import { Workspace } from './pages/Workspace/Workspace.tsx';

const router = createBrowserRouter([
  {
    element: <Shell />,
    children: [
      { path: '/', element: <Home /> },
      { path: '/new/:id?', element: <Survey /> },
      { path: '/p/:id/calibrate', element: <Calibrate /> },
      { path: '/p/:id/*', element: <Workspace /> },
      { path: '/settings/:section?', element: <Settings /> },
      { path: '*', element: <Placeholder title="Not found" milestone="—" /> },
    ],
  },
]);

export function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>
  );
}
