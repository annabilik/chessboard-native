import { appendFile } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const registryOrigin = 'https://registry.npmjs.org';
const registryVersionPattern = /^[0-9A-Za-z][0-9A-Za-z.+-]*$/u;

function assertRecord(value, fieldName) {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`${fieldName} must be an object`);
  }
}

export function interpretRegistryResponse({
  status,
  packageName,
  version,
  body,
}) {
  if (status === 404) {
    return {
      packageExists: false,
      versionExists: false,
      latestBefore: '',
    };
  }

  if (!Number.isInteger(status) || status < 200 || status >= 300) {
    throw new Error(
      `registry returned HTTP ${status}; refusing to treat it as package absence`,
    );
  }

  assertRecord(body, 'registry response');
  if (body.name !== packageName) {
    throw new Error(
      `registry response name ${String(body.name)} does not match ${packageName}`,
    );
  }

  assertRecord(body.versions, 'registry response versions');
  assertRecord(body['dist-tags'], 'registry response dist-tags');

  const latestBefore = body['dist-tags'].latest;
  if (typeof latestBefore !== 'string' || latestBefore.length === 0) {
    throw new Error(
      'an existing npm package must expose a non-empty dist-tags.latest value',
    );
  }
  if (latestBefore.length > 256 || !registryVersionPattern.test(latestBefore)) {
    throw new Error(
      'registry dist-tags.latest must be a single safe npm version',
    );
  }

  return {
    packageExists: true,
    versionExists: Object.hasOwn(body.versions, version),
    latestBefore,
  };
}

export function requireUnpublishedVersion(state, packageName, version) {
  if (state.versionExists) {
    throw new Error(
      `${packageName}@${version} already exists and is immutable`,
    );
  }
}

function usage() {
  return 'Usage: node scripts/read-registry-state.mjs --package <name> --version <version> --require-unpublished <true|false>';
}

function parseArguments(argumentsList) {
  const allowedOptions = new Set([
    '--package',
    '--version',
    '--require-unpublished',
  ]);
  const options = new Map();

  if (argumentsList.length % 2 !== 0) {
    throw new Error(usage());
  }

  for (let index = 0; index < argumentsList.length; index += 2) {
    const option = argumentsList[index];
    const value = argumentsList[index + 1];
    if (
      !allowedOptions.has(option) ||
      value === undefined ||
      value.startsWith('--') ||
      options.has(option)
    ) {
      throw new Error(usage());
    }
    options.set(option, value);
  }

  const packageName = options.get('--package');
  const version = options.get('--version');
  const requireUnpublished = options.get('--require-unpublished');

  if (
    !packageName ||
    !version ||
    !['true', 'false'].includes(requireUnpublished)
  ) {
    throw new Error(usage());
  }

  return {
    packageName,
    version,
    requireUnpublished: requireUnpublished === 'true',
  };
}

async function readRegistryState(packageName, version) {
  const registryUrl = `${registryOrigin}/${encodeURIComponent(packageName)}`;
  let response;

  try {
    response = await globalThis.fetch(registryUrl, {
      headers: {
        accept:
          'application/vnd.npm.install-v1+json; q=1.0, application/json; q=0.8',
      },
      signal: globalThis.AbortSignal.timeout(15_000),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`registry request failed: ${message}`, { cause: error });
  }

  let body;
  if (response.status !== 404) {
    try {
      body = await response.json();
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      throw new Error(`registry returned invalid JSON: ${message}`, {
        cause: error,
      });
    }
  }

  return interpretRegistryResponse({
    status: response.status,
    packageName,
    version,
    body,
  });
}

async function main() {
  const { packageName, version, requireUnpublished } = parseArguments(
    process.argv.slice(2),
  );
  const state = await readRegistryState(packageName, version);

  if (requireUnpublished) {
    requireUnpublishedVersion(state, packageName, version);
  }

  if (process.env.GITHUB_OUTPUT) {
    await appendFile(
      process.env.GITHUB_OUTPUT,
      [
        `package-exists=${state.packageExists}`,
        `version-exists=${state.versionExists}`,
        `latest-before=${state.latestBefore}`,
        '',
      ].join('\n'),
    );
  }

  process.stdout.write(
    `${packageName}: packageExists=${state.packageExists}, versionExists=${state.versionExists}, latest=${state.latestBefore || '<absent>'}\n`,
  );
}

const entryPath = process.argv[1]
  ? pathToFileURL(path.resolve(process.argv[1])).href
  : '';

if (import.meta.url === entryPath) {
  try {
    await main();
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    process.stderr.write(`Registry state check failed: ${message}\n`);
    process.exitCode = 1;
  }
}
