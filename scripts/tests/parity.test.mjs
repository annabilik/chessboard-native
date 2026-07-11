import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { cp, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import {
  checkParity,
  collectUpstreamInventory,
  isTrackedResultArtifact,
  renderParityDocumentation,
  validateManifestSchema,
  validateManifestSemantics,
  validateResults,
  validateStatusTransitions,
} from '../parity.mjs';
import {
  deriveJestParityResults,
  writeJestParityResultShard,
} from '../parity-results.mjs';

const repositoryRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../..',
);
const manifestPath = path.join(
  repositoryRoot,
  'fixtures/parity/react-chessboard-5.10.json',
);
const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
const inventory = await collectUpstreamInventory(repositoryRoot, manifest);

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function allPlannedManifest() {
  const value = clone(manifest);
  for (const entry of value.entries) {
    entry.status = 'planned';
  }
  return value;
}

function messages(errors) {
  return errors.join('\n');
}

function resultShard(results, shardPath = 'memory-results.json') {
  return {
    path: shardPath,
    value: {
      $schema: '../../fixtures/parity/results.schema.json',
      results,
      runner: 'node:test',
      schemaVersion: 1,
    },
  };
}

function jestEvidence({
  source = path.join(repositoryRoot, 'scripts/tests/parity.test.mjs'),
  status = 'passed',
  success = true,
  title = `[${manifest.entries[0].contractTestId}] executed contract`,
  titles,
} = {}) {
  const assertionTitles = titles ?? [title];
  return {
    success,
    testResults: [
      {
        assertionResults: assertionTitles.map((assertionTitle) => ({
          ancestorTitles: ['parity contract'],
          fullName: `parity contract ${assertionTitle}`,
          status,
          title: assertionTitle,
        })),
        name: source,
      },
    ],
  };
}

function implementedJestEvidence() {
  return jestEvidence({
    titles: manifest.entries
      .filter((entry) => entry.status === 'implemented')
      .map(
        (entry) => `[${entry.contractTestId}] executed public type contract`,
      ),
  });
}

async function writeImplementedEvidence(directory) {
  const rawResultPath = path.join(directory, 'jest.raw.json');
  const shardPath = path.join(directory, 'jest.parity.json');
  await writeFile(rawResultPath, JSON.stringify(implementedJestEvidence()));
  await writeJestParityResultShard({
    command: 'pnpm exec jest --json',
    outputPath: shardPath,
    rawResultPath,
    repositoryRoot,
  });
  return shardPath;
}

test('derives the complete pinned upstream inventory', () => {
  assert.equal(inventory.sourceFiles.length, 16);
  assert.equal(inventory.sourceLines, 2753);
  assert.equal(inventory.exports.length, 39);
  assert.equal(
    inventory.exports.filter((entry) => entry.exportKind === 'runtime').length,
    27,
  );
  assert.equal(
    inventory.exports.filter((entry) => entry.exportKind === 'type').length,
    12,
  );
  assert.equal(inventory.options.length, 42);
  assert.equal(
    inventory.options.filter((option) => option.callback).length,
    11,
  );
  assert.equal(inventory.options.filter((option) => option.style).length, 12);
  assert.equal(inventory.options.filter((option) => option.renderer).length, 1);
  assert.equal(inventory.arrowOptionDefaults.length, 10);
  assert.equal(inventory.defaultPieceRenderers.length, 12);
  assert.equal(
    inventory.sourceTree,
    '1a18be85a7cc4af14e21fb575fc594f9a349eb19',
  );
  assert.equal(
    inventory.provenanceSha256,
    '813bc7cca1557bb3a8a73b188c85da1416d18ae131c129dc41c47c2d1c615a17',
  );
});

test('accepts the complete planned ledger and schema', async () => {
  await validateManifestSchema(repositoryRoot, manifest);
  assert.deepEqual(validateManifestSemantics(manifest, inventory), []);
  assert.equal(manifest.entries.length, 131);
  assert.equal(
    manifest.entries.filter((entry) => entry.kind === 'behavior').length,
    50,
  );
});

