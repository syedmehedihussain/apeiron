import { existsSync, mkdirSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import path from 'node:path';
import { execFileSync, spawnSync } from 'node:child_process';
import pkg from '../package.json' with { type: 'json' };
import {
  DAEMON_DIR,
  DAEMON_MAIN,
  REPO_ROOT,
  TSX_LOADER,
  WEB_DIR,
  cliRequest,
  openBrowser,
  readRunInfo,
  startDaemon,
  stopDaemon,
  type RunInfo,
} from './daemon-client.ts';

export interface RunResult {
  code: number;
  out: string;
}

export const HELP = `apeiron ${pkg.version}

Usage: apeiron [command]

  (none), up         start Apeiron and open it in the browser
  down               stop Apeiron
  status             show whether Apeiron is running
  open <project>     open a project's workspace
  logout             end every browser session
  doctor             check Node, git, gh and claude
  install-service    start Apeiron when you log in (systemd user service)

  --no-open          print the link without opening the browser
  -v, --version      print the version
  -h, --help         print this help`;

interface Status {
  version: string;
  projects: number;
  health: { claude: { found: boolean; loggedIn: boolean; version: string | null } };
}

function newestMtime(dir: string): number {
  let newest = 0;
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, entry.name);
    newest = Math.max(newest, entry.isDirectory() ? newestMtime(p) : statSync(p).mtimeMs);
  }
  return newest;
}

/** Builds the web UI when there is no build yet or the source changed since (the daemon serves it). */
function ensureWebBuild(): void {
  const index = path.join(WEB_DIR, 'dist', 'index.html');
  const sources = [path.join(WEB_DIR, 'src'), path.join(REPO_ROOT, 'docs', 'design')];
  if (existsSync(index) && statSync(index).mtimeMs >= Math.max(...sources.map(newestMtime))) return;
  console.error('Building the web UI…');
  const vite = path.join(WEB_DIR, 'node_modules', 'vite', 'bin', 'vite.js');
  const res = spawnSync(process.execPath, [vite, 'build'], { cwd: WEB_DIR, stdio: 'inherit' });
  if (res.status !== 0) throw new Error('Building the web UI failed.');
}

async function ensureRunning(): Promise<{ info: RunInfo; started: boolean }> {
  const running = readRunInfo();
  if (running) return { info: running, started: false };
  ensureWebBuild();
  return { info: await startDaemon(), started: true };
}

async function loginLink(info: RunInfo, route = '/'): Promise<string> {
  const { code } = await cliRequest<{ code: string }>(info, 'POST', '/api/cli/login-code');
  return `${info.webUrl}${route}#login=${code}`;
}

async function up(open: boolean, route = '/'): Promise<RunResult> {
  const { info, started } = await ensureRunning();
  const link = await loginLink(info, route);
  if (open) openBrowser(link);
  const head = started ? 'Apeiron is running.' : 'Apeiron was already running.';
  return {
    code: 0,
    out: `${head}\n\n  ${link}\n\nThe link logs you in once and works for 10 minutes. Bookmark ${info.webUrl}${route} for later.`,
  };
}

async function status(): Promise<RunResult> {
  const info = readRunInfo();
  if (!info) return { code: 1, out: 'Apeiron is not running. Start it with `apeiron`.' };
  const s = await cliRequest<Status>(info, 'GET', '/api/cli/status');
  const claude = s.health.claude.found
    ? s.health.claude.loggedIn
      ? `found (${s.health.claude.version ?? '?'})`
      : 'found, not logged in'
    : 'not found';
  return {
    code: 0,
    out: [
      `Apeiron ${s.version} is running (pid ${info.pid}).`,
      `  UI:          ${info.webUrl}`,
      `  Daemon:      http://127.0.0.1:${info.port}`,
      `  Projects:    ${s.projects}`,
      `  Claude Code: ${claude}`,
    ].join('\n'),
  };
}

async function down(): Promise<RunResult> {
  const info = readRunInfo();
  if (!info) return { code: 0, out: 'Apeiron is not running.' };
  return (await stopDaemon(info))
    ? { code: 0, out: 'Apeiron stopped.' }
    : { code: 1, out: `Apeiron (pid ${info.pid}) did not stop.` };
}

async function logout(): Promise<RunResult> {
  const info = readRunInfo();
  if (!info) return { code: 1, out: 'Apeiron is not running.' };
  await cliRequest(info, 'POST', '/api/cli/logout');
  return { code: 0, out: 'Every browser is logged out. Run `apeiron` for a new link.' };
}

