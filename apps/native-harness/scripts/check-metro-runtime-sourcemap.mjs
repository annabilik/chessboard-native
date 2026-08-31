import { readFile, realpath } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const harnessRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '..',
);
const runtimePackages = [
  'react-native',
  'react-native-reanimated',
  'react-native-worklets',
];

function normalizePath(filePath) {
  return filePath.replaceAll('\\', '/').replace(/\/$/u, '');
}

function runtimeRootFromSource(source, packageName) {
  const normalizedSource = normalizePath(source);
  const marker = `/node_modules/${packageName}/`;
  const markerIndex = normalizedSource.lastIndexOf(marker);

  if (markerIndex === -1) return null;
  return normalizedSource.slice(0, markerIndex + marker.length - 1);
}

export function auditNativeRuntimeSources({ expectedRoots, sources }) {
  const errors = [];
  const packages = {};

  if (
    !Array.isArray(sources) ||
    !sources.every((source) => typeof source === 'string')
  ) {
    return {
      errors: ['Metro sourcemap must contain a string-only sources array'],
      packages,
    };
  }

  for (const packageName of runtimePackages) {
    const expectedRoot = normalizePath(expectedRoots[packageName] ?? '');
    const packageSources = sources
      .map((source) => ({
        root: runtimeRootFromSource(source, packageName),
        source,
      }))
      .filter(({ root }) => root !== null);
    const roots = [...new Set(packageSources.map(({ root }) => root))].sort();

    packages[packageName] = {
      expectedRoot,
      roots,
      sourceCount: packageSources.length,
    };

    if (packageSources.length === 0) {
      errors.push(`${packageName} has no Metro sources`);
    } else if (roots.length !== 1 || roots[0] !== expectedRoot) {
      errors.push(
        `${packageName} must resolve only from ${expectedRoot}; found ${roots.join(', ') || '<none>'}`,
      );
    }
  }

  return { errors, packages };
}

export async function checkNativeHarnessMetroSourcemap(sourceMapPath) {
  const [sourceMap, harnessManifest] = await Promise.all([
    readFile(sourceMapPath, 'utf8').then(JSON.parse),
    readFile(path.join(harnessRoot, 'package.json'), 'utf8').then(JSON.parse),
  ]);
  const expectedRoots = {};

  for (const packageName of runtimePackages) {
    const declaredVersion = harnessManifest.dependencies?.[packageName];
    if (!/^\d+\.\d+\.\d+$/u.test(declaredVersion ?? '')) {
      throw new Error(
        `Native harness must declare an exact ${packageName} version; found ${String(declaredVersion)}`,
      );
    }

    const packageRoot = await realpath(
      path.join(harnessRoot, 'node_modules', ...packageName.split('/')),
    );
    const installedManifest = JSON.parse(
      await readFile(path.join(packageRoot, 'package.json'), 'utf8'),
    );
    if (installedManifest.version !== declaredVersion) {
      throw new Error(
        `Native harness declares ${packageName}@${declaredVersion} but resolves ${installedManifest.version}`,
      );
    }
    expectedRoots[packageName] = packageRoot;
  }

  const result = auditNativeRuntimeSources({
    expectedRoots,
    sources: sourceMap.sources,
  });
  if (result.errors.length > 0) {
    throw new Error(result.errors.join('\n'));
  }

  return result;
}

function parseArguments(args) {
  if (args.length !== 2 || args[0] !== '--sourcemap' || !args[1]) {
    throw new Error(
      'Usage: node scripts/check-metro-runtime-sourcemap.mjs --sourcemap <index.android.bundle.packager.map>',
    );
  }
  return path.resolve(args[1]);
}

async function main() {
  const sourceMapPath = parseArguments(process.argv.slice(2));
  const result = await checkNativeHarnessMetroSourcemap(sourceMapPath);

  for (const [packageName, packageResult] of Object.entries(result.packages)) {
    process.stdout.write(
      `${packageName}: ${String(packageResult.sourceCount)} sources from ${packageResult.roots[0]}\n`,
    );
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  await main();
}
