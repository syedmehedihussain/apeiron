import { ArrowUp, ChevronDown, FileText, Map as MapIcon, Paperclip, Square, X } from 'lucide-react';
import {
  useEffect,
  useId,
  useRef,
  useState,
  type ClipboardEvent,
  type DragEvent,
  type KeyboardEvent,
} from 'react';
import { MAX_ATTACHMENTS, MAX_UPLOAD_BYTES, MODELS, type UploadedFile } from '@apeiron/shared';
import styles from './Composer.module.css';

interface ComposerProps {
  running: boolean;
  /** Claude waits for an approval or decision above. */
  paused: boolean;
  disabled?: string | null;
  model: string;
  draft?: string;
  onDraftUsed?: () => void;
  onSend(text: string, planMode: boolean, model: string, attachments: string[]): Promise<boolean>;
  /** Stores one file and returns its id; without it there is no paperclip. */
  onUpload?: (file: File) => Promise<UploadedFile>;
  /** Deletes an uploaded file whose chip was removed before sending. */
  onDiscard?: (id: string) => void;
  onStop(): void;
  onModel(model: string): void;
}

export function Composer({
  running,
  paused,
  disabled,
  model,
  draft,
  onDraftUsed,
  onSend,
  onStop,
  onModel,
  onUpload,
  onDiscard,
}: ComposerProps) {
  const [text, setText] = useState('');
  const [plan, setPlan] = useState(false);
  const [menu, setMenu] = useState(false);
  const [sending, setSending] = useState(false);
  const id = useId();
  const area = useRef<HTMLTextAreaElement>(null);

  // A new draft (from "Ask Claude about this doc") replaces the text once.
  const [seenDraft, setSeenDraft] = useState<string | undefined>(undefined);
  if (draft && draft !== seenDraft) {
    setSeenDraft(draft);
    setText(draft);
  }
  useEffect(() => {
    if (draft) {
      onDraftUsed?.();
      area.current?.focus();
    }
  }, [draft, onDraftUsed]);

  const [files, setFiles] = useState<Pending[]>([]);
  const [fileError, setFileError] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
  const picker = useRef<HTMLInputElement>(null);
  const seq = useRef(0);
  const uploading = files.some((f) => f.status === 'uploading');
  const ready = files.filter((f) => f.status === 'done');

  // Object URLs for image previews are freed when a chip goes away.
  const urls = useRef(new Set<string>());
  useEffect(() => {
    const all = urls.current;
    return () => all.forEach((u) => URL.revokeObjectURL(u));
  }, []);

  const addFiles = (list: FileList | File[]) => {
    if (!onUpload || disabled) return;
    setFileError(null);
    const incoming = [...list];
    const room = MAX_ATTACHMENTS - files.length;
    if (incoming.length > room) setFileError(`Up to ${MAX_ATTACHMENTS} files per message.`);
    for (const file of incoming.slice(0, Math.max(0, room))) {
      const key = `${file.name}-${(seq.current += 1)}`;
      if (file.size > MAX_UPLOAD_BYTES) {
        setFiles((f) => [...f, { key, name: file.name, status: 'error', error: 'Over 10 MB' }]);
        continue;
      }
      const preview = file.type.startsWith('image/') ? URL.createObjectURL(file) : undefined;
      if (preview) urls.current.add(preview);
      setFiles((f) => [...f, { key, name: file.name, status: 'uploading', preview }]);
      onUpload(file).then(
        (up) => {
          // Removed while it was still uploading: delete it now that it exists.
          if (removed.current.delete(key)) {
            onDiscard?.(up.id);
            return;
          }
          setFiles((f) => f.map((x) => (x.key === key ? { ...x, status: 'done', id: up.id } : x)));
        },
        (e: unknown) =>
          setFiles((f) =>
            f.map((x) =>
              x.key === key
                ? { ...x, status: 'error', error: e instanceof Error ? e.message : 'Upload failed' }
                : x,
            ),
          ),
      );
    }
  };
  const removed = useRef(new Set<string>());
  const remove = (key: string) => {
    const f = files.find((x) => x.key === key);
    if (f?.status === 'uploading') removed.current.add(key);
    if (f?.status === 'done' && f.id) onDiscard?.(f.id);
    setFiles((list) => list.filter((x) => x.key !== key));
  };

  const hasContent = text.trim().length > 0 || ready.length > 0;
  const canSend = !disabled && !running && !sending && !uploading && hasContent;
  const send = async () => {
    if (!canSend) return;
    setSending(true);
    const body =
      text.trim() ||
      (ready.length === 1
        ? 'Have a look at the attached file.'
        : 'Have a look at the attached files.');
    const ok = await onSend(
      body,
      plan,
      model,
      ready.map((f) => f.id!),
    );
    setSending(false);
    if (ok) {
      setText('');
      setFiles([]);
      setFileError(null);
    }
  };
  const onPaste = (e: ClipboardEvent<HTMLTextAreaElement>) => {
    if (e.clipboardData.files.length) {
      e.preventDefault();
      addFiles(e.clipboardData.files);
    }
  };
  const onDrop = (e: DragEvent<HTMLDivElement>) => {
    if (!e.dataTransfer.files.length) return;
    e.preventDefault();
    setDragging(false);
    addFiles(e.dataTransfer.files);
  };
  const onKey = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      void send();
    }
  };
  const modelLabel = MODELS.find((m) => m.id === model)?.label ?? model;

  return (
    <div className={styles.wrap}>
      <div className={styles.hint}>
        {paused ? (
          <span className={styles.paused}>Claude is paused until you answer above.</span>
        ) : (
          <>
            Claude reads <span className="mono">CLAUDE.md</span> and{' '}
            <span className="mono">STATUS.md</span> first.
          </>
        )}
      </div>
      <div
        className={styles.box}
        data-disabled={disabled ? true : undefined}
        data-dragging={dragging || undefined}
        onDragOver={(e) => {
          if (!onUpload || disabled || ![...e.dataTransfer.types].includes('Files')) return;
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={(e) => {
          if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setDragging(false);
        }}
        onDrop={onDrop}
      >
        {files.length > 0 && (
          <ul className={styles.files} aria-label="Attachments">
            {files.map((f) => (
              <li key={f.key} className={styles.file} data-status={f.status}>
                {f.preview ? (
                  <img src={f.preview} alt="" className={styles.thumb} />
                ) : (
                  <FileText size={14} aria-hidden="true" className={styles.fileIcon} />
                )}
                <span className={styles.fileName} title={f.error ?? f.name}>
                  {f.name}
                </span>
                {f.status === 'uploading' && (
                  <span
                    className="spinner"
                    style={{ width: 10, height: 10 }}
                    aria-label="Uploading"
                  />
                )}
                {f.status === 'error' && <span className={styles.fileErr}>{f.error}</span>}
                <button
                  type="button"
                  className={styles.fileRemove}
                  aria-label={`Remove ${f.name}`}
                  onClick={() => remove(f.key)}
                >
                  <X size={12} aria-hidden="true" />
                </button>
              </li>
            ))}
          </ul>
        )}
        <label htmlFor={id} className="sr-only">
          Message Claude
        </label>
        <textarea
          id={id}
          ref={area}
          rows={2}
          className={styles.text}
          placeholder={
            disabled ??
            (running
              ? 'Claude is working… write your next message.'
              : 'Reply to Claude, or describe the next task…')
          }
          value={text}
          disabled={!!disabled}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={onKey}
          onPaste={onPaste}
        />
        <div className={styles.row}>
          {onUpload && (
            <>
              <button
                type="button"
                className={styles.attach}
                aria-label="Attach files"
                title="Attach files or pictures (or drop or paste them here)"
                disabled={!!disabled || files.length >= MAX_ATTACHMENTS}
                onClick={() => picker.current?.click()}
              >
                <Paperclip size={15} strokeWidth={1.8} aria-hidden="true" />
              </button>
              <input
                ref={picker}
                type="file"
                multiple
                hidden
                aria-hidden="true"
                tabIndex={-1}
                onChange={(e) => {
                  if (e.target.files) addFiles(e.target.files);
                  e.target.value = '';
                }}
              />
            </>
          )}
          <button
            type="button"
            className={styles.chip}
            aria-pressed={plan}
            onClick={() => setPlan(!plan)}
            title="Claude plans first and does not edit files"
          >
            <MapIcon size={12} strokeWidth={1.8} aria-hidden="true" />
            Plan mode
          </button>
          <div className={styles.modelWrap}>
            <button
              type="button"
              className={styles.chip}
              aria-haspopup="menu"
              aria-expanded={menu}
              onClick={() => setMenu(!menu)}
            >
              {modelLabel}
              <ChevronDown size={12} strokeWidth={2} aria-hidden="true" />
            </button>
            {menu && (
              <div className={styles.menu} role="menu">
                {MODELS.map((m) => (
                  <button
                    key={m.id}
                    type="button"
                    role="menuitemradio"
                    aria-checked={m.id === model}
                    onClick={() => {
                      onModel(m.id);
                      setMenu(false);
                    }}
                  >
                    {m.label}
                  </button>
                ))}
              </div>
            )}
          </div>
          <span className={styles.spacer} />
          {running ? (
            <button type="button" className={styles.stop} onClick={onStop}>
              <Square size={10} fill="currentColor" aria-hidden="true" />
              Stop
            </button>
          ) : (
            <button
              type="button"
              className={styles.send}
              aria-label="Send"
              disabled={!canSend}
              onClick={() => void send()}
            >
              <ArrowUp size={16} strokeWidth={2} aria-hidden="true" />
            </button>
          )}
        </div>
      </div>
      {fileError && <p className={styles.fileError}>{fileError}</p>}
    </div>
  );
}

interface Pending {
  key: string;
  name: string;
  status: 'uploading' | 'done' | 'error';
  id?: string;
  preview?: string;
  error?: string;
}
