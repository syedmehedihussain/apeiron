import { useQuery } from '@tanstack/react-query';
import { useEffect } from 'react';
import {
  AgentDiffSchema,
  AgentListSchema,
  AgentSchema,
  type AgentList,
  type AgentStart,
} from '@apeiron/shared';
import { api } from './client.ts';
import { queryClient } from './queries.ts';
import { socket } from './socket.ts';

export const agentsKey = (projectId: string) => ['project', projectId, 'agents'] as const;

export const useAgents = (projectId: string) =>
  useQuery({
    queryKey: agentsKey(projectId),
    queryFn: () =>
      api(
        'GET',
        `/api/projects/${encodeURIComponent(projectId)}/agents`,
        undefined,
        AgentListSchema,
      ),
  });

export const useAgentDiff = (agentId: string | null) =>
  useQuery({
    queryKey: ['agent', agentId, 'diff'],
    queryFn: () =>
      api('GET', `/api/agents/${encodeURIComponent(agentId!)}/diff`, undefined, AgentDiffSchema),
    enabled: !!agentId,
  });

const refresh = (projectId: string) =>
  queryClient.invalidateQueries({ queryKey: agentsKey(projectId) });

export const startAgent = (projectId: string, body: AgentStart) =>
  api('POST', `/api/projects/${encodeURIComponent(projectId)}/agents`, body, AgentSchema).then(
    (a) => {
      void refresh(projectId);
      return a;
    },
  );

const action = (verb: 'accept' | 'discard' | 'retry' | 'stop') => (projectId: string, id: string) =>
  api('POST', `/api/agents/${encodeURIComponent(id)}/${verb}`, undefined, AgentSchema).then((a) => {
    void refresh(projectId);
    return a;
  });
export const acceptAgent = action('accept');
export const discardAgent = action('discard');
export const retryAgent = action('retry');
export const stopAgent = action('stop');

/** Keeps the agent list current from `agent.updated` events. */
export function useLiveAgents(projectId: string): void {
  useEffect(() => {
    const unsub = socket.subscribe(`project:${projectId}`);
    const off = socket.on((event) => {
      if (event.type !== 'agent.updated' || event.projectId !== projectId) return;
      queryClient.setQueryData<AgentList>(agentsKey(projectId), (old) => {
        if (!old) return old;
        const gone = event.agent.status === 'accepted' || event.agent.status === 'discarded';
        const rest = old.agents.filter((a) => a.id !== event.agent.id);
        if (gone) return { ...old, agents: rest };
        const i = old.agents.findIndex((a) => a.id === event.agent.id);
        const agents =
          i < 0
            ? [event.agent, ...rest]
            : old.agents.map((a) => (a.id === event.agent.id ? event.agent : a));
        return { ...old, agents };
      });
    });
    return () => {
      unsub();
      off();
    };
  }, [projectId]);
}
