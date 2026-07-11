#!/usr/bin/env node

import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { checkParity, defaultManifestPath } from './parity.mjs';

const repositoryRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '..',
);

function usage() {
  return [
    'Usage: node scripts/check-parity.mjs [options]',
    '',
    'Options:',
    '  --baseline-ref <git-ref>  Validate status transitions against a Git ref',
    '  --complete                Require keep/adapt complete and every ID passing',
    '  --manifest <path>          Override the repository-relative manifest path',
    '  --results <path>           Add an executed-result file or directory (repeatable)',
    '  --write-doc                Regenerate the rendered parity documentation',
    '  --help                     Show this help',
  ].join('\n');
}

function parseArguments(argumentsList) {
  const environmentBaseline = process.env.PARITY_BASE_REF || undefined;
  const options = {
    baselineRef:
      environmentBaseline && !/^0+$/.test(environmentBaseline)
        ? environmentBaseline
        : undefined,
    complete: false,
    manifestPath: defaultManifestPath,
    resultInputs: [],
    writeDocumentation: false,
  };

  for (let index = 0; index < argumentsList.length; index += 1) {
    const argument = argumentsList[index];

    if (argument === '--complete') {
      options.complete = true;
    } else if (argument === '--write-doc') {
      options.writeDocumentation = true;
    } else if (argument === '--help') {
      process.stdout.write(`${usage()}\n`);
      process.exit(0);
    } else if (
      argument === '--baseline-ref' ||
      argument === '--manifest' ||
      argument === '--results'
    ) {
      const value = argumentsList[index + 1];
      if (!value || value.startsWith('--')) {
        throw new Error(`${argument} requires a value\n\n${usage()}`);
      }
      index += 1;

      if (argument === '--baseline-ref') {
        options.baselineRef = value;
      } else if (argument === '--manifest') {
        options.manifestPath = value;
      } else {
        options.resultInputs.push(value);
      }
    } else {
      throw new Error(`Unknown argument: ${argument}\n\n${usage()}`);
    }
  }

  if (options.complete && options.writeDocumentation) {
    throw new Error('--complete and --write-doc cannot be combined');
  }

  return options;
}

try {
  const options = parseArguments(process.argv.slice(2));
  const result = await checkParity({ ...options, repositoryRoot });
  const suffix = options.writeDocumentation
    ? ` and wrote ${result.manifest.documentation}`
    : '';
  process.stdout.write(
    `Parity manifest valid: ${result.manifest.entries.length} entries (${result.inventory.exports.length} exports, ${result.inventory.options.length} options, ${result.manifest.expectedCounts.behaviors} behaviors)${suffix}.\n`,
  );
} catch (error) {
  process.stderr.write(`${error instanceof Error ? error.message : error}\n`);
  process.exitCode = 1;
}
