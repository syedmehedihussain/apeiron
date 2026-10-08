#!/usr/bin/env -S npx tsx
import { run } from './run.ts';

const { code, out } = run(process.argv.slice(2));
(code === 0 ? console.log : console.error)(out);
process.exitCode = code;
