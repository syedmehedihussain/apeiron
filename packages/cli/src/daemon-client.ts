import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, openSync, readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export interface RunInfo {
  pid: number;
  port: number;
  webUrl: string;
  startedAt: number;
  cliSecret: string;
}

export const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
export const DAEMON_DIR = path.join(REPO_ROOT, 'packages', 'daemon');
export const DAEMON_MAIN = path.join(DAEMON_DIR, 'src', 'main.ts');
export const WEB_DIR = path.join(REPO_ROOT, 'packages', 'web');
export const TSX_LOADER = path.join(REPO_ROOT, 'node_modules', 'tsx', 'dist', 'loader.mjs');

export function apeironHome(): string {
  return process.env.APEIRON_HOME ?? path.join(homedir(), '.apeiron');
}

export function runFile(): string {
  return path.join(apeironHome(), 'run', 'daemon.json');
}

export function pidAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

/** The running daemon's info, or null when it is not running. */
export function readRunInfo(): RunInfo | null {
  const file = runFile();
  if (!existsSync(file)) return null;
  try {
    const info = JSON.parse(readFileSync(file, 'utf8')) as RunInfo;
    return pidAlive(info.pid) ? info : null;
  } catch {
    return null;
  }
}

export async function cliRequest<T>(info: RunInfo, method: string, route: string): Promise<T> {
  const res = await fetch(`http://127.0.0.1:${info.port}${route}`, {
    method,
    headers: { 'x-apeiron-cli': info.cliSecret },
  });
  if (!res.ok) throw new Error(`${method} ${route} → ${res.status}`);
  return (await res.json()) as T;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Starts the daemon in the background and waits until it answers. */
export async function startDaemon(): Promise<RunInfo> {
  const logDir = path.join(apeironHome(), 'run');
  mkdirSync(logDir, { recursive: true, mode: 0o700 });
  const log = openSync(path.join(logDir, 'daemon.log'), 'a');
  const child = spawn(process.execPath, ['--import', TSX_LOADER, DAEMON_MAIN], {
    cwd: DAEMON_DIR,
    detached: true,
    stdio: ['ignore', log, log],
    env: { ...process.env, APEIRON_WEB_URL: '', APEIRON_PRINT_LOGIN: '' },
  });
  child.unref();
  for (let i = 0; i < 100; i++) {
    await sleep(100);
    const info = readRunInfo();
    if (info && info.pid === child.pid) {
      try {
        await cliRequest(info, 'GET', '/api/cli/status');
        return info;
      } catch {
        // not listening yet
      }
    }
  }
  throw new Error(`The daemon did not start. See ${path.join(logDir, 'daemon.log')}`);
}

export async function stopDaemon(info: RunInfo): Promise<boolean> {
  process.kill(info.pid, 'SIGTERM');
  for (let i = 0; i < 50; i++) {
    await sleep(100);
    if (!pidAlive(info.pid)) return true;
  }
  return false;
}

export function openBrowser(url: string): void {
  const cmd = process.platform === 'darwin' ? 'open' : 'xdg-open';
  const child = spawn(cmd, [url], { detached: true, stdio: 'ignore' });
  child.on('error', () => undefined);
  child.unref();
}
