import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const repositoryRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../..',
);
const scriptPath = path.join(repositoryRoot, 'scripts/check-prerelease.mjs');
const sourceManifestPath = path.join(
  repositoryRoot,
  'packages/chessboard-native/package.json',
);
const sourceManifest = JSON.parse(await readFile(sourceManifestPath, 'utf8'));
const sourceVersion = sourceManifest.version;
const workspaceManifest = JSON.parse(
  await readFile(path.join(repositoryRoot, 'package.json'), 'utf8'),
);
const apiExtractorConfigs = [
  'packages/chessboard-native/api-extractor.json',
  'packages/chessboard-native/api-extractor.pieces.json',
  'packages/chessboard-native/api-extractor.react-chessboard-compat.json',
];

async function createManifest(t, mutate) {
  const directory = await mkdtemp(path.join(tmpdir(), 'cbn-prerelease-test-'));
  t.after(() => rm(directory, { force: true, recursive: true }));

  const manifest = JSON.parse(JSON.stringify(sourceManifest));
  mutate?.(manifest);

  const manifestPath = path.join(directory, 'package.json');
  await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
  return { directory, manifestPath };
}

function runCheck(manifestPath, extraArguments = [], env = {}) {
  return spawnSync(
    process.execPath,
    [scriptPath, '--manifest', manifestPath, ...extraArguments],
    {
      cwd: repositoryRoot,
      encoding: 'utf8',
      env: { ...process.env, ...env },
    },
  );
}

function assertFailure(result, expectedMessage) {
  assert.equal(result.status, 1, result.stderr);
  assert.match(result.stderr, expectedMessage);
}

test('accepts the exact prerelease manifest and emits its version', async (t) => {
  const { directory, manifestPath } = await createManifest(t);
  const githubOutputPath = path.join(directory, 'github-output');
  const result = runCheck(manifestPath, ['--expected-version', sourceVersion], {
    GITHUB_OUTPUT: githubOutputPath,
  });

  assert.equal(result.status, 0, result.stderr);
  assert.equal(
    result.stdout,
    `@vibechess/chessboard-native@${sourceVersion}\n`,
  );
  assert.equal(
    await readFile(githubOutputPath, 'utf8'),
    `version=${sourceVersion}\n`,
  );
});

test('keeps every public entry-point snapshot in API check and update scripts', () => {
  for (const scriptName of ['api:check', 'api:update']) {
    const script = workspaceManifest.scripts[scriptName];
    assert.equal(typeof script, 'string');
    for (const configPath of apiExtractorConfigs) {
      assert.equal(
        script.split(configPath).length - 1,
        1,
        `${scriptName} must invoke ${configPath} exactly once`,
      );
    }
  }
});

test('rejects malformed and zero-base prerelease versions', async (t) => {
  const invalidVersions = [
    ['0.1.0', /must match X\.Y\.Z-next\.N/],
    ['01.1.0-next.0', /must match X\.Y\.Z-next\.N/],
    ['0.0.0-next.0', /version base must not be 0\.0\.0/],
  ];

  for (const [version, expectedMessage] of invalidVersions) {
    const { manifestPath } = await createManifest(t, (manifest) => {
      manifest.version = version;
    });
    assertFailure(runCheck(manifestPath), expectedMessage);
  }
});

test('rejects an expected-version mismatch', async (t) => {
  const { manifestPath } = await createManifest(t);
  assertFailure(
    runCheck(manifestPath, ['--expected-version', '9.9.9-next.9']),
    /does not match expected version 9\.9\.9-next\.9/,
  );
});

test('rejects local dependency protocols in dependency groups', async (t) => {
  const localSpecifiers = [
    'workspace:*',
    'file:../local',
    'link:../local',
    'portal:../local',
  ];

  for (const specifier of localSpecifiers) {
    const { manifestPath } = await createManifest(t, (manifest) => {
      manifest.dependencies = { local: specifier };
    });
    assertFailure(runCheck(manifestPath), /must not use local specifier/);
  }
});

test('rejects a non-public npm registry configuration', async (t) => {
  const { manifestPath } = await createManifest(t, (manifest) => {
    manifest.publishConfig.registry = 'https://registry.example.com/';
  });
  assertFailure(
    runCheck(manifestPath),
    /publishConfig\.registry must be https:\/\/registry\.npmjs\.org\//,
  );
});

test('requires the prerelease-safe next publish tag', async (t) => {
  const { manifestPath } = await createManifest(t, (manifest) => {
    manifest.publishConfig.tag = 'latest';
  });
  assertFailure(runCheck(manifestPath), /publishConfig\.tag must be next/);
});

test('rejects incorrect repository metadata', async (t) => {
  const { manifestPath } = await createManifest(t, (manifest) => {
    manifest.repository.url = 'git+https://github.com/example/fork.git';
  });
  assertFailure(runCheck(manifestPath), /repository\.url must be/);
});

test('rejects a missing supported package export', async (t) => {
  const { manifestPath } = await createManifest(t, (manifest) => {
    delete manifest.exports['./react-chessboard-compat'];
  });
  assertFailure(runCheck(manifestPath), /exports must contain exactly/);
});

test('rejects an additional private package export', async (t) => {
  const { manifestPath } = await createManifest(t, (manifest) => {
    manifest.exports['./internal'] = './src/internal.ts';
  });
  assertFailure(runCheck(manifestPath), /exports must contain exactly/);
});

test('rejects changed public export targets', async (t) => {
  const targetMutations = [
    (manifest) => {
      manifest.exports['./pieces'].types = './lib/typescript/src/index.d.ts';
    },
    (manifest) => {
      manifest.exports['./package.json'] = './src/package.json';
    },
  ];

  for (const mutate of targetMutations) {
    const { manifestPath } = await createManifest(t, mutate);
    assertFailure(
      runCheck(manifestPath),
      /exports must match the frozen public package export map exactly/,
    );
  }
});

test('rejects changed public export conditions', async (t) => {
  const conditionMutations = [
    (manifest) => {
      delete manifest.exports['.']['react-native'];
    },
    (manifest) => {
      manifest.exports['./react-chessboard-compat'].require =
        './lib/module/react-chessboard-compat/index.js';
    },
    (manifest) => {
      const rootExport = manifest.exports['.'];
      manifest.exports['.'] = {
        default: rootExport.default,
        types: rootExport.types,
        'react-native': rootExport['react-native'],
        import: rootExport.import,
      };
    },
  ];

  for (const mutate of conditionMutations) {
    const { manifestPath } = await createManifest(t, mutate);
    assertFailure(
      runCheck(manifestPath),
      /exports must match the frozen public package export map exactly/,
    );
  }
});

test('rejects changed top-level resolver fields', async (t) => {
  const resolverMutations = [
    ['type', 'commonjs'],
    ['source', './src/pieces/index.ts'],
    ['main', './src/index.ts'],
    ['module', './src/index.ts'],
    ['types', './src/index.ts'],
    ['typings', './lib/typescript/src/index.d.ts'],
    ['react-native', './lib/module/index.js'],
    ['browser', './lib/module/browser.js'],
    ['imports', { '#internal': './lib/module/index.js' }],
    ['typesVersions', { '*': { '*': ['./lib/typescript/src/index.d.ts'] } }],
    ['sideEffects', true],
  ];

  for (const [fieldName, value] of resolverMutations) {
    const { manifestPath } = await createManifest(t, (manifest) => {
      manifest[fieldName] = value;
    });
    assertFailure(
      runCheck(manifestPath),
      new RegExp(`${fieldName} must match the frozen resolver value`),
    );
  }
});