test('rejects malformed schema branches and unknown properties', async () => {
  const invalidDisposition = clone(manifest);
  invalidDisposition.entries[0].disposition = 'maybe';
  await assert.rejects(
    validateManifestSchema(repositoryRoot, invalidDisposition),
    /must be equal to one of the allowed values/,
  );

  const invalidDefault = clone(manifest);
  const position = invalidDefault.entries.find(
    (entry) => entry.id === 'option.position',
  );
  position.upstream.default = { kind: 'undefined', expression: 'extra' };
  await assert.rejects(
    validateManifestSchema(repositoryRoot, invalidDefault),
    /additional properties|must match exactly one schema/i,
  );

  const extraProperty = clone(manifest);
  extraProperty.unreviewed = true;
  await assert.rejects(
    validateManifestSchema(repositoryRoot, extraProperty),
    /additional properties/i,
  );
});

test('detects missing exports, options, and behavior rows', () => {
  const mutated = clone(manifest);
  mutated.entries = mutated.entries.filter(
    (entry) =>
      entry.id !== 'export.chessboard' &&
      entry.id !== 'option.position' &&
      entry.id !== 'behavior.b01-standalone-and-provider-nesting',
  );
  const errors = messages(validateManifestSemantics(mutated, inventory));
  assert.match(errors, /Root export missing from manifest: Chessboard/);
  assert.match(
    errors,
    /ChessboardOptions field missing from manifest: position/,
  );
  assert.match(errors, /expectedCounts\.behaviors is 50, derived 49/);
  assert.match(errors, /expectedCounts\.entries is 131, derived 128/);
});

test('detects duplicate IDs, contracts, and upstream identities', () => {
  const mutated = clone(manifest);
  mutated.entries[1].id = mutated.entries[0].id;
  mutated.entries[2].contractTestId = mutated.entries[0].contractTestId;
  mutated.entries[3].upstream.name = mutated.entries[0].upstream.name;
  const errors = messages(validateManifestSemantics(mutated, inventory));
  assert.match(errors, /Duplicate entry ID/);
  assert.match(errors, /Duplicate contract-test ID/);
  assert.match(errors, /Duplicate upstream identity/);
});

test('checks option facets and defaults against the AST', () => {
  const mutated = clone(manifest);
  const callback = mutated.entries.find(
    (entry) => entry.id === 'option.can-drag-piece',
  );
  callback.facets = [];
  callback.upstream.default = { expression: 'true', kind: 'expression' };
  const style = mutated.entries.find(
    (entry) => entry.id === 'option.board-style',
  );
  style.facets = [];
  const errors = messages(validateManifestSemantics(mutated, inventory));
  assert.match(errors, /option\.can-drag-piece facets do not match callback/);
  assert.match(errors, /option\.can-drag-piece default does not match/);
  assert.match(errors, /option\.board-style facets do not match style/);
});

test('checks source paths, declaration starts, ranges, and fixture hashes', () => {
  const mutated = clone(manifest);
  mutated.target.sourceFiles[0].sha256 = '0'.repeat(64);
  const chessboard = mutated.entries.find(
    (entry) => entry.id === 'export.chessboard',
  );
  chessboard.upstream.references[0].startLine = 11;
  const behavior = mutated.entries.find(
    (entry) =>
      entry.id === 'behavior.b50-dom-css-dnd-kit-and-accessibility-absence',
  );
  behavior.upstream.references[0].endLine = 999;
  behavior.upstream.references.push({
    endLine: 1,
    path: 'src/Unknown.ts',
    startLine: 1,
  });
  const errors = messages(validateManifestSemantics(mutated, inventory));
  assert.match(errors, /src\/Arrows\.tsx SHA-256 changed/);
  assert.match(
    errors,
    /export\.chessboard must begin at src\/Chessboard\.tsx:12/,
  );
  assert.match(errors, /invalid source range/);
  assert.match(errors, /references unknown source src\/Unknown\.ts/);
});

