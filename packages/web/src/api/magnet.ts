import { useQuery } from '@tanstack/react-query';
import { useEffect } from 'react';
import {
  ConfigSchema,
  MagnetActionSchema,
  MagnetInfoSchema,
  MagnetStateSchema,
  type ChatItem,
  type ConfigPatch,
  type MagnetFileName,
  type MagnetState,
} from '@apeiron/shared';
import { api } from './client.ts';
import { keys, queryClient } from './queries.ts';
import { socket } from './socket.ts';

export const magnetKey = ['magnet', 'chat'] as const;
export const magnetInfoKey = ['magnet', 'info'] as const;

export const useMagnet = () =>
  useQuery({
    queryKey: magnetKey,
    queryFn: () => api('GET', '/api/magnet/chat', undefined, MagnetStateSchema),
  });

export const useMagnetInfo = () =>
  useQuery({
    queryKey: magnetInfoKey,
    queryFn: () => api('GET', '/api/magnet', undefined, MagnetInfoSchema),
  });

export const sendMagnet = (text: string, projectId?: string) =>
  api('POST', '/api/magnet/chat', { text, ...(projectId ? { projectId } : {}) });
export const stopMagnet = () => api('POST', '/api/magnet/chat/stop');
export const newMagnet = async () => {
  await api('POST', '/api/magnet/chat/new');
  await queryClient.invalidateQueries({ queryKey: magnetKey });
};
export const approveAction = (id: string) =>
  api(
    'POST',
    `/api/magnet/actions/${encodeURIComponent(id)}/approve`,
    undefined,
    MagnetActionSchema,
  );
export const cancelAction = (id: string) =>
  api(
    'POST',
    `/api/magnet/actions/${encodeURIComponent(id)}/cancel`,
    undefined,
    MagnetActionSchema,
  );

export const saveMagnetFile = (name: MagnetFileName, content: string) =>
  api('PUT', `/api/magnet/files/${name}`, { content }, MagnetInfoSchema).then((info) => {
    queryClient.setQueryData(magnetInfoKey, info);
    return info;
  });

export const patchConfig = (patch: ConfigPatch) =>
  api('PATCH', '/api/config', patch, ConfigSchema.passthrough()).then((c) => {
    void queryClient.invalidateQueries({ queryKey: keys.config });
    void queryClient.invalidateQueries({ queryKey: magnetInfoKey });
    void queryClient.invalidateQueries({ queryKey: magnetKey });
    return c;
  });

const upsert = (items: ChatItem[], item: ChatItem) => {
  const i = items.findIndex((x) => x.id === item.id);
  return i < 0 ? [...items, item] : items.map((x) => (x.id === item.id ? item : x));
};

/** Keeps Magnet's conversation live (topic "magnet"). Mounted once in the shell. */
export function useLiveMagnet(): void {
  useEffect(() => {
    const unsub = socket.subscribe('magnet');
    const off = socket.on((event) => {
      if (event.type === 'magnet.item') {
        queryClient.setQueryData<MagnetState>(magnetKey, (old) =>
          old
            ? { ...old, conversationId: event.conversationId, items: upsert(old.items, event.item) }
            : old,
        );
      } else if (event.type === 'magnet.delta') {
        queryClient.setQueryData<MagnetState>(magnetKey, (old) =>
          old
            ? {
                ...old,
                items: old.items.map((x) =>
                  x.id === event.itemId && x.kind === 'text'
                    ? { ...x, text: x.text + event.text }
                    : x,
                ),
              }
            : old,
        );
      } else if (event.type === 'magnet.state') {
        queryClient.setQueryData<MagnetState>(magnetKey, (old) =>
          old
            ? {
                ...old,
                running: event.running,
                conversationId: event.conversationId,
                items: event.conversationId ? old.items : [],
              }
            : old,
        );
      }
    });
    return () => {
      unsub();
      off();
    };
  }, []);
}
