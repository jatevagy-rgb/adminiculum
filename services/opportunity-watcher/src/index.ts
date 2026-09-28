/**
 * GWO-1 — CLI entry point (package.json script: node src/index.ts).
 */

import { parseCliArgs, runCli } from './cli.ts';

const options = parseCliArgs(process.argv.slice(2));
const { report, exitCode } = await runCli(options);
process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
process.exitCode = exitCode;
