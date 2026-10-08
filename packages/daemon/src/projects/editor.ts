import { spawn } from 'node:child_process';
import { run } from '../exec.ts';

/** Opens a file in the user's GUI editor: VS Code if present, else the desktop default. */
export async function openInEditor(file: string): Promise<'code' | 'xdg-open' | 'open'> {
  const hasCode = (await run('code', ['--version'], { timeoutMs: 5000 })).ok;
  const [cmd, args] = hasCode
    ? (['code', ['-g', file]] as const)
    : process.platform === 'darwin'
      ? (['open', [file]] as const)
      : (['xdg-open', [file]] as const);
  const child = spawn(cmd, [...args], { detached: true, stdio: 'ignore' });
  child.on('error', () => undefined);
  child.unref();
  return cmd;
}
