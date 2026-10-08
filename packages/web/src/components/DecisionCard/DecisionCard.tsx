import { Check, Compass } from 'lucide-react';
import { useId, useRef, useState, type KeyboardEvent } from 'react';
import type { DecisionCard as Card } from '@apeiron/shared';
import { Pill } from '../Pill/Pill.tsx';
import styles from './DecisionCard.module.css';

export type DecisionState = 'drafting' | 'open' | 'confirmed' | 'cancelled' | 'stale';

interface DecisionCardProps {
  card?: Card;
  state: DecisionState;
  answer?: string | null;
  onConfirm?: (answer: { optionId: string } | { custom: string }) => Promise<void> | void;
  onChange?: () => void;
  onAnswerInChat?: () => void;
}

export function DecisionCard({
  card,
  state,
  answer,
  onConfirm,
  onChange,
  onAnswerInChat,
}: DecisionCardProps) {
  const [picked, setPicked] = useState<string | null>(null);
  const [custom, setCustom] = useState('');
  const [why, setWhy] = useState(false);
  const [busy, setBusy] = useState(false);
  const titleId = useId();
  const optionRefs = useRef<(HTMLButtonElement | null)[]>([]);

  if (state === 'drafting' || !card) {
    return (
      <div className={styles.card} aria-busy="true">
        <div className={styles.head}>
          <span className={styles.label}>
            <span className="spinner" style={{ width: 10, height: 10 }} /> Drafting options…
          </span>
        </div>
        <div className={styles.body}>
          <span className="shimmer" style={{ height: 14, width: '40%' }} />
          {[0, 1, 2].map((i) => (
            <span key={i} className="shimmer" style={{ height: 58 }} />
          ))}
        </div>
      </div>
    );
  }

  if (state === 'confirmed' || state === 'cancelled') {
    return (
      <div className={styles.line} data-state={state}>
        <span className={styles.lineIcon}>
          {state === 'confirmed' ? <Check size={11} strokeWidth={2.4} aria-hidden="true" /> : null}
        </span>
        <span className={styles.lineTopic}>{card.topic}:</span>
        <span className={styles.lineAnswer}>{state === 'confirmed' ? answer : 'Not answered'}</span>
        <span style={{ flex: 1 }} />
        {onChange && state === 'confirmed' && (
          <button type="button" className={styles.change} onClick={onChange}>
            Change
          </button>
        )}
      </div>
    );
  }

  const canConfirm = !busy && (picked !== null || custom.trim().length > 0);
  const confirm = async () => {
    if (!canConfirm || !onConfirm) return;
    setBusy(true);
    try {
      await onConfirm(picked !== null ? { optionId: picked } : { custom: custom.trim() });
    } finally {
      setBusy(false);
    }
  };

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    const i = card.options.findIndex((o) => o.id === picked);
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      const next =
        (i + (e.key === 'ArrowDown' ? 1 : -1) + card.options.length) % card.options.length;
      setPicked(card.options[next]!.id);
      setCustom('');
      optionRefs.current[next]?.focus();
    } else if (e.key === 'Enter' && (e.target as HTMLElement).tagName !== 'INPUT') {
      e.preventDefault();
      void confirm();
    }
  };

  return (
    <section className={styles.card} aria-labelledby={titleId} data-state={state}>
      <div className={styles.head}>
        <span className={styles.label}>
          <span className={styles.icon}>
            <Compass size={12} strokeWidth={2} aria-hidden="true" />
          </span>
          {card.label}
        </span>
        {state === 'stale' ? (
          <Pill tone="warning">Check again</Pill>
        ) : (
          <Pill tone="warning" dot>
            Waiting for you
          </Pill>
        )}
      </div>
      <div className={styles.question}>
        <h3 id={titleId}>{card.question}</h3>
        {card.context && <p>{card.context}</p>}
        {state === 'stale' && (
          <p className={styles.stale}>An earlier answer changed. Check this again.</p>
        )}
      </div>
      <div
        className={styles.options}
        role="radiogroup"
        aria-labelledby={titleId}
        onKeyDown={onKeyDown}
      >
        {card.options.map((o, i) => (
          <button
            key={o.id}
            ref={(el) => {
              optionRefs.current[i] = el;
            }}
            type="button"
            role="radio"
            aria-checked={picked === o.id}
            tabIndex={picked === o.id || (picked === null && i === 0) ? 0 : -1}
            className={styles.option}
            onClick={() => {
              setPicked(o.id);
              setCustom('');
            }}
          >
            <span className={styles.radio} aria-hidden="true" />
            <span className={styles.optText}>
              <span className={styles.optTitle}>
                {o.title}
                {o.recommended && <span className={styles.rec}>Recommended</span>}
              </span>
              {o.detail && <span className={styles.optDetail}>{o.detail}</span>}
              <span className={styles.trade}>Trade-off: {o.tradeoff}</span>
            </span>
          </button>
        ))}
        {card.allowCustom && (
          <label className={styles.custom} data-active={custom.trim() ? true : undefined}>
            <span className={styles.radio} aria-hidden="true" />
            <span className={styles.customLabel}>Something else…</span>
            <input
              placeholder="Describe another approach"
              value={custom}
              onChange={(e) => {
                setCustom(e.target.value);
                if (e.target.value) setPicked(null);
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  void confirm();
                }
              }}
            />
          </label>
        )}
      </div>
      {why && card.why && <div className={styles.why}>{card.why}</div>}
      <div className={styles.foot}>
        <div className={styles.footLeft}>
          {card.why && (
            <button
              type="button"
              className="btn btn-ghost btn-md"
              aria-expanded={why}
              onClick={() => setWhy(!why)}
            >
              Why Claude recommends it
            </button>
          )}
          {onAnswerInChat && (
            <button type="button" className="btn btn-secondary btn-md" onClick={onAnswerInChat}>
              Answer in chat
            </button>
          )}
        </div>
        <button
          type="button"
          className="btn btn-primary btn-md"
          disabled={!canConfirm}
          onClick={() => void confirm()}
        >
          {busy ? 'Confirming…' : 'Confirm'}
        </button>
      </div>
    </section>
  );
}
