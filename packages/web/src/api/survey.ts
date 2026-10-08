import { useQuery } from '@tanstack/react-query';
import { useEffect } from 'react';
import { SurveyStateSchema, type SurveyAnswerInput, type SurveyState } from '@apeiron/shared';
import { api } from './client.ts';
import { queryClient } from './queries.ts';
import { socket } from './socket.ts';

const base = (id: string) => `/api/survey/${encodeURIComponent(id)}`;
export const surveyKey = (id: string) => ['survey', id] as const;

export const useSurvey = (id: string | undefined) =>
  useQuery({
    queryKey: surveyKey(id ?? ''),
    queryFn: () => api('GET', base(id!), undefined, SurveyStateSchema),
    enabled: !!id,
  });

const put = (s: SurveyState) => {
  queryClient.setQueryData(surveyKey(s.id), s);
  return s;
};

export const startSurvey = (body: { name: string; idea: string; quick: boolean }) =>
  api('POST', '/api/survey', body, SurveyStateSchema).then(put);
export const nextCard = (id: string, fresh = false) =>
  api('POST', `${base(id)}/next`, { fresh }, SurveyStateSchema).then(put);
export const answerStep = (id: string, body: SurveyAnswerInput) =>
  api('POST', `${base(id)}/answer`, body, SurveyStateSchema).then(put);
export const changeStep = (id: string, step: number) =>
  api('POST', `${base(id)}/change`, { step }, SurveyStateSchema).then(put);
export const createProject = (id: string, createRepo: boolean) =>
  api('POST', `${base(id)}/create`, { createRepo }, SurveyStateSchema).then(put);

export function useLiveSurvey(id: string | undefined): void {
  useEffect(() => {
    if (!id) return;
    const unsub = socket.subscribe(`project:${id}`);
    const off = socket.on((event) => {
      if (event.type === 'survey.updated' && event.projectId === id)
        queryClient.setQueryData(surveyKey(id), event.state);
    });
    return () => {
      unsub();
      off();
    };
  }, [id]);
}
