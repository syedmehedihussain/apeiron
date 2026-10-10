import { useQuery } from '@tanstack/react-query';
import { useEffect } from 'react';
import {
  ReportListSchema,
  ReportSchema,
  ScanAgentListSchema,
  ScanRunSchema,
} from '@apeiron/shared';
import { api } from './client.ts';
import { queryClient } from './queries.ts';
import { socket } from './socket.ts';

const base = (projectId: string) => `/api/projects/${encodeURIComponent(projectId)}`;
export const scansKey = (projectId: string) => ['project', projectId, 'scans'] as const;
const reportsKey = (projectId: string, agentId: string) =>
  ['project', projectId, 'reports', agentId] as const;

export const useScanAgents = (projectId: string) =>
  useQuery({
    queryKey: scansKey(projectId),
    queryFn: () => api('GET', `${base(projectId)}/scans`, undefined, ScanAgentListSchema),
  });

export const useReports = (projectId: string, agentId: string) =>
  useQuery({
    queryKey: reportsKey(projectId, agentId),
    queryFn: () =>
      api(
        'GET',
        `${base(projectId)}/reports/${encodeURIComponent(agentId)}`,
        undefined,
        ReportListSchema,
      ),
  });

export const useReport = (projectId: string, agentId: string, reportId: string | null) =>
  useQuery({
    queryKey: [...reportsKey(projectId, agentId), reportId],
    queryFn: () =>
      api(
        'GET',
        `${base(projectId)}/reports/${encodeURIComponent(agentId)}/${encodeURIComponent(reportId!)}`,
        undefined,
        ReportSchema,
      ),
    enabled: !!reportId,
    // A report never changes once written.
    staleTime: Infinity,
  });

const refresh = (projectId: string) =>
  queryClient.invalidateQueries({ queryKey: scansKey(projectId) });

export const runScan = (projectId: string, agentId: string) =>
  api(
    'POST',
    `${base(projectId)}/scans/${encodeURIComponent(agentId)}/run`,
    undefined,
    ScanRunSchema,
  ).then((r) => {
    void refresh(projectId);
    return r;
  });

export const stopScan = (projectId: string, agentId: string) =>
  api('POST', `${base(projectId)}/scans/${encodeURIComponent(agentId)}/stop`).then(() =>
    refresh(projectId),
  );

/** Refetches the scan list (and that agent's history) on `scan.updated`. */
export function useLiveScans(projectId: string): void {
  useEffect(() => {
    const unsub = socket.subscribe(`project:${projectId}`);
    const off = socket.on((event) => {
      if (event.type !== 'scan.updated' || event.projectId !== projectId) return;
      void refresh(projectId);
      void queryClient.invalidateQueries({ queryKey: reportsKey(projectId, event.agentId) });
    });
    return () => {
      unsub();
      off();
    };
  }, [projectId]);
}
