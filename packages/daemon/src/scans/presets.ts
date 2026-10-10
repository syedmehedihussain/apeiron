import type { SCAN_ICONS } from '@cherry/shared';

export interface ScanPreset {
  id: string;
  name: string;
  description: string;
  icon: (typeof SCAN_ICONS)[number];
  model: string;
  /** Commands it may run without asking, on top of COMMON_COMMANDS. */
  commands: string[];
  /** What to look for and how to write the report (the agent's skill). */
  instructions: string;
  source: 'builtin' | 'custom';
}

/** Read-only git commands every scan agent may run. */
export const COMMON_COMMANDS = ['git status', 'git log', 'git ls-files', 'git diff'];

/** `pnpm test`, `npm run test`, `yarn test`, `bun run test` for each script name. */
function scripts(...names: string[]): string[] {
  const out: string[] = [];
  for (const n of names)
    for (const pm of ['pnpm', 'npm', 'yarn', 'bun']) out.push(`${pm} ${n}`, `${pm} run ${n}`);
  return out;
}

const SECURITY = `Review this project for security problems a real attacker could use.

Look at, in this order:
1. Secrets committed to the repo: API keys, tokens, passwords, private keys in code, config or
   history (\`git log -p\` is not needed; grep the tree). You can never open .env files; that is
   fine, say they exist and are git-ignored if they are.
2. Injection: SQL built from strings, shell commands built from input, eval, unsafe template
   rendering, path traversal in file access.
3. Auth and access: routes without checks, tokens in URLs or logs, weak session handling, CORS
   that allows any origin, missing CSRF protection on cookie auth.
4. Unsafe defaults: servers bound to 0.0.0.0, debug modes on, permissive file permissions.
5. Dependencies: obviously abandoned or risky packages (do not run an audit; the Dependency
   audit agent does that).

For every finding give the file and line, why it matters, how it could be exploited in one
sentence, and the fix. Do not report style issues or theoretical problems with no path to harm.
Rate each finding critical, high, medium or low.`;

const TESTS = `Run this project's checks and explain the results.

1. Find how the project is tested: package.json scripts, Makefile, pyproject, Cargo.toml,
   CLAUDE.md or README. Note what exists (tests, typecheck, lint).
2. Run each check that exists, one command at a time, without pipes or redirects.
3. For every failure: the test or file, the error in one line, the most likely cause after
   reading the code, and the fix. Group failures that share one cause.
4. Note slow or flaky looking tests, and important code with no tests at all.

If nothing fails, say so plainly and list what ran with the pass counts. Count each distinct
failure as high, each warning (lint, flaky, untested area) as low.`;

const HEALTH = `Review the health of this codebase and say what to fix first.

Look for:
- Dead code: unused exports, files nothing imports, commented-out blocks.
- Duplication: the same logic written in several places.
- Oversized files and functions that do too much (name the worst ones with line counts).
- Missing or thin tests around the code that changes most (\`git log --stat\` helps).
- Error handling that swallows errors or leaves the user with nothing.
- TODO/FIXME/HACK comments that point at real problems.
- Docs that no longer match the code (README commands, CLAUDE.md layout).

Rank findings by how much fixing them would help: high (causes bugs or slows every change),
medium, low. Give file:line references and a concrete next step for each. End with the three
things you would do this week.`;

const DEPENDENCIES = `Audit this project's dependencies.

1. Find the package managers in use (lockfiles: pnpm-lock.yaml, package-lock.json, yarn.lock,
   bun.lockb, requirements.txt, poetry.lock, Cargo.lock, go.sum).
2. Run the audit and outdated commands that fit, one at a time, without pipes or redirects.
   These ask the package registry, which is expected.
3. Read the manifests for dependencies that nothing imports, duplicates (two libraries for one
   job), and packages pinned far behind their latest major version.
4. Flag licences that may be a problem for the project (GPL/AGPL in a closed project).

For each vulnerable package: name, installed version, fixed version, severity from the audit,
and whether the vulnerable code path is likely used. Keep the auditor's severity. Put safe
upgrades (patch and minor) in one list and breaking ones (major) in another.`;

export const BUILTIN_PRESETS: ScanPreset[] = [
  {
    id: 'security',
    name: 'Security review',
    description: 'Secrets, injection, auth gaps and unsafe defaults, ranked by severity.',
    icon: 'shield',
    model: 'opus',
    commands: [],
    instructions: SECURITY,
    source: 'builtin',
  },
  {
    id: 'tests',
    name: 'Test runner',
    description: 'Runs tests, typecheck and lint, and explains every failure.',
    icon: 'flask',
    model: 'sonnet',
    commands: [
      ...scripts('test', 'typecheck', 'lint', 'check', 'test:unit'),
      'pytest',
      'python -m pytest',
      'cargo test',
      'cargo check',
      'cargo clippy',
      'go test',
      'go vet',
      'make test',
      'make check',
    ],
    instructions: TESTS,
    source: 'builtin',
  },
  {
    id: 'health',
    name: 'Code health',
    description: 'Dead code, duplication, oversized files and missing tests.',
    icon: 'heart',
    model: 'sonnet',
    commands: [],
    instructions: HEALTH,
    source: 'builtin',
  },
  {
    id: 'dependencies',
    name: 'Dependency audit',
    description: 'Vulnerable, outdated and unused packages. Asks the package registry.',
    icon: 'package',
    model: 'sonnet',
    commands: [
      'pnpm audit',
      'pnpm outdated',
      'pnpm ls',
      'pnpm licenses list',
      'npm audit',
      'npm outdated',
      'npm ls',
      'yarn audit',
      'yarn outdated',
      'bun outdated',
      'pip list',
      'pip-audit',
      'cargo audit',
      'cargo outdated',
      'go list -m',
    ],
    instructions: DEPENDENCIES,
    source: 'builtin',
  },
];
