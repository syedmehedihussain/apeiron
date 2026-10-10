import { ArrowUp, Folder, Plus } from 'lucide-react';
import { useId, useState, type KeyboardEvent } from 'react';
import type { ProjectCard } from '@cherry/shared';
import { MagnetAvatar } from '../MagnetAvatar/MagnetAvatar.tsx';
import styles from './PromptBox.module.css';

export type PromptMode = 'new' | 'calibrate' | 'magnet';

interface PromptBoxProps {
  disabled: boolean;
  /** Folders that can be calibrated (Not calibrated or cctop). */
  calibratable: ProjectCard[];
  onNewProject(idea: string): void;
  onAskMagnet(text: string): void;
  onCalibrate(id: string): void;
}

const PLACEHOLDER: Record<PromptMode, string> = {
  new: 'Describe a new project, or ask Magnet anything…',
  calibrate: 'Pick a folder below to calibrate it.',
  magnet: 'Ask Magnet about any project…',
};

export function PromptBox({
  disabled,
  calibratable,
  onNewProject,
  onAskMagnet,
  onCalibrate,
}: PromptBoxProps) {
  const [mode, setMode] = useState<PromptMode>('new');
  const [text, setText] = useState('');
  const id = useId();
  const canSend = !disabled && mode !== 'calibrate' && text.trim().length > 0;

  const send = () => {
    if (!canSend) return;
    if (mode === 'new') onNewProject(text.trim());
    else onAskMagnet(text.trim());
    setText('');
  };

  const onKey = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey || !e.shiftKey)) {
      e.preventDefault();
      send();
    }
  };

  const chip = (m: PromptMode, icon: React.ReactNode, label: string) => (
    <button
      type="button"
      className={styles.chip}
      aria-pressed={mode === m}
      onClick={() => setMode(m)}
      disabled={disabled}
    >
      {icon}
      {label}
    </button>
  );

  return (
    <div className={styles.box} data-disabled={disabled || undefined}>
      <label htmlFor={id} className="sr-only">
        Describe a new project, or ask Magnet
      </label>
      <textarea
        id={id}
        rows={2}
        className={styles.text}
        placeholder={disabled ? 'Connect Claude Code to start a project…' : PLACEHOLDER[mode]}
        value={text}
        disabled={disabled || mode === 'calibrate'}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={onKey}
      />
      {mode === 'calibrate' && !disabled && (
        <div className={styles.picker} role="list" aria-label="Folders to calibrate">
          {calibratable.length === 0 && (
            <span className={styles.none}>Every folder is already calibrated.</span>
          )}
          {calibratable.map((c) => (
            <button
              key={c.id}
              type="button"
              role="listitem"
              className={styles.folder}
              onClick={() => onCalibrate(c.id)}
            >
              <Folder size={13} strokeWidth={1.8} aria-hidden="true" />
              <span className="mono">{c.id}</span>
              <span className={styles.folderState}>
                {c.state === 'cctop' ? 'cctop · light calibration' : 'Not calibrated'}
              </span>
            </button>
          ))}
        </div>
      )}
      <div className={styles.row}>
        {chip('new', <Plus size={13} strokeWidth={1.8} aria-hidden="true" />, 'New project')}
        {chip(
          'calibrate',
          <Folder size={13} strokeWidth={1.8} aria-hidden="true" />,
          'Calibrate a folder',
        )}
        {chip('magnet', <MagnetAvatar size={16} display={14} />, 'Ask Magnet')}
        <span className={styles.spacer} />
        <button
          type="button"
          className={styles.send}
          aria-label="Send"
          disabled={!canSend}
          onClick={send}
        >
          <ArrowUp size={16} strokeWidth={2} aria-hidden="true" />
        </button>
      </div>
    </div>
  );
}
