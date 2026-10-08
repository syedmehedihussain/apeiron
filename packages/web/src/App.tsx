import { QueryClientProvider } from '@tanstack/react-query';
import { createBrowserRouter, RouterProvider } from 'react-router';
import { queryClient } from './api/queries.ts';
import { Home } from './pages/Home/Home.tsx';
import { Placeholder } from './pages/Placeholder/Placeholder.tsx';
import { Shell } from './pages/Shell/Shell.tsx';
import { Workspace } from './pages/Workspace/Workspace.tsx';

const router = createBrowserRouter([
  {
    element: <Shell />,
    children: [
      { path: '/', element: <Home /> },
      { path: '/new/:id?', element: <Placeholder title="New project" milestone="M5" /> },
      { path: '/p/:id/calibrate', element: <Placeholder title="Calibration" milestone="M4" /> },
      { path: '/p/:id/*', element: <Workspace /> },
      { path: '/settings/:section?', element: <Placeholder title="Settings" milestone="M8" /> },
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
