import { MessageSquarePlus, X } from 'lucide-react';
import { useEffect } from 'react';
import { newMagnet, sendMagnet, useMagnet } from '../../api/magnet.ts';
import { useUi } from '../../state/ui.ts';
import { MagnetAvatar } from '../MagnetAvatar/MagnetAvatar.tsx';
import { MagnetChat } from '../MagnetChat/MagnetChat.tsx';
import styles from './MagnetPanel.module.css';

export function magnetSubtitle(readOnly: boolean | undefined, projects: number | undefined) {
  const mode = readOnly === false ? 'Can edit its notes' : 'Read-only';
  return projects === undefined
    ? mode
    : `${mode} · knows ${projects} project${projects === 1 ? '' : 's'}`;
}

/** Slide-in Magnet panel on Home (screens.md → Magnet open). */
export function MagnetPanel() {
  const open = useUi((s) => s.magnetOpen);
  const close = useUi((s) => s.closeMagnet);
  const draft = useUi((s) => s.magnetDraft);
  const magnet = useMagnet();

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && close();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, close]);

  // The Home prompt's "Ask Magnet" text is sent once when the panel opens.
  useEffect(() => {
    if (!open || !draft) return;
    useUi.setState({ magnetDraft: null });
    sendMagnet(draft).catch(() => undefined);
  }, [open, draft]);

  if (!open) return null;
  return (
    <>
      <div className={styles.scrim} onClick={close} aria-hidden="true" />
      <aside className={styles.panel} aria-label="Magnet">
        <header className={styles.head}>
          <span className={styles.avatar}>
            <MagnetAvatar size={24} />
          </span>
          <div className={styles.who}>
            <span className={styles.name}>Magnet</span>
            <span className={styles.sub}>
              {magnetSubtitle(magnet.data?.readOnly, magnet.data?.projects)}
            </span>
          </div>
          {!!magnet.data?.items.length && (
            <button
              type="button"
              className="btn btn-ghost btn-icon"
              aria-label="New conversation"
              title="New conversation"
              disabled={magnet.data.running}
              onClick={() => void newMagnet()}
            >
              <MessageSquarePlus size={16} aria-hidden="true" />
            </button>
          )}
          <button
            type="button"
            className="btn btn-ghost btn-icon"
            aria-label="Close Magnet"
            onClick={close}
          >
            <X size={16} aria-hidden="true" />
          </button>
        </header>
        <MagnetChat onNavigate={close} />
      </aside>
    </>
  );
}
