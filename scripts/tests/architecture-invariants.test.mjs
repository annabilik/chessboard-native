import assert from 'node:assert/strict';
import { access, readFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const repositoryRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../..',
);
const registryPath = path.join(
  repositoryRoot,
  'fixtures/contracts/architecture-invariants.json',
);
const registry = JSON.parse(await readFile(registryPath, 'utf8'));
const expectedStatements = [
  '`position` is the only canonical logical position.',
  '`annotations` is the only persistent annotation collection.',
  'A gesture cannot commit semantic state.',
  'A callback result cannot substitute for a new controlled prop.',
  'A transient visual snapshot cannot become canonical state.',
  'The latest prop update always wins over an active animation.',
  'Revisions are monotonic, and every async result is correlated to its epoch and base revision.',
  'Rejection and cancellation restore the current controlled position.',
  'Position changes during a gesture cancel the gesture and every associated timer/signal; late results are inert.',
  'Annotation drafts are visually distinguishable and never persisted.',
  'Annotation operations never replace a collection and cannot silently remove IDs created after their base revision.',
  'Semantic board selection and destinations are consumer-owned; the provider may own only transient spare-source selection for non-drag placement.',
  'Orientation changes coordinates, not canonical square names.',
  'Multiple board instances share no semantic, SVG, animation, or annotation state. Provider gesture infrastructure is shared transiently and must route all active state by stable `boardId` without leaking between boards.',
  'A provider owns transient cross-component dragging but no semantic board state.',
  'The core package does not enforce chess rules.',
  'Reduced motion is honored by every transition path.',
  'Every drag-only action has a non-drag accessible alternative.',
  'Malformed controlled input fails predictably and loudly in development.',
  'FEN is valid only for an 8x8 board; variants use object positions.',
];

test('reserves one ordered contract namespace for all 20 invariants', () => {
  assert.equal(registry.schemaVersion, 1);
  assert.equal(registry.entries.length, expectedStatements.length);

  const invariantIds = registry.entries.map((entry) => entry.id);
  const contractIds = registry.entries.flatMap(
    (entry) => entry.contractTestIds,
  );

  assert.deepEqual(
    invariantIds,
    expectedStatements.map(
      (_statement, index) => `CBN-INV-${String(index + 1).padStart(3, '0')}`,
    ),
  );
  assert.equal(new Set(invariantIds).size, invariantIds.length);
  assert.equal(new Set(contractIds).size, contractIds.length);
  assert.ok(
    contractIds.every((contractId) =>
      /^CBN-CONTRACT-[0-9]{3}-[A-Z0-9-]+$/.test(contractId),
    ),
  );
  assert.deepEqual(
    registry.entries.map((entry) => entry.statement),
    expectedStatements,
  );
  assert.ok(
    registry.entries.every(
      (entry) => entry.contractTestIds.length > 0 && entry.adrs.length > 0,
    ),
  );
});

test('keeps every invariant linked to committed ADRs and the rendered index', async () => {
  const documentation = await readFile(
    path.join(repositoryRoot, 'docs/architecture/invariants.md'),
    'utf8',
  );

  for (const entry of registry.entries) {
    assert.match(documentation, new RegExp(entry.id));
    assert.ok(
      documentation.includes(entry.statement),
      `${entry.id} canonical statement is missing from the rendered index`,
    );
    for (const contractId of entry.contractTestIds) {
      assert.match(documentation, new RegExp(contractId));
    }
    for (const adr of entry.adrs) {
      await access(path.join(repositoryRoot, adr));
    }
  }

  const adrPaths = [
    ...new Set(registry.entries.flatMap((entry) => entry.adrs)),
  ];
  for (const adrPath of adrPaths) {
    const adr = await readFile(path.join(repositoryRoot, adrPath), 'utf8');
    for (const entry of registry.entries) {
      assert.equal(
        adr.includes(`\`${entry.id}\``),
        entry.adrs.includes(adrPath),
        `${adrPath} ownership disagrees with ${entry.id}`,
      );
    }
  }
});
