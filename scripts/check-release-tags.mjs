import path from 'node:path';
import { pathToFileURL } from 'node:url';

const publishModes = new Set(['bootstrap-token', 'trusted-oidc']);
const verificationModes = new Set([
  'bootstrap-token',
  'trusted-oidc',
  'verify-registry',
]);
const commands = new Set(['before', 'expected-latest', 'after']);
const registryVersionPattern = /^[0-9A-Za-z][0-9A-Za-z.+-]*$/u;
const optionNames = new Set([
  'mode',
  'expected-version',
  'package-exists',
  'latest-before',
  'expected-latest',
  'observed-version',
  'next-version',
  'latest-version',
]);

function requireString(value, fieldName) {
  if (typeof value !== 'string' || value.length === 0) {
    throw new Error(`${fieldName} must be a non-empty string`);
  }
}

function requireRegistryVersion(value, fieldName) {
  requireString(value, fieldName);
  if (value.length > 256 || !registryVersionPattern.test(value)) {
    throw new Error(`${fieldName} must be a single safe npm version`);
  }
}

function requireMode(mode, allowedModes) {
  if (!allowedModes.has(mode)) {
    throw new Error(
      `mode must be one of ${[...allowedModes].sort().join(', ')}`,
    );
  }
}

export function validateRegistryBefore({
  mode,
  packageExists,
  latestBefore = '',
}) {
  requireMode(mode, publishModes);

  if (typeof packageExists !== 'boolean') {
    throw new Error('packageExists must be a boolean');
  }

  if (typeof latestBefore !== 'string') {
    throw new Error('latestBefore must be a string');
  }

  if (mode === 'bootstrap-token') {
    if (packageExists) {
      throw new Error(
        'bootstrap-token requires an unpublished package; use trusted-oidc for later versions',
      );
    }
    if (latestBefore.length > 0) {
      throw new Error(
        'bootstrap-token requires no pre-existing dist-tags.latest value',
      );
    }
    return;
  }

  if (!packageExists) {
    throw new Error(
      'trusted-oidc requires an existing package created by the bootstrap release',
    );
  }
  if (latestBefore.length === 0) {
    throw new Error(
      'trusted-oidc requires an existing dist-tags.latest value to preserve',
    );
  }
  requireRegistryVersion(latestBefore, 'latestBefore');
}

export function resolveExpectedLatest({
  mode,
  expectedVersion,
  latestBefore = '',
  expectedLatest = '',
}) {
  requireMode(mode, verificationModes);
  requireRegistryVersion(expectedVersion, 'expectedVersion');

  if (typeof latestBefore !== 'string') {
    throw new Error('latestBefore must be a string');
  }
  if (typeof expectedLatest !== 'string') {
    throw new Error('expectedLatest must be a string');
  }

  if (mode === 'bootstrap-token') {
    return expectedVersion;
  }

  if (mode === 'trusted-oidc') {
    requireRegistryVersion(latestBefore, 'latestBefore');
    return latestBefore;
  }

  requireRegistryVersion(expectedLatest, 'expectedLatest');
  return expectedLatest;
}

export function validateRegistryAfter({
  mode,
  expectedVersion,
  latestBefore = '',
  expectedLatest = '',
  observedVersion,
  nextVersion,
  latestVersion,
}) {
  const resolvedLatest = resolveExpectedLatest({
    mode,
    expectedVersion,
    latestBefore,
    expectedLatest,
  });

  if (observedVersion !== expectedVersion) {
    throw new Error(
      `registry version is ${observedVersion || '<missing>'}, expected ${expectedVersion}`,
    );
  }
  if (nextVersion !== expectedVersion) {
    throw new Error(
      `dist-tags.next is ${nextVersion || '<missing>'}, expected ${expectedVersion}`,
    );
  }
  if (latestVersion !== resolvedLatest) {
    throw new Error(
      `dist-tags.latest is ${latestVersion || '<missing>'}, expected ${resolvedLatest} for ${mode}`,
    );
  }

  return resolvedLatest;
}

function usage() {
  return [
    'Usage:',
    '  node scripts/check-release-tags.mjs before --mode <bootstrap-token|trusted-oidc> --package-exists <true|false> --latest-before <version-or-empty>',
    '  node scripts/check-release-tags.mjs expected-latest --mode <bootstrap-token|trusted-oidc|verify-registry> --expected-version <version> --latest-before <version-or-empty> --expected-latest <version-or-empty>',
    '  node scripts/check-release-tags.mjs after --mode <bootstrap-token|trusted-oidc|verify-registry> --expected-version <version> --latest-before <version-or-empty> --expected-latest <version-or-empty> --observed-version <version-or-empty> --next-version <version-or-empty> --latest-version <version-or-empty>',
  ].join('\n');
}

function parseArguments(argumentsList) {
  const [command, ...optionArguments] = argumentsList;
  if (!commands.has(command) || optionArguments.length % 2 !== 0) {
    throw new Error(usage());
  }

  const options = new Map();
  for (let index = 0; index < optionArguments.length; index += 2) {
    const option = optionArguments[index];
    const value = optionArguments[index + 1];
    const name = option?.startsWith('--') ? option.slice(2) : '';

    if (
      !optionNames.has(name) ||
      value === undefined ||
      value.startsWith('--') ||
      options.has(name)
    ) {
      throw new Error(usage());
    }

    options.set(name, value);
  }

  return { command, options };
}

function parsePackageExists(value) {
  if (value === 'true') {
    return true;
  }
  if (value === 'false') {
    return false;
  }
  throw new Error('package-exists must be true or false');
}

function runCli(argumentsList) {
  const { command, options } = parseArguments(argumentsList);
  const mode = options.get('mode');

  if (command === 'before') {
    validateRegistryBefore({
      mode,
      packageExists: parsePackageExists(options.get('package-exists')),
      latestBefore: options.get('latest-before') ?? '',
    });
    process.stdout.write(`Registry state permits ${mode} publication.\n`);
    return;
  }

  const values = {
    mode,
    expectedVersion: options.get('expected-version'),
    latestBefore: options.get('latest-before') ?? '',
    expectedLatest: options.get('expected-latest') ?? '',
  };

  if (command === 'expected-latest') {
    process.stdout.write(`${resolveExpectedLatest(values)}\n`);
    return;
  }

  const resolvedLatest = validateRegistryAfter({
    ...values,
    observedVersion: options.get('observed-version') ?? '',
    nextVersion: options.get('next-version') ?? '',
    latestVersion: options.get('latest-version') ?? '',
  });
  process.stdout.write(
    `Registry tags verified; dist-tags.latest=${resolvedLatest}.\n`,
  );
}

const entryPath = process.argv[1]
  ? pathToFileURL(path.resolve(process.argv[1])).href
  : '';

if (import.meta.url === entryPath) {
  try {
    runCli(process.argv.slice(2));
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    process.stderr.write(`Release tag check failed: ${message}\n`);
    process.exitCode = 1;
  }
}