function check(cmd: string, args: string[]): { ok: boolean; out: string } {
  try {
    return {
      ok: true,
      out: execFileSync(cmd, args, {
        encoding: 'utf8',
        timeout: 15_000,
        stdio: ['ignore', 'pipe', 'pipe'],
      }).trim(),
    };
  } catch (e) {
    const err = e as { stdout?: string; stderr?: string };
    return { ok: false, out: String(err.stdout ?? err.stderr ?? '').trim() };
  }
}

function doctor(): RunResult {
  const lines: string[] = [];
  let bad = 0;
  const row = (ok: boolean, name: string, detail: string, fix?: string) => {
    if (!ok) bad++;
    lines.push(`${ok ? 'ok ' : 'FIX'}  ${name.padEnd(12)} ${detail}`);
    if (!ok && fix) lines.push(`     ${''.padEnd(12)} → ${fix}`);
  };
  const major = Number(process.versions.node.split('.')[0]);
  row(major >= 22, 'Node', process.versions.node, 'Install Node 22 or newer (mise use node@22).');
  const git = check('git', ['--version']);
  row(git.ok, 'git', git.ok ? git.out : 'not found', 'Install git 2.40 or newer.');
  const claude = check('claude', ['--version']);
  row(
    claude.ok,
    'Claude Code',
    claude.ok ? claude.out : 'not found',
    'Install Claude Code: https://claude.com/claude-code',
  );
  if (claude.ok) {
    const auth = check('claude', ['auth', 'status', '--json']);
    let loggedIn: boolean;
    try {
      loggedIn = (JSON.parse(auth.out) as { loggedIn?: boolean }).loggedIn === true;
    } catch {
      loggedIn = false;
    }
    row(
      loggedIn,
      'Claude login',
      loggedIn ? 'logged in' : 'not logged in',
      'Run `claude auth login`.',
    );
  }
  const gh = check('gh', ['auth', 'status']);
  lines.push(
    `${gh.ok ? 'ok ' : '-- '}  ${'GitHub CLI'.padEnd(12)} ${gh.ok ? 'logged in' : 'optional: not found or not logged in (gh auth login)'}`,
  );
  const projects = path.join(homedir(), 'Projects');
  row(existsSync(projects), 'Projects', projects, `Create it: mkdir ${projects}`);
  return { code: bad ? 1 : 0, out: lines.join('\n') };
}

function installService(): RunResult {
  if (process.platform !== 'linux')
    return { code: 1, out: 'install-service supports Linux (systemd) for now.' };
  const dir = path.join(homedir(), '.config', 'systemd', 'user');
  mkdirSync(dir, { recursive: true });
  const unit = `[Unit]
Description=Apeiron daemon
After=default.target

[Service]
WorkingDirectory=${DAEMON_DIR}
ExecStart=${process.execPath} --import ${TSX_LOADER} ${DAEMON_MAIN}
Restart=on-failure

[Install]
WantedBy=default.target
`;
  writeFileSync(path.join(dir, 'apeiron.service'), unit);
  const reload = spawnSync('systemctl', ['--user', 'daemon-reload']);
  const enable = spawnSync('systemctl', ['--user', 'enable', '--now', 'apeiron.service']);
  if (reload.status !== 0 || enable.status !== 0) {
    return {
      code: 1,
      out: `Wrote ${dir}/apeiron.service, but systemctl failed: ${String(enable.stderr)}`,
    };
  }
  return { code: 0, out: 'Apeiron now starts when you log in. Run `apeiron` to get a login link.' };
}

export async function run(argv: readonly string[]): Promise<RunResult> {
  const args = argv.filter((a) => a !== '--no-open');
  const open = !argv.includes('--no-open');
  const [first = 'up', second] = args;

  try {
    switch (first) {
      case '-v':
      case '--version':
        return { code: 0, out: pkg.version };
      case '-h':
      case '--help':
      case 'help':
        return { code: 0, out: HELP };
      case 'up':
        return await up(open);
      case 'open':
        if (!second) return { code: 2, out: 'Usage: apeiron open <project>' };
        return await up(open, `/p/${encodeURIComponent(second)}`);
      case 'down':
        return await down();
      case 'status':
        return await status();
      case 'logout':
        return await logout();
      case 'doctor':
        return doctor();
      case 'install-service':
        return installService();
      default:
        return { code: 2, out: `Unknown command "${first}".\n\n${HELP}` };
    }
  } catch (e) {
    return { code: 1, out: `apeiron ${first}: ${(e as Error).message}` };
  }
}
