import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const repositoryRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../..',
);
const workspace = await readFile(
  path.join(repositoryRoot, 'pnpm-workspace.yaml'),
  'utf8',
);
const lockfile = await readFile(
  path.join(repositoryRoot, 'pnpm-lock.yaml'),
  'utf8',
);
const exactConsumers = [
  'apps/example/package.json',
  'apps/native-harness/package.json',
];

function sha256(content) {
  return createHash('sha256').update(content).digest('hex');
}

test('patches every exact workspace Reanimated consumer with the reviewed guard', async () => {
  const versions = new Set();
  for (const manifestPath of exactConsumers) {
    const manifest = JSON.parse(
      await readFile(path.join(repositoryRoot, manifestPath), 'utf8'),
    );
    const version = manifest.dependencies?.['react-native-reanimated'];
    assert.match(
      version,
      /^\d+\.\d+\.\d+$/u,
      `${manifestPath} must pin an exact Reanimated version`,
    );
    versions.add(version);
  }

  assert.equal(
    workspace.includes('allowUnusedPatches: false'),
    true,
    'unused patch entries must fail closed',
  );

  const patchContents = [];
  for (const version of [...versions].sort()) {
    const patchPath = `patches/react-native-reanimated@${version}.patch`;
    const content = await readFile(
      path.join(repositoryRoot, patchPath),
      'utf8',
    );
    const digest = sha256(content);

    assert.equal(
      workspace.includes(`react-native-reanimated@${version}: ${patchPath}`),
      true,
      `missing patchedDependencies entry for Reanimated ${version}`,
    );
    assert.equal(
      lockfile.includes(`react-native-reanimated@${version}: ${digest}`),
      true,
      `lockfile patch hash disagrees for Reanimated ${version}`,
    );
    assert.match(content, /private val getViewExistsMethod by lazy/u);
    assert.match(
      content,
      /getViewExistsMethod\.invoke\(mountingManager, viewTag\) == true/u,
    );
    assert.match(content, /updatePropsSynchronouslyMethod\.invoke/u);
    patchContents.push(content);
  }

  assert.equal(
    new Set(patchContents).size,
    1,
    'all currently identical Reanimated sources must carry the same reviewed patch',
  );
});

test('documents the exact upstream review boundary and consumer ownership', async () => {
  const documentation = await Promise.all(
    ['README.md', 'packages/chessboard-native/README.md'].map((file) =>
      readFile(path.join(repositoryRoot, file), 'utf8'),
    ),
  );

  for (const content of documentation) {
    assert.match(
      content,
      /software-mansion\/react-native-reanimated\/pull\/10435/u,
    );
    assert.match(
      content,
      /58bb2e750d12ccf1a78bbb6a36756215497d275f|host-owned peer dependency/u,
    );
  }
});
