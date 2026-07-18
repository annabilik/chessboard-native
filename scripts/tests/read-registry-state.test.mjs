import assert from 'node:assert/strict';
import test from 'node:test';

import {
  interpretRegistryResponse,
  requireUnpublishedVersion,
} from '../read-registry-state.mjs';

const packageName = '@vibechess/chessboard-native';
const version = '0.1.0-next.1';

test('treats only a registry 404 as package absence', () => {
  assert.deepEqual(
    interpretRegistryResponse({
      status: 404,
      packageName,
      version,
    }),
    {
      packageExists: false,
      versionExists: false,
      latestBefore: '',
    },
  );

  for (const status of [401, 403, 429, 500, 503]) {
    assert.throws(
      () =>
        interpretRegistryResponse({
          status,
          packageName,
          version,
          body: { error: 'registry unavailable' },
        }),
      new RegExp(
        `HTTP ${status}.*refusing to treat it as package absence`,
        'u',
      ),
    );
  }
});

test('reads an existing package, exact version, and mandatory latest tag', () => {
  assert.deepEqual(
    interpretRegistryResponse({
      status: 200,
      packageName,
      version,
      body: {
        name: packageName,
        versions: {
          '0.1.0-next.0': {},
          [version]: {},
        },
        'dist-tags': {
          latest: '0.1.0-next.0',
          next: version,
        },
      },
    }),
    {
      packageExists: true,
      versionExists: true,
      latestBefore: '0.1.0-next.0',
    },
  );
});

test('rejects malformed successful responses instead of inferring absence', () => {
  assert.throws(
    () =>
      interpretRegistryResponse({
        status: 200,
        packageName,
        version,
        body: {
          name: packageName,
          versions: {},
          'dist-tags': {},
        },
      }),
    /must expose a non-empty dist-tags\.latest/u,
  );
  assert.throws(
    () =>
      interpretRegistryResponse({
        status: 200,
        packageName,
        version,
        body: {
          name: '@other/package',
          versions: {},
          'dist-tags': { latest: '1.0.0' },
        },
      }),
    /does not match/u,
  );
  assert.throws(
    () =>
      interpretRegistryResponse({
        status: 200,
        packageName,
        version,
        body: {
          name: packageName,
          versions: {},
          'dist-tags': { latest: '1.0.0\ninjected-output=true' },
        },
      }),
    /must be a single safe npm version/u,
  );
});

test('requires the exact version to remain unpublished', () => {
  assert.doesNotThrow(() =>
    requireUnpublishedVersion(
      {
        packageExists: true,
        versionExists: false,
        latestBefore: '0.1.0-next.0',
      },
      packageName,
      version,
    ),
  );
  assert.throws(
    () =>
      requireUnpublishedVersion(
        { packageExists: true, versionExists: true, latestBefore: version },
        packageName,
        version,
      ),
    /already exists and is immutable/u,
  );
});