test('independently rejects changed fixture bytes even when manifest hashes follow', async () => {
  await mkdir(path.join(repositoryRoot, 'temp'), { recursive: true });
  const temporaryDirectory = await mkdtemp(
    path.join(repositoryRoot, 'temp/parity-pin-'),
  );
  try {
    const copiedFixture = path.join(temporaryDirectory, 'upstream-b74704a');
    await cp(
      path.join(repositoryRoot, manifest.target.fixture),
      copiedFixture,
      { recursive: true },
    );
    const arrowsPath = path.join(copiedFixture, 'src/Arrows.tsx');
    const changed = (await readFile(arrowsPath, 'utf8')).replace(
      'import {',
      'import{ ',
    );
    await writeFile(arrowsPath, changed);

    const mutated = clone(manifest);
    mutated.target.fixture = path.relative(repositoryRoot, copiedFixture);
    mutated.target.sourceFiles.find(
      (file) => file.path === 'src/Arrows.tsx',
    ).sha256 = createHash('sha256').update(changed).digest('hex');
    const changedInventory = await collectUpstreamInventory(
      repositoryRoot,
      mutated,
    );
    const errors = messages(
      validateManifestSemantics(mutated, changedInventory),
    );
    assert.match(errors, /target\.fixture must remain pinned/);
    assert.match(errors, /Pinned Git source tree changed/);
  } finally {
    await rm(temporaryDirectory, { force: true, recursive: true });
  }
});

test('requires coherent native mappings and linked deviation rationale', () => {
  const mutated = clone(manifest);
  const dropped = mutated.entries.find(
    (entry) => entry.id === 'option.allow-auto-scroll',
  );
  dropped.native = { surface: 'root', symbols: ['bad'] };
  dropped.rationale = 'short';
  dropped.documentation = 'docs/elsewhere.md';
  const kept = mutated.entries.find(
    (entry) => entry.id === 'option.show-notation',
  );
  kept.native = { surface: 'none', symbols: [] };
  kept.rationale = 'Not permitted for keep.';
  kept.documentation = 'docs/elsewhere.md';
  const errors = messages(validateManifestSemantics(mutated, inventory));
  assert.match(
    errors,
    /option\.allow-auto-scroll is dropped but has a native API mapping/,
  );
  assert.match(errors, /needs a written redesign\/drop rationale/);
  assert.match(errors, /documentation must resolve/);
  assert.match(errors, /option\.show-notation must have a native API mapping/);
  assert.match(errors, /may only carry rationale\/documentation/);
});

test('rejects documentation-anchor collisions', () => {
  const mutated = clone(manifest);
  const deviations = mutated.entries.filter(
    (entry) => entry.disposition === 'redesign',
  );
  deviations[0].id = 'export.collision.value';
  deviations[0].documentation =
    'docs/parity/react-chessboard-5.10.md#export-collision-value';
  deviations[1].id = 'export.collision-value';
  deviations[1].documentation =
    'docs/parity/react-chessboard-5.10.md#export-collision-value';
  assert.match(
    messages(validateManifestSemantics(mutated, inventory)),
    /Duplicate documentation anchor/,
  );
});

test('allows only forward implementation-status transitions', () => {
  const allowed = [
    ['planned', 'planned'],
    ['planned', 'in-progress'],
    ['planned', 'implemented'],
    ['in-progress', 'in-progress'],
    ['in-progress', 'implemented'],
    ['implemented', 'implemented'],
  ];
  for (const [before, after] of allowed) {
    const previous = clone(manifest);
    const current = clone(manifest);
    previous.entries[0].status = before;
    current.entries[0].status = after;
    assert.deepEqual(validateStatusTransitions(previous, current), []);
  }

  const rejected = [
    ['in-progress', 'planned'],
    ['implemented', 'in-progress'],
    ['implemented', 'planned'],
  ];
  for (const [before, after] of rejected) {
    const previous = clone(manifest);
    const current = clone(manifest);
    previous.entries[0].status = before;
    current.entries[0].status = after;
    assert.match(
      messages(validateStatusTransitions(previous, current)),
      new RegExp(`Invalid status transition.*${before} -> ${after}`),
    );
  }
});

