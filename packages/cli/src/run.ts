import pkg from '../package.json' with { type: 'json' };

export interface RunResult {
  code: number;
  out: string;
}

const COMMANDS = ['up', 'down', 'status', 'open', 'logout', 'doctor', 'install-service'] as const;

export const HELP = `apeiron ${pkg.version}

Usage: apeiron [command]

  (none), up         start Apeiron and open it in the browser
  down               stop Apeiron
  status             show whether Apeiron is running
  open <project>     open a project's workspace
  logout             end every browser session
  doctor             check Node, git, gh and claude
  install-service    start Apeiron when you log in

  -v, --version      print the version
  -h, --help         print this help`;

export function run(argv: readonly string[]): RunResult {
  const [first = 'up'] = argv;

  if (first === '-v' || first === '--version') return { code: 0, out: pkg.version };
  if (first === '-h' || first === '--help' || first === 'help') return { code: 0, out: HELP };

  if ((COMMANDS as readonly string[]).includes(first)) {
    // Commands land in M1 (docs/roadmap.md).
    return { code: 1, out: `apeiron ${first}: not built yet (milestone M1)` };
  }

  return { code: 2, out: `Unknown command "${first}".\n\n${HELP}` };
}
