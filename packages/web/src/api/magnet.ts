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
    let pending: { itemId: string; text: string }[] = [];
    let timer: number | null = null;
    const flush = () => {
      timer = null;
      const batch = pending;
      pending = [];
      queryClient.setQueryData<MagnetState>(magnetKey, (old) => {
        if (!old) return old;
        let items = old.items;
        for (const d of batch) {
          const i = items.findIndex((x) => x.id === d.itemId);
          const it = items[i];
          if (it?.kind !== 'text') continue;
          if (items === old.items) items = items.slice();
          items[i] = { ...it, text: it.text + d.text };
        }
        return { ...old, items };
      });
    };
    const off = socket.on((event) => {
      if (event.type === 'magnet.item') {
        if (timer !== null) {
          window.clearTimeout(timer);
          flush();
        }
        queryClient.setQueryData<MagnetState>(magnetKey, (old) =>
          old
            ? { ...old, conversationId: event.conversationId, items: upsert(old.items, event.item) }
            : old,
        );
      } else if (event.type === 'magnet.delta') {
        // Same 100 ms batching as the chat: one Markdown render per batch, not per chunk.
        pending.push(event);
        timer ??= window.setTimeout(flush, 100);
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
      if (timer !== null) window.clearTimeout(timer);
    };
  }, []);
}