test('prevents silent removal and locks implemented mappings', () => {
  const previous = clone(manifest);
  const current = clone(manifest);
  previous.entries[0].status = 'implemented';
  current.entries[0].status = 'implemented';
  current.entries[0].disposition = 'redesign';
  current.entries[0].native.symbols = ['Changed'];
  current.entries[0].contractTestId = 'PARITY-EXPORT-CHANGED';
  current.entries.splice(1, 1);
  const errors = messages(validateStatusTransitions(previous, current));
  assert.match(errors, /Implemented disposition changed/);
  assert.match(errors, /Implemented native mapping changed/);
  assert.match(errors, /Implemented contract-test ID changed/);
  assert.match(errors, /Parity entry was removed/);
});

test('locks every pinned target field against the baseline', () => {
  const previous = clone(manifest);
  const current = clone(manifest);
  current.target.licenseSha256 = '0'.repeat(64);
  current.target.sourceFiles[0].sha256 = '1'.repeat(64);
  current.documentation = 'docs/parity/moved.md';
  const errors = messages(validateStatusTransitions(previous, current));
  assert.match(errors, /Pinned target metadata changed/);
  assert.match(errors, /Pinned parity documentation path changed/);
});

test('requires implemented keep/adapt rows to resolve to one passing execution', () => {
  const mutated = allPlannedManifest();
  const entry = mutated.entries[0];
  entry.status = 'implemented';

  assert.match(
    messages(validateResults(mutated, [], false)),
    /has no executed result/,
  );
  assert.deepEqual(validateResults(mutated, [], false, false), []);
  const pass = {
    id: entry.contractTestId,
    name: 'executed contract',
    source: 'tests/contracts/example.test.ts',
    status: 'passed',
  };
  assert.deepEqual(validateResults(mutated, [resultShard([pass])], false), []);
  assert.match(
    messages(
      validateResults(
        mutated,
        [resultShard([pass]), resultShard([pass], 'second-results.json')],
        false,
      ),
    ),
    /Duplicate executed parity result/,
  );
});

test('rejects unknown, failed, and skipped executed results', () => {
  const known = manifest.entries[0].contractTestId;
  const errors = messages(
    validateResults(
      manifest,
      [
        resultShard([
          {
            id: known,
            name: 'failed contract',
            source: 'tests/contracts/failure.test.ts',
            status: 'failed',
          },
          {
            id: 'PARITY-EXPORT-NOT-IN-MANIFEST',
            name: 'unknown contract',
            source: 'tests/contracts/unknown.test.ts',
            status: 'skipped',
          },
        ]),
      ],
      false,
    ),
  );
  assert.match(errors, /is failed, not passed/);
  assert.match(errors, /Unknown parity result ID/);
  assert.match(errors, /is skipped, not passed/);
});

test('complete mode requires keep/adapt implementation and every execution', () => {
  const planned = allPlannedManifest();
  const errors = validateResults(planned, [], true);
  const unfinishedKeepAdapt = planned.entries.filter(
    (entry) =>
      entry.status !== 'implemented' &&
      (entry.disposition === 'keep' || entry.disposition === 'adapt'),
  ).length;
  assert.equal(
    errors.filter((error) => error.includes('remains planned')).length,
    unfinishedKeepAdapt,
  );
  assert.equal(
    errors.filter((error) => error.includes('has no executed result')).length,
    131,
  );
});

test('renders deterministic documentation and catches committed drift', async () => {
  const rendered = renderParityDocumentation(manifest);
  const committed = await readFile(
    path.join(repositoryRoot, manifest.documentation),
    'utf8',
  );
  assert.equal(rendered, committed);
  assert.match(rendered, /\| Root named exports \| 39 \|/);
  assert.match(rendered, /<a id="option-allow-auto-scroll"><\/a>/);
});

