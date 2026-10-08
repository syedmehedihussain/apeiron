import { execFile } from 'node:child_process';

export interface ExecResult {
  ok: boolean;
  code: number | null;
  stdout: string;
  stderr: string;
}

/** Runs a program without a shell. Never throws; a missing program gives `ok: false`. */
export function run(
  file: string,
  args: string[],
  opts: { cwd?: string; timeoutMs?: number; env?: NodeJS.ProcessEnv } = {},
): Promise<ExecResult> {
  return new Promise((resolve) => {
    execFile(
      file,
      args,
      {
        cwd: opts.cwd,
        timeout: opts.timeoutMs ?? 15_000,
        maxBuffer: 16 * 1024 * 1024,
        env: opts.env ?? process.env,
      },
      (error, stdout, stderr) => {
        const code = error ? (typeof error.code === 'number' ? error.code : null) : 0;
        resolve({ ok: !error, code, stdout: String(stdout), stderr: String(stderr) });
      },
    );
  });
}
