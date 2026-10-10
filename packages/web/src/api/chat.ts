import { useQuery } from '@tanstack/react-query';
import { useEffect } from 'react';
import { create } from 'zustand';
import {
  ApprovalSchema,
  ChatStateSchema,
  UploadedFileSchema,
  type Approval,
  type ApprovalAnswer,
  type ChatItem,
  type ChatState,
  type DecisionAnswer,
  type UploadedFile,
} from '@apeiron/shared';
import { z } from 'zod';
import { api } from './client.ts';
import { queryClient } from './queries.ts';
import { socket } from './socket.ts';

const base = (id: string) => `/api/projects/${encodeURIComponent(id)}`;
export const chatKey = (id: string) => ['chat', id] as const;
export const approvalsKey = ['approvals', 'pending'] as const;

export const useChat = (id: string) =>
  useQuery({
    queryKey: chatKey(id),
    queryFn: () => api('GET', `${base(id)}/chat`, undefined, ChatStateSchema),
  });

export const sendChat = (
  id: string,
  text: string,
  planMode: boolean,
  model?: string,
  attachments: string[] = [],
  effort?: string,
) =>
  api<{ turnId: string; conversationId: string }>('POST', `${base(id)}/chat`, {
    text,
    planMode,
    ...(model ? { model } : {}),
    ...(attachments.length ? { attachments } : {}),
    ...(effort ? { effort } : {}),
  });

/** Sends one file as the raw request body; the daemon stores it under apeiron/uploads/. */
export async function uploadAttachment(id: string, file: File): Promise<UploadedFile> {
  const res = await fetch(`${base(id)}/uploads?name=${encodeURIComponent(file.name)}`, {
    method: 'POST',
    credentials: 'same-origin',
    headers: { 'content-type': 'application/octet-stream' },
    body: file,
  });
  const body: unknown = await res.json().catch(() => null);
  if (!res.ok) {
    const msg =
      res.status === 413
        ? 'The file is larger than 10 MB.'
        : ((body as { error?: { message?: string } } | null)?.error?.message ?? 'Upload failed.');
    throw new Error(msg);
  }
  return UploadedFileSchema.parse(body);
}

/** Deletes an upload that was never sent. */
export const discardAttachment = (id: string, file: string) =>
  api('DELETE', `${base(id)}/uploads/${encodeURIComponent(file)}`);

/** Where the browser loads an attachment from (images show inline). */
export const attachmentUrl = (id: string, file: string) =>
  `${base(id)}/uploads/${encodeURIComponent(file)}`;

/** "2026-10-09-a1b2c3-screen-shot.png" → "screen-shot.png". */
export const attachmentLabel = (file: string) =>
  file.replace(/^\d{4}-\d{2}-\d{2}-[0-9a-f]{6}-/, '');
export const isImageFile = (file: string) => /\.(png|jpe?g|gif|webp)$/i.test(file);
export const stopChat = (id: string) => api('POST', `${base(id)}/chat/stop`);
export const newChat = async (id: string) => {
  await api('POST', `${base(id)}/chat/new`);
  await queryClient.invalidateQueries({ queryKey: chatKey(id) });
};
export const answerDecision = (cardId: string, answer: DecisionAnswer) =>
  api('POST', `/api/decisions/${encodeURIComponent(cardId)}`, answer);
export const answerApproval = (approvalId: string, answer: ApprovalAnswer) =>
  api('POST', `/api/approvals/${encodeURIComponent(approvalId)}`, answer, ApprovalSchema);

export const usePendingApprovals = () =>
  useQuery({
    queryKey: approvalsKey,
    queryFn: () =>
      api(
        'GET',
        '/api/approvals?status=pending',
        undefined,
        z.object({ approvals: z.array(ApprovalSchema) }),
      ).then((r) => r.approvals),
  });

/** Text to put in the composer (from "Ask Claude about this doc", "Update status"). */
export const useChatDraft = create<{
  drafts: Record<string, string>;
  set(id: string, text: string): void;
}>((set) => ({
  drafts: {},
  set: (id, text) => set((s) => ({ drafts: { ...s.drafts, [id]: text } })),
}));

const STREAM_FLUSH_MS = 100;

function upsert(items: ChatItem[], item: ChatItem): ChatItem[] {
  const i = items.findIndex((x) => x.id === item.id);
  if (i < 0) return [...items, item];
  const next = items.slice();
  // Keep streamed text if the stored snapshot is behind.
  const old = items[i]!;
  next[i] =
    old.kind === 'text' && item.kind === 'text' && old.text.length > item.text.length
      ? { ...item, text: old.text }
      : item;
  return next;
}

/**
 * Keeps the chat state live from WebSocket events. Streamed text is applied at most 10 times a
 * second: re-rendering Markdown on every frame kept a CPU core busy for nothing.
 */
export function useLiveChat(id: string): void {
  useEffect(() => {
    const unsub = socket.subscribe(`project:${id}`);
    let pending: { itemId: string; text: string }[] = [];
    let frame: number | null = null;
    const flush = () => {
      frame = null;
      const deltas = pending;
      pending = [];
      queryClient.setQueryData<ChatState>(chatKey(id), (old) => {
        if (!old) return old;
        let items = old.items;
        for (const d of deltas) {
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
      if (event.type === 'chat.delta' && event.projectId === id) {
        pending.push({ itemId: event.itemId, text: event.text });
        frame ??= window.setTimeout(flush, STREAM_FLUSH_MS);
      } else if (event.type === 'chat.item' && event.projectId === id) {
        if (frame !== null) {
          window.clearTimeout(frame);
          flush();
        }
        queryClient.setQueryData<ChatState>(chatKey(id), (old) =>
          old && old.conversationId === event.conversationId
            ? { ...old, items: upsert(old.items, event.item) }
            : old,
        );
        const cur = queryClient.getQueryData<ChatState>(chatKey(id));
        if (cur && cur.conversationId !== event.conversationId)
          void queryClient.invalidateQueries({ queryKey: chatKey(id) });
      } else if (event.type === 'chat.state' && event.projectId === id) {
        const cur = queryClient.getQueryData<ChatState>(chatKey(id));
        if (!cur || cur.conversationId !== event.conversationId) {
          void queryClient.invalidateQueries({ queryKey: chatKey(id) });
        } else {
          queryClient.setQueryData<ChatState>(chatKey(id), {
            ...cur,
            running: event.running,
            turnId: event.turnId,
            touched: event.touched,
          });
        }
      }
    });
    return () => {
      unsub();
      off();
      if (frame !== null) window.clearTimeout(frame);
    };
  }, [id]);
}

/** Pending approvals from every project, for toasts and the top bar. */
export function useLiveApprovals(): void {
  useEffect(() => {
    const unsub = socket.subscribe('approvals');
    const off = socket.on((event) => {
      if (event.type === 'approval.requested') {
        queryClient.setQueryData<Approval[]>(approvalsKey, (old) => [
          ...(old ?? []).filter((a) => a.id !== event.approval.id),
          event.approval,
        ]);
      } else if (event.type === 'approval.resolved') {
        queryClient.setQueryData<Approval[]>(approvalsKey, (old) =>
          (old ?? []).filter((a) => a.id !== event.approval.id),
        );
      }
    });
    return () => {
      unsub();
      off();
    };
  }, []);
}
