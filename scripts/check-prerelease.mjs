import { appendFile, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repositoryRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '..',
);
const defaultManifestPath = path.join(
  repositoryRoot,
  'packages/chessboard-native/package.json',
);
const expectedPackageName = '@vibechess/chessboard-native';
const expectedRepositoryUrl =
  'git+https://github.com/annabilik/chessboard-native.git';
const expectedRepositoryDirectory = 'packages/chessboard-native';
const expectedExportKeys = ['.', './package.json', './pieces'];
const dependencyGroups = [
  'dependencies',
  'devDependencies',
  'optionalDependencies',
  'peerDependencies',
];
const localDependencyPattern = /^(?:file|link|portal|workspace):/;
const prereleasePattern =
  /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)-next\.(0|[1-9]\d*)$/;

function usage() {
  return 'Usage: node scripts/check-prerelease.mjs [--manifest <package.json>] [--expected-version <version>]';
}

function parseArguments(argumentsList) {
  let manifestPath = defaultManifestPath;
  let expectedVersion;
  const seen = new Set();

  for (let index = 0; index < argumentsList.length; index += 2) {
    const option = argumentsList[index];
    const value = argumentsList[index + 1];

    if (
      (option !== '--manifest' && option !== '--expected-version') ||
      value === undefined ||
      value.startsWith('--') ||
      seen.has(option)
    ) {
      throw new Error(usage());
    }

    seen.add(option);
    if (option === '--manifest') {
      manifestPath = path.resolve(process.cwd(), value);
    } else {
      expectedVersion = value;
    }
  }

  return { expectedVersion, manifestPath };
}

function assertRecord(value, fieldName) {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`${fieldName} must be an object`);
  }
}

function assertVersion(version, expectedVersion) {
  if (version === '0.0.0') {
    throw new Error('version must not remain 0.0.0');
  }

  if (typeof version !== 'string') {
    throw new Error('version must be a string');
  }

  const match = prereleasePattern.exec(version);
  if (!match) {
    throw new Error('version must match X.Y.Z-next.N with no leading zeroes');
  }

  const numericIdentifiers = match.slice(1).map(Number);
  if (
    numericIdentifiers.some(
      (identifier) => !Number.isSafeInteger(identifier) || identifier < 0,
    )
  ) {
    throw new Error('version numeric identifiers must be safe integers');
  }

  if (numericIdentifiers.slice(0, 3).every((identifier) => identifier === 0)) {
    throw new Error('version base must not be 0.0.0');
  }

  if (expectedVersion !== undefined && version !== expectedVersion) {
    throw new Error(
      `version ${version} does not match expected version ${expectedVersion}`,
    );
  }
}

function assertPublishConfig(publishConfig) {
  assertRecord(publishConfig, 'publishConfig');

  if (publishConfig.access !== 'public') {
    throw new Error('publishConfig.access must be public');
  }

  if (publishConfig.registry !== 'https://registry.npmjs.org/') {
    throw new Error(
      'publishConfig.registry must be https://registry.npmjs.org/',
    );
  }

  if (publishConfig.tag !== 'next') {
    throw new Error('publishConfig.tag must be next');
  }
}

function assertRepository(repository) {
  assertRecord(repository, 'repository');

  if (repository.type !== 'git') {
    throw new Error('repository.type must be git');
  }

  if (repository.url !== expectedRepositoryUrl) {
    throw new Error(`repository.url must be ${expectedRepositoryUrl}`);
  }

  if (repository.directory !== expectedRepositoryDirectory) {
    throw new Error(
      `repository.directory must be ${expectedRepositoryDirectory}`,
    );
  }
}

function assertExports(exportsField) {
  assertRecord(exportsField, 'exports');

  const actualKeys = Object.keys(exportsField).sort();
  if (
    actualKeys.length !== expectedExportKeys.length ||
    actualKeys.some((key, index) => key !== expectedExportKeys[index])
  ) {
    throw new Error(
      `exports must contain exactly ${expectedExportKeys.join(', ')}`,
    );
  }
}

function assertNoLocalDependencies(manifest) {
  for (const groupName of dependencyGroups) {
    const group = manifest[groupName];
    if (group === undefined) {
      continue;
    }

    assertRecord(group, groupName);
    for (const [dependencyName, specifier] of Object.entries(group)) {
      if (
        typeof specifier === 'string' &&
        localDependencyPattern.test(specifier)
      ) {
        throw new Error(
          `${groupName}.${dependencyName} must not use local specifier ${specifier}`,
        );
      }
    }
  }
}

function validateManifest(manifest, expectedVersion) {
  assertRecord(manifest, 'package manifest');

  if (manifest.name !== expectedPackageName) {
    throw new Error(`name must be ${expectedPackageName}`);
  }

  assertVersion(manifest.version, expectedVersion);
  assertPublishConfig(manifest.publishConfig);
  assertRepository(manifest.repository);
  assertExports(manifest.exports);
  assertNoLocalDependencies(manifest);

  return manifest.version;
}

async function main() {
  const { expectedVersion, manifestPath } = parseArguments(
    process.argv.slice(2),
  );
  const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
  const version = validateManifest(manifest, expectedVersion);

  if (process.env.GITHUB_OUTPUT) {
    await appendFile(process.env.GITHUB_OUTPUT, `version=${version}\n`);
  }

  process.stdout.write(`${expectedPackageName}@${version}\n`);
}

try {
  await main();
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  process.stderr.write(`Prerelease check failed: ${message}\n`);
  process.exitCode = 1;
}
