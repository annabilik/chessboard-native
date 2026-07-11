#!/usr/bin/env node

import { spawnSync } from 'node:child_process';
import { mkdir, rm } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { writeJestParityResultShard } from './parity-results.mjs';

const repositoryRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '..',
);
const outputDirectory = path.join(repositoryRoot, 'coverage/parity');
const rawResultPath = path.join(outputDirectory, 'jest.raw.json');
const shardPath = path.join(outputDirectory, 'jest.parity.json');
const pnpmCommand = process.platform === 'win32' ? 'pnpm.cmd' : 'pnpm';
const jestArguments = [
  '--filter',
  '@vibechess/chessboard-native',
  'exec',
  'jest',
  '--config',
  'jest.config.mjs',
  '--ci',
  '--runInBand',
  '--json',
  '--outputFile',
  rawResultPath,
  '--testLocationInResults',
];
const command = `${pnpmCommand} ${jestArguments.join(' ')}`;

await rm(outputDirectory, { force: true, recursive: true });
await mkdir(outputDirectory, { recursive: true });

const testRun = spawnSync(pnpmCommand, jestArguments, {
  cwd: repositoryRoot,
  env: process.env,
  stdio: 'inherit',
});

if (testRun.error) {
  throw testRun.error;
}
if (testRun.status !== 0) {
  process.exit(testRun.status ?? 1);
}

const shard = await writeJestParityResultShard({
  command,
  outputPath: shardPath,
  rawResultPath,
  repositoryRoot,
});
process.stdout.write(
  `Collected ${shard.results.length} executed parity contracts in ${path.relative(repositoryRoot, shardPath)}.\n`,
);
