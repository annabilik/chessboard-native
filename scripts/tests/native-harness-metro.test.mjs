import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import {
  cp,
  mkdir,
  mkdtemp,
  readFile,
  realpath,
  rm,
  writeFile,
} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import { auditNativeRuntimeSources } from '../../apps/native-harness/scripts/check-metro-runtime-sourcemap.mjs';

const require = createRequire(import.meta.url);
const repositoryRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../..',
);
const harnessRoot = path.join(repositoryRoot, 'apps/native-harness');
const harnessNodeModules = path.join(harnessRoot, 'node_modules');
const runtimePackages = [
  'react',
  'react-native',
  'react-native-gesture-handler',
  'react-native-reanimated',
  'react-native-svg',
  'react-native-worklets',
];

test('workspace Metro resolves one exact native runtime from the harness', async () => {
  const [config, harnessManifest] = await Promise.all([
    import(path.join(harnessRoot, 'metro.config.js')).then(
      (module) => module.default,
    ),
    readFile(path.join(harnessRoot, 'package.json'), 'utf8').then(JSON.parse),
  ]);

  assert.equal(config.resolver.disableHierarchicalLookup, true);
  assert.equal(config.resolver.nodeModulesPaths[0], harnessNodeModules);
  assert.equal(
    config.resolver.nodeModulesPaths[1],
    path.join(repositoryRoot, 'node_modules/.pnpm/node_modules'),
  );

  for (const packageName of runtimePackages) {
    const expectedRoot = path.join(
      harnessNodeModules,
      ...packageName.split('/'),
    );
    const declaredVersion = harnessManifest.dependencies[packageName];
    const installedManifestPath = path.join(expectedRoot, 'package.json');
    const installedManifest = JSON.parse(
      await readFile(installedManifestPath, 'utf8'),
    );

    assert.match(declaredVersion, /^\d+\.\d+\.\d+$/u);
    assert.equal(config.resolver.extraNodeModules[packageName], expectedRoot);
    assert.equal(installedManifest.name, packageName);
    assert.equal(installedManifest.version, declaredVersion);
    assert.equal(
      await realpath(installedManifestPath),
      require.resolve(`${packageName}/package.json`, {
        paths: [harnessRoot],
      }),
    );
  }
});

test('a packed native consumer keeps Metro defaults', async (t) => {
  const temporaryRoot = await mkdtemp(
    path.join(os.tmpdir(), 'chessboard-native-metro-packed-'),
  );
  t.after(() => rm(temporaryRoot, { force: true, recursive: true }));

  const appRoot = path.join(temporaryRoot, 'apps/native-harness');
  const installedPackageRoot = path.join(
    appRoot,
    'node_modules/@vibechess/chessboard-native',
  );
  const metroConfigPackageRoot = path.join(
    appRoot,
    'node_modules/@react-native/metro-config',
  );

  await Promise.all([
    mkdir(installedPackageRoot, { recursive: true }),
    mkdir(metroConfigPackageRoot, { recursive: true }),
  ]);
  await Promise.all([
    cp(
      path.join(harnessRoot, 'metro.config.js'),
      path.join(appRoot, 'metro.config.js'),
    ),
    writeFile(
      path.join(metroConfigPackageRoot, 'index.js'),
      [
        'exports.getDefaultConfig = (projectRoot) => ({ projectRoot, resolver: { defaultResolver: true } });',
        'exports.mergeConfig = (defaults, config) => ({',
        '  ...defaults,',
        '  ...config,',
        '  resolver: { ...defaults.resolver, ...config.resolver },',
        '});',
        '',
      ].join('\n'),
    ),
  ]);

  const packedRequire = createRequire(path.join(appRoot, 'package.json'));
  const config = packedRequire('./metro.config.js');

  assert.equal(config.projectRoot, await realpath(appRoot));
  assert.deepEqual(config.resolver, { defaultResolver: true });
  assert.equal(config.watchFolders, undefined);
});

test('the Release sourcemap audit rejects a second native runtime', () => {
  const expectedRoots = {
    'react-native': '/workspace/node_modules/react-native',
    'react-native-reanimated':
      '/workspace/node_modules/react-native-reanimated',
    'react-native-worklets': '/workspace/node_modules/react-native-worklets',
  };
  const exactSources = Object.entries(expectedRoots).map(
    ([packageName, packageRoot]) => `${packageRoot}/src/${packageName}.js`,
  );

  assert.deepEqual(
    auditNativeRuntimeSources({
      expectedRoots,
      sources: exactSources,
    }).errors,
    [],
  );

  const duplicate = auditNativeRuntimeSources({
    expectedRoots,
    sources: [
      ...exactSources,
      '/workspace/node_modules/.pnpm/react-native@0.86.3/node_modules/react-native/index.js',
      '/workspace/node_modules/.pnpm/react-native-reanimated@4.5.1/node_modules/react-native-reanimated/index.js',
      '/workspace/node_modules/.pnpm/react-native-worklets@0.10.1/node_modules/react-native-worklets/index.js',
    ],
  });

  assert.equal(duplicate.errors.length, 3);
  assert.match(duplicate.errors[0], /react-native@0\.86\.3/u);
  assert.match(duplicate.errors[1], /react-native-reanimated@4\.5\.1/u);
  assert.match(duplicate.errors[2], /react-native-worklets@0\.10\.1/u);
});