test('normal end-to-end check accepts evidence for implemented IDs', async () => {
  const temporaryDirectory = await mkdtemp(
    path.join(tmpdir(), 'chessboard-native-end-to-end-'),
  );
  try {
    const shardPath = await writeImplementedEvidence(temporaryDirectory);
    const result = await checkParity({
      repositoryRoot,
      resultInputs: [shardPath],
    });
    assert.equal(result.manifest.entries.length, 131);
    assert.equal(result.shards.length, 1);
  } finally {
    await rm(temporaryDirectory, { force: true, recursive: true });
  }
});

test('CLI ignores the all-zero first-push baseline sentinel', async () => {
  const temporaryDirectory = await mkdtemp(
    path.join(tmpdir(), 'chessboard-native-cli-'),
  );
  try {
    const shardPath = await writeImplementedEvidence(temporaryDirectory);
    const result = spawnSync(
      process.execPath,
      ['scripts/check-parity.mjs', '--results', shardPath],
      {
        cwd: repositoryRoot,
        encoding: 'utf8',
        env: { ...process.env, PARITY_BASE_REF: '0'.repeat(40) },
      },
    );
    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /Parity manifest valid: 131 entries/);
  } finally {
    await rm(temporaryDirectory, { force: true, recursive: true });
  }
});

