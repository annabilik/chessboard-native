#!/usr/bin/env node

import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';

const repositoryRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '..',
);
const exampleRoot = path.join(repositoryRoot, 'apps/example');
const configPath = path.join(exampleRoot, '.rnstorybook');
const generatedPath = path.join(configPath, 'storybook.requires.ts');
const inventoryPath = path.join(
  repositoryRoot,
  'fixtures/storybook/required-stories.json',
);

const generatedBefore = await readFile(generatedPath, 'utf8');
const generation = spawnSync(
  'pnpm',
  ['--filter', '@vibechess/chessboard-native-example', 'storybook:generate'],
  {
    cwd: repositoryRoot,
    encoding: 'utf8',
  },
);

if (generation.stdout !== null && generation.stdout.length > 0) {
  process.stdout.write(generation.stdout);
}
if (generation.stderr !== null && generation.stderr.length > 0) {
  process.stderr.write(generation.stderr);
}
if (generation.error !== undefined) {
  throw generation.error;
}
if (generation.status !== 0) {
  process.stderr.write('Storybook story generation failed.\n');
  process.exit(generation.status ?? 1);
}

const generatedAfter = await readFile(generatedPath, 'utf8');
if (generatedAfter !== generatedBefore) {
  process.stderr.write(
    'Storybook generated entry is stale. Commit the regenerated apps/example/.rnstorybook/storybook.requires.ts file.\n',
  );
  process.exit(1);
}

const inventory = JSON.parse(await readFile(inventoryPath, 'utf8'));
if (
  typeof inventory !== 'object' ||
  inventory === null ||
  inventory.schemaVersion !== 1 ||
  !Array.isArray(inventory.stories) ||
  inventory.stories.some((storyId) => typeof storyId !== 'string')
) {
  throw new TypeError('Invalid Storybook required-story inventory.');
}

const expectedStoryIds = inventory.stories;
const duplicateExpectedIds = expectedStoryIds.filter(
  (storyId, index) => expectedStoryIds.indexOf(storyId) !== index,
);
if (duplicateExpectedIds.length > 0) {
  throw new TypeError(
    `Duplicate Storybook inventory IDs: ${[
      ...new Set(duplicateExpectedIds),
    ].join(', ')}`,
  );
}

// buildIndex captures process.cwd() when its module is evaluated.
process.chdir(exampleRoot);

// Storybook is installed in the private example app under pnpm's strict
// layout, so resolve its public Node entry point from that package.
const requireFromExample = createRequire(
  path.join(exampleRoot, 'package.json'),
);
const storybookNodeEntry = requireFromExample.resolve(
  '@storybook/react-native/node',
);
const { buildIndex } = await import(pathToFileURL(storybookNodeEntry).href);

const warnings = [];
const originalWarn = globalThis.console.warn;
globalThis.console.warn = (...values) => {
  warnings.push(values.map(String).join(' '));
  originalWarn(...values);
};

let index;
try {
  index = await buildIndex({ configPath });
} finally {
  globalThis.console.warn = originalWarn;
}

const errors = [];
const entries = Object.values(index.entries);
const nonStoryEntries = entries.filter((entry) => entry.type !== 'story');
if (nonStoryEntries.length > 0) {
  errors.push(
    `Unexpected non-story entries: ${nonStoryEntries
      .map((entry) => entry.id)
      .join(', ')}`,
  );
}

const actualStoryIds = Object.keys(index.entries);
const actualStoryIdSet = new Set(actualStoryIds);
const expectedStoryIdSet = new Set(expectedStoryIds);
const missingStoryIds = expectedStoryIds.filter(
  (storyId) => !actualStoryIdSet.has(storyId),
);
const unexpectedStoryIds = actualStoryIds.filter(
  (storyId) => !expectedStoryIdSet.has(storyId),
);

if (missingStoryIds.length > 0) {
  errors.push(`Missing stories:\n  ${missingStoryIds.join('\n  ')}`);
}
if (unexpectedStoryIds.length > 0) {
  errors.push(`Unexpected stories:\n  ${unexpectedStoryIds.join('\n  ')}`);
}
if (
  missingStoryIds.length === 0 &&
  unexpectedStoryIds.length === 0 &&
  actualStoryIds.some((storyId, index) => storyId !== expectedStoryIds[index])
) {
  errors.push(
    `Story order differs from the required inventory.\nExpected:\n  ${expectedStoryIds.join(
      '\n  ',
    )}\nActual:\n  ${actualStoryIds.join('\n  ')}`,
  );
}

const sortingWarnings = warnings.filter((warning) =>
  warning.includes('Failed to sort stories'),
);
if (sortingWarnings.length > 0) {
  errors.push(
    `Storybook could not apply preview storySort:\n  ${sortingWarnings.join(
      '\n  ',
    )}`,
  );
}

if (errors.length > 0) {
  process.stderr.write('Storybook inventory validation failed.\n\n');
  process.stderr.write(`${errors.join('\n\n')}\n`);
  process.exit(1);
}

process.stdout.write(
  `Validated ${String(actualStoryIds.length)} deterministic Storybook stories.\n`,
);
