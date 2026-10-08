import { ArrowUp, ChevronDown, Map as MapIcon, Square } from 'lucide-react';
import { useEffect, useId, useRef, useState, type KeyboardEvent } from 'react';
import { MODELS } from '@apeiron/shared';
import styles from './Composer.module.css';

interface ComposerProps {
  running: boolean;
  /** Claude waits for an approval or decision above. */
  paused: boolean;
  disabled?: string | null;
  model: string;
  draft?: string;
  onDraftUsed?: () => void;
  onSend(text: string, planMode: boolean, model: string): Promise<boolean>;
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

  const canSend = !disabled && !running && !sending && text.trim().length > 0;
  const send = async () => {
    if (!canSend) return;
    setSending(true);
    const ok = await onSend(text.trim(), plan, model);
    setSending(false);
    if (ok) setText('');
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
      <div className={styles.box} data-disabled={disabled ? true : undefined}>
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
        />
        <div className={styles.row}>
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
    </div>
  );
}
