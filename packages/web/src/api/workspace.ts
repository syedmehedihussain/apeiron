import { useQuery } from '@tanstack/react-query';
import { useEffect } from 'react';
import {
  ChangesSchema,
  DocsListSchema,
  FileDiffSchema,
  FileViewSchema,
  GitInfoSchema,
  GitResultSchema,
  NotesSchema,
  ProjectDetailSchema,
  PullRequestListSchema,
  TasksFileSchema,
  TreeSchema,
} from '@apeiron/shared';
import { z } from 'zod';
import { api } from './client.ts';
import { queryClient } from './queries.ts';
import { socket } from './socket.ts';

const base = (id: string) => `/api/projects/${encodeURIComponent(id)}`;
const q = (path: string) => `?path=${encodeURIComponent(path)}`;

export const wk = {
  all: (id: string) => ['project', id] as const,
  detail: (id: string) => ['project', id, 'detail'] as const,
  tree: (id: string, path: string) => ['project', id, 'tree', path] as const,
  file: (id: string, path: string) => ['project', id, 'file', path] as const,
  diff: (id: string, path: string) => ['project', id, 'diff', path] as const,
  docs: (id: string) => ['project', id, 'docs'] as const,
  git: (id: string) => ['project', id, 'git'] as const,
  changes: (id: string) => ['project', id, 'changes'] as const,
  notes: (id: string) => ['project', id, 'notes'] as const,
  tasks: (id: string) => ['project', id, 'tasks'] as const,
};

export const useProjectDetail = (id: string) =>
  useQuery({
    queryKey: wk.detail(id),
    queryFn: () => api('GET', base(id), undefined, ProjectDetailSchema),
  });

export const useTree = (id: string, path: string, enabled = true) =>
  useQuery({
    queryKey: wk.tree(id, path),
    queryFn: () => api('GET', `${base(id)}/tree${q(path)}`, undefined, TreeSchema),
    enabled,
  });

export const useFile = (id: string, path: string) =>
  useQuery({
    queryKey: wk.file(id, path),
    queryFn: () => api('GET', `${base(id)}/file${q(path)}`, undefined, FileViewSchema),
  });

export const useDiff = (id: string, path: string, enabled: boolean) =>
  useQuery({
    queryKey: wk.diff(id, path),
    queryFn: () => api('GET', `${base(id)}/diff${q(path)}`, undefined, FileDiffSchema),
    enabled,
  });

export const useDocs = (id: string) =>
  useQuery({
    queryKey: wk.docs(id),
    queryFn: () => api('GET', `${base(id)}/docs`, undefined, DocsListSchema),
  });

export const useGitInfo = (id: string) =>
  useQuery({
    queryKey: wk.git(id),
    queryFn: () => api('GET', `${base(id)}/git`, undefined, GitInfoSchema),
  });

export const useChanges = (id: string) =>
  useQuery({
    queryKey: wk.changes(id),
    queryFn: () => api('GET', `${base(id)}/changes`, undefined, ChangesSchema),
  });

export const useNotes = (id: string) =>
  useQuery({
    queryKey: wk.notes(id),
    queryFn: () => api('GET', `${base(id)}/notes`, undefined, NotesSchema),
  });

export const saveNotes = (id: string, content: string, baseMtime: number | null) =>
  api('PUT', `${base(id)}/notes`, { content, baseMtime }, NotesSchema);

export const useTasks = (id: string) =>
  useQuery({
    queryKey: wk.tasks(id),
    queryFn: () => api('GET', `${base(id)}/tasks`, undefined, TasksFileSchema),
  });

export const setTaskStatus = (id: string, taskId: string, status: string) =>
  api('PATCH', `${base(id)}/tasks/${encodeURIComponent(taskId)}`, { status }, TasksFileSchema);

export const openInEditor = (id: string, path: string) =>
  api('POST', `${base(id)}/open-in-editor`, { path });

/** Re-fetches this project's data when its files change on disk. */
export function useLiveProject(id: string): void {
  useEffect(() => {
    const unsub = socket.subscribe(`project:${id}`);
    let timer: number | null = null;
    const off = socket.on((event) => {
      if (event.type !== 'project.changed' || event.projectId !== id) return;
      if (timer) window.clearTimeout(timer);
      timer = window.setTimeout(() => {
        // Notes are edited in place; never clobber the editor from a disk event.
        void queryClient.invalidateQueries({
          queryKey: wk.all(id),
          predicate: (query) => query.queryKey[2] !== 'notes',
        });
      }, 150);
    });
    return () => {
      unsub();
      off();
      if (timer) window.clearTimeout(timer);
    };
  }, [id]);
}

export const pullProject = (id: string) =>
  api('POST', `${base(id)}/git/pull`, undefined, GitResultSchema);
export const pushProject = (id: string) =>
  api('POST', `${base(id)}/git/push`, undefined, z.object({ approvalId: z.string() }));
export const usePullRequests = (id: string, enabled: boolean) =>
  useQuery({
    queryKey: [...wk.git(id), 'prs'],
    queryFn: () => api('GET', `${base(id)}/git/prs`, undefined, PullRequestListSchema),
    enabled,
    staleTime: 60_000,
  });
