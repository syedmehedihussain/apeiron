import { QueryClient, useQuery } from '@tanstack/react-query';
import { useEffect } from 'react';
import { HealthSchema, ProjectListSchema, type Health, type ProjectList } from '@apeiron/shared';
import { api } from './client.ts';
import { socket } from './socket.ts';

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: { retry: false, refetchOnWindowFocus: false, staleTime: 5_000 },
  },
});

export const keys = {
  projects: ['projects'] as const,
  health: ['health'] as const,
  config: ['config'] as const,
};

export function useProjects() {
  return useQuery({
    queryKey: keys.projects,
    queryFn: () => api('GET', '/api/projects', undefined, ProjectListSchema),
  });
}

export function useHealth() {
  return useQuery({
    queryKey: keys.health,
    queryFn: () => api('GET', '/api/health', undefined, HealthSchema),
  });
}

export function recheckHealth(): Promise<Health> {
  return api('POST', '/api/health/recheck', undefined, HealthSchema).then((h) => {
    queryClient.setQueryData(keys.health, h);
    return h;
  });
}

/** Keeps project cards and health live from WebSocket events. Mounted once in the shell. */
export function useLiveProjects(): void {
  useEffect(() => {
    const unsub = socket.subscribe('projects');
    const off = socket.on((event) => {
      if (event.type === 'projects.updated') {
        queryClient.setQueryData<ProjectList>(keys.projects, (old) =>
          old ? { ...old, cards: event.cards } : old,
        );
      } else if (event.type === 'health.updated') {
        queryClient.setQueryData(keys.health, HealthSchema.parse(event));
      }
    });
    const offReconnect = socket.onReconnect(() => void queryClient.invalidateQueries());
    return () => {
      unsub();
      off();
      offReconnect();
    };
  }, []);
}