test('derives only anchored contract IDs from successful Jest evidence', () => {
  const derived = deriveJestParityResults(jestEvidence(), repositoryRoot);
  assert.deepEqual(derived, [
    {
      id: manifest.entries[0].contractTestId,
      name: `parity contract [${manifest.entries[0].contractTestId}] executed contract`,
      source: 'scripts/tests/parity.test.mjs',
      status: 'passed',
    },
  ]);

  assert.throws(
    () =>
      deriveJestParityResults(
        jestEvidence({
          title: `misplaced ${manifest.entries[0].contractTestId}`,
        }),
        repositoryRoot,
      ),
    /must begin with \[PARITY-/,
  );
  assert.throws(
    () =>
      deriveJestParityResults(jestEvidence({ success: false }), repositoryRoot),
    /does not represent a successful test run/,
  );
  assert.throws(
    () =>
      deriveJestParityResults(
        jestEvidence({ source: path.join(tmpdir(), 'outside.test.ts') }),
        repositoryRoot,
      ),
    /must be inside/,
  );
});

test('maps skipped Jest contracts to a failing parity result', () => {
  const results = deriveJestParityResults(
    jestEvidence({ status: 'pending' }),
    repositoryRoot,
  );
  assert.equal(results[0].status, 'skipped');
  assert.match(
    messages(validateResults(manifest, [resultShard(results)], false)),
    /is skipped, not passed/,
  );
});

test('accepts fresh commit-bound Jest evidence as a file or directory', async () => {
  const temporaryDirectory = await mkdtemp(
    path.join(tmpdir(), 'chessboard-native-evidence-'),
  );
  try {
    const rawResultPath = path.join(temporaryDirectory, 'jest.raw.json');
    const shardPath = path.join(temporaryDirectory, 'jest.parity.json');
    await writeFile(rawResultPath, JSON.stringify(implementedJestEvidence()));
    await writeJestParityResultShard({
      command: 'pnpm exec jest --json',
      outputPath: shardPath,
      rawResultPath,
      repositoryRoot,
    });

    const fromFile = await checkParity({
      repositoryRoot,
      resultInputs: [shardPath],
    });
    assert.equal(fromFile.shards[0].value.results.length, 10);
    const fromDirectory = await checkParity({
      repositoryRoot,
      resultInputs: [temporaryDirectory],
    });
    assert.equal(fromDirectory.shards[0].value.results.length, 10);
  } finally {
    await rm(temporaryDirectory, { force: true, recursive: true });
  }
});

test('rejects stale, tampered, and hand-normalized Jest evidence', async () => {
  const temporaryDirectory = await mkdtemp(
    path.join(tmpdir(), 'chessboard-native-tamper-'),
  );
  try {
    const rawResultPath = path.join(temporaryDirectory, 'jest.raw.json');
    const shardPath = path.join(temporaryDirectory, 'jest.parity.json');
    await writeFile(rawResultPath, JSON.stringify(jestEvidence()));
    await writeJestParityResultShard({
      command: 'pnpm exec jest --json',
      outputPath: shardPath,
      rawResultPath,
      repositoryRoot,
    });

    const normalized = JSON.parse(await readFile(shardPath, 'utf8'));
    normalized.results[0].name = 'hand-authored result';
    await writeFile(shardPath, JSON.stringify(normalized));
    await assert.rejects(
      checkParity({ repositoryRoot, resultInputs: [shardPath] }),
      /normalized results do not match executed Jest evidence/,
    );

    await writeJestParityResultShard({
      command: 'pnpm exec jest --json',
      outputPath: shardPath,
      rawResultPath,
      repositoryRoot,
    });
    await writeFile(rawResultPath, `${JSON.stringify(jestEvidence())}\n`);
    await assert.rejects(
      checkParity({ repositoryRoot, resultInputs: [shardPath] }),
      /evidence SHA-256 does not match/,
    );

    await writeFile(rawResultPath, JSON.stringify(jestEvidence()));
    await writeJestParityResultShard({
      command: 'pnpm exec jest --json',
      outputPath: shardPath,
      rawResultPath,
      repositoryRoot,
    });
    const stale = JSON.parse(await readFile(shardPath, 'utf8'));
    stale.commit = '0'.repeat(40);
    await writeFile(shardPath, JSON.stringify(stale));
    await assert.rejects(
      checkParity({ repositoryRoot, resultInputs: [shardPath] }),
      /was collected for .* not the checked-out commit/,
    );
  } finally {
    await rm(temporaryDirectory, { force: true, recursive: true });
  }
});

test('rejects nonexistent test sources and recognizes tracked artifacts', async () => {
  assert.equal(
    isTrackedResultArtifact(
      repositoryRoot,
      path.join(repositoryRoot, 'package.json'),
    ),
    true,
  );
  const temporaryDirectory = await mkdtemp(
    path.join(tmpdir(), 'chessboard-native-source-'),
  );
  try {
    assert.equal(
      isTrackedResultArtifact(
        repositoryRoot,
        path.join(temporaryDirectory, 'untracked.json'),
      ),
      false,
    );
    const rawResultPath = path.join(temporaryDirectory, 'jest.raw.json');
    const shardPath = path.join(temporaryDirectory, 'jest.parity.json');
    await writeFile(
      rawResultPath,
      JSON.stringify(
        jestEvidence({
          source: path.join(repositoryRoot, 'missing-contract.test.ts'),
        }),
      ),
    );
    await assert.rejects(
      writeJestParityResultShard({
        command: 'pnpm exec jest --json',
        outputPath: shardPath,
        rawResultPath,
        repositoryRoot,
      }),
      /Collected parity source is not a file/,
    );
  } finally {
    await rm(temporaryDirectory, { force: true, recursive: true });
  }
});

test('result shards are schema-validated instead of source-string scanned', async () => {
  const temporaryDirectory = await mkdtemp(
    path.join(tmpdir(), 'chessboard-native-parity-'),
  );
  try {
    const invalidPath = path.join(temporaryDirectory, 'invalid.json');
    await writeFile(
      invalidPath,
      JSON.stringify({
        $schema: 'results.schema.json',
        results: [{ id: manifest.entries[0].contractTestId, status: 'passed' }],
        runner: 'fake',
        schemaVersion: 1,
      }),
    );
    await assert.rejects(
      checkParity({ repositoryRoot, resultInputs: [invalidPath] }),
      /violates its schema/,
    );
  } finally {
    await rm(temporaryDirectory, { force: true, recursive: true });
  }
});
