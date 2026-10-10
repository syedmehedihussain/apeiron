import { useEffect, useState } from 'react';
import { Outlet } from 'react-router';
import {
  ApiFailure,
  DaemonUnreachable,
  onApiFailure,
  redeemLoginFromHash,
} from '../../api/client.ts';
import { queryClient, useLiveProjects } from '../../api/queries.ts';
import { socket } from '../../api/socket.ts';
import appMark from '../../assets/cherry-mark.png';
import { ApprovalToasts } from '../../components/ApprovalToast/ApprovalToast.tsx';
import { MagnetPanel } from '../../components/MagnetPanel/MagnetPanel.tsx';
import { useLiveMagnet } from '../../api/magnet.ts';
import styles from './Shell.module.css';

type Gate = 'starting' | 'ready' | 'logged-out' | 'bad-link' | 'unreachable';

/** Logs in from the URL, then guards every screen: logged out, daemon down, or ready. */
export function Shell() {
  const [gate, setGate] = useState<Gate>('starting');

  useEffect(() => {
    let alive = true;
    const redeem = () =>
      void redeemLoginFromHash().then((result) => {
        if (!alive) return;
        if (result === 'failed') setGate('bad-link');
        else if (result === 'ok') {
          setGate('ready');
          void queryClient.invalidateQueries();
        } else setGate((g) => (g === 'starting' ? 'ready' : g));
      });
    redeem();
    // A new login link pasted into an open tab only changes the hash.
    window.addEventListener('hashchange', redeem);
    const off = onApiFailure((err) => {
      if (err instanceof DaemonUnreachable) setGate('unreachable');
      else if (err instanceof ApiFailure && err.status === 401)
        setGate((g) => (g === 'bad-link' ? g : 'logged-out'));
    });
    return () => {
      alive = false;
      off();
      window.removeEventListener('hashchange', redeem);
    };
  }, []);

  useEffect(() => {
    if (gate === 'ready') socket.start();
  }, [gate]);

  if (gate === 'starting') return null;
  if (gate !== 'ready')
    return (
      <GatePage
        gate={gate}
        onRetry={() => {
          setGate('ready');
          void queryClient.invalidateQueries();
        }}
      />
    );
  return <Ready />;
}

function Ready() {
  useLiveProjects();
  useLiveMagnet();
  return (
    <>
      <Outlet />
      <MagnetPanel />
      <ApprovalToasts />
    </>
  );
}

function GatePage({
  gate,
  onRetry,
}: {
  gate: Exclude<Gate, 'starting' | 'ready'>;
  onRetry: () => void;
}) {
  const text = {
    'logged-out': {
      title: 'Open Cherry from your terminal',
      body: 'Run `cherry` in a terminal and open the link it prints. The link logs this browser in for 30 days.',
    },
    'bad-link': {
      title: 'That login link has expired',
      body: 'Login links work once and for 10 minutes. Run `cherry` again for a fresh one.',
    },
    unreachable: {
      title: "Cherry isn't running",
      body: 'Run `cherry` in a terminal to start it, then try again.',
    },
  }[gate];
  return (
    <main className={styles.gate}>
      <img src={appMark} width={40} height={40} alt="" />
      <h1>{text.title}</h1>
      <p>{text.body.split('`').map((part, i) => (i % 2 ? <code key={i}>{part}</code> : part))}</p>
      {gate === 'unreachable' && (
        <button type="button" className="btn btn-secondary btn-md" onClick={onRetry}>
          Try again
        </button>
      )}
    </main>
  );
}
