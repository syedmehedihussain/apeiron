import { useQuery } from '@tanstack/react-query';
import { useEffect } from 'react';
import { CalibrationStateSchema } from '@apeiron/shared';
import { z } from 'zod';
import { api } from './client.ts';
import { queryClient } from './queries.ts';
import { socket } from './socket.ts';

const base = (id: string) => `/api/projects/${encodeURIComponent(id)}/calibrate`;
export const calKey = (id: string) => ['calibrate', id] as const;

export const useCalibration = (id: string) =>
  useQuery({
    queryKey: calKey(id),
    queryFn: () => api('GET', base(id), undefined, CalibrationStateSchema),
  });

const setState = (id: string) => (s: z.infer<typeof CalibrationStateSchema>) => {
  queryClient.setQueryData(calKey(id), s);
  return s;
};

export const startCalibration = (id: string, model?: string) =>
  api('POST', base(id), model ? { model } : {}, CalibrationStateSchema).then(setState(id));
export const cancelCalibration = (id: string) =>
  api('POST', `${base(id)}/cancel`, undefined, CalibrationStateSchema).then(setState(id));
export const writeCalibration = (id: string, paths: string[]) =>
  api(
    'POST',
    `${base(id)}/write`,
    { paths },
    z.object({
      written: z.array(z.string()),
      skipped: z.array(z.object({ path: z.string(), reason: z.string() })),
    }),
  );

export function useLiveCalibration(id: string): void {
  useEffect(() => {
    const unsub = socket.subscribe(`project:${id}`);
    const off = socket.on((event) => {
      if (event.type === 'calibrate.updated' && event.projectId === id)
        queryClient.setQueryData(calKey(id), event.state);
    });
    return () => {
      unsub();
      off();
    };
  }, [id]);
}
