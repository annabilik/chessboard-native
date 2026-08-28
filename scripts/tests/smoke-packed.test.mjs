import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const repositoryRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../..',
);

test('the packed native consumer includes root modules imported by App.tsx', async () => {
  const [appSource, smokePackedSource] = await Promise.all([
    readFile(path.join(repositoryRoot, 'apps/native-harness/App.tsx'), 'utf8'),
    readFile(path.join(repositoryRoot, 'scripts/smoke-packed.mjs'), 'utf8'),
  ]);
  const nativeEntriesSource = smokePackedSource.match(
    /native:\s*\{\s*entries:\s*\[([\s\S]*?)\],\s*source:/u,
  )?.[1];

  assert.ok(nativeEntriesSource, 'native packed-consumer entries must exist');

  const nativeEntries = new Set(
    [...nativeEntriesSource.matchAll(/'([^']+)'/gu)].map((match) => match[1]),
  );
  const rootModuleImports = [
    ...appSource.matchAll(/from ['"]\.\/([^'"]+)['"]/gu),
  ]
    .map((match) => match[1])
    .filter((specifier) => !specifier.includes('/'));

  assert.notEqual(
    rootModuleImports.length,
    0,
    'App.tsx must retain at least one root-module import for this guard',
  );

  for (const specifier of rootModuleImports) {
    assert.ok(
      ['.js', '.jsx', '.ts', '.tsx'].some((extension) =>
        nativeEntries.has(`${specifier}${extension}`),
      ),
      `Packed native consumer omits App.tsx import: ./${specifier}`,
    );
  }
});
