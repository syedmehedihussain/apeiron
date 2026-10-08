import { X } from 'lucide-react';
import { useEffect } from 'react';
import { useUi } from '../../state/ui.ts';
import { MagnetAvatar } from '../MagnetAvatar/MagnetAvatar.tsx';
import styles from './MagnetPanel.module.css';

/** Slide-in Magnet panel. Magnet's conversation arrives in M8; this is the shell. */
export function MagnetPanel() {
  const open = useUi((s) => s.magnetOpen);
  const close = useUi((s) => s.closeMagnet);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && close();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, close]);

  if (!open) return null;
  return (
    <>
      <div className={styles.scrim} onClick={close} aria-hidden="true" />
      <aside className={styles.panel} aria-label="Magnet">
        <header className={styles.head}>
          <MagnetAvatar size={24} />
          <div className={styles.who}>
            <span className={styles.name}>Magnet</span>
            <span className={styles.sub}>Read-only</span>
          </div>
          <button
            type="button"
            className="btn btn-ghost btn-icon"
            aria-label="Close Magnet"
            onClick={close}
          >
            <X size={16} aria-hidden="true" />
          </button>
        </header>
        <div className={styles.body}>
          <p className={styles.soon}>Magnet arrives in a later milestone.</p>
        </div>
      </aside>
    </>
  );
}
