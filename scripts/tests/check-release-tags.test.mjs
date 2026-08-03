import assert from 'node:assert/strict';
import test from 'node:test';

import {
  resolveExpectedLatest,
  validateRegistryAfter,
  validateRegistryBefore,
} from '../check-release-tags.mjs';

const expectedVersion = '0.1.0-next.0';
const stableVersion = '0.1.0';

test('allows bootstrap only while the package and latest tag are absent', () => {
  assert.doesNotThrow(() =>
    validateRegistryBefore({
      mode: 'bootstrap-token',
      packageExists: false,
      latestBefore: '',
    }),
  );

  assert.throws(
    () =>
      validateRegistryBefore({
        mode: 'bootstrap-token',
        packageExists: true,
        latestBefore: expectedVersion,
      }),
    /bootstrap-token requires an unpublished package/u,
  );
});

test('allows trusted publishing only after bootstrap and preserves latest', () => {
  assert.doesNotThrow(() =>
    validateRegistryBefore({
      mode: 'trusted-oidc',
      packageExists: true,
      latestBefore: expectedVersion,
    }),
  );

  assert.throws(
    () =>
      validateRegistryBefore({
        mode: 'trusted-oidc',
        packageExists: false,
        latestBefore: '',
      }),
    /trusted-oidc requires an existing package/u,
  );
  assert.throws(
    () =>
      validateRegistryBefore({
        mode: 'trusted-oidc',
        packageExists: true,
        latestBefore: '',
      }),
    /requires an existing dist-tags\.latest/u,
  );
});

test('models npm mandatory latest behavior for the first publication', () => {
  assert.equal(
    resolveExpectedLatest({
      mode: 'bootstrap-token',
      expectedVersion,
    }),
    expectedVersion,
  );

  assert.equal(
    validateRegistryAfter({
      mode: 'bootstrap-token',
      expectedVersion,
      observedVersion: expectedVersion,
      nextVersion: expectedVersion,
      latestVersion: expectedVersion,
    }),
    expectedVersion,
  );
});

test('models a first stable publication without manufacturing a next tag', () => {
  assert.equal(
    resolveExpectedLatest({
      mode: 'bootstrap-token',
      expectedVersion: stableVersion,
    }),
    stableVersion,
  );

  assert.equal(
    validateRegistryAfter({
      mode: 'bootstrap-token',
      expectedVersion: stableVersion,
      nextBefore: '',
      observedVersion: stableVersion,
      nextVersion: '',
      latestVersion: stableVersion,
    }),
    stableVersion,
  );
});

test('moves latest and preserves next exactly for a stable OIDC release', () => {
  const previousLatest = '0.1.0-next.0';
  const previousNext = '0.1.0-next.3';

  assert.equal(
    resolveExpectedLatest({
      mode: 'trusted-oidc',
      expectedVersion: stableVersion,
      latestBefore: previousLatest,
    }),
    stableVersion,
  );

  assert.equal(
    validateRegistryAfter({
      mode: 'trusted-oidc',
      expectedVersion: stableVersion,
      latestBefore: previousLatest,
      nextBefore: previousNext,
      observedVersion: stableVersion,
      nextVersion: previousNext,
      latestVersion: stableVersion,
    }),
    stableVersion,
  );

  assert.throws(
    () =>
      validateRegistryAfter({
        mode: 'trusted-oidc',
        expectedVersion: stableVersion,
        latestBefore: previousLatest,
        nextBefore: previousNext,
        observedVersion: stableVersion,
        nextVersion: expectedVersion,
        latestVersion: stableVersion,
      }),
    /dist-tags\.next is 0\.1\.0-next\.0, expected unchanged value 0\.1\.0-next\.3/u,
  );

  assert.throws(
    () =>
      validateRegistryAfter({
        mode: 'trusted-oidc',
        expectedVersion: stableVersion,
        latestBefore: previousLatest,
        nextBefore: previousNext,
        observedVersion: stableVersion,
        nextVersion: previousNext,
        latestVersion: previousLatest,
      }),
    /dist-tags\.latest is 0\.1\.0-next\.0, expected 0\.1\.0/u,
  );
});

test('accepts an optional valid next observation for stable recovery', () => {
  const previousNext = '0.1.0-next.3';

  assert.equal(
    validateRegistryAfter({
      mode: 'verify-registry',
      expectedVersion: stableVersion,
      expectedLatest: stableVersion,
      observedVersion: stableVersion,
      nextVersion: previousNext,
      latestVersion: stableVersion,
    }),
    stableVersion,
  );

  assert.equal(
    validateRegistryAfter({
      mode: 'verify-registry',
      expectedVersion: stableVersion,
      expectedLatest: stableVersion,
      observedVersion: stableVersion,
      nextVersion: '',
      latestVersion: stableVersion,
    }),
    stableVersion,
  );

  assert.throws(
    () =>
      validateRegistryAfter({
        mode: 'verify-registry',
        expectedVersion: stableVersion,
        expectedLatest: stableVersion,
        observedVersion: stableVersion,
        nextVersion: '0.1.0-next.3\n0.1.0-next.4',
        latestVersion: stableVersion,
      }),
    /nextVersion must be a single safe npm version/u,
  );
});

test('requires later OIDC publications to leave latest unchanged', () => {
  const nextVersion = '0.1.0-next.1';

  assert.equal(
    validateRegistryAfter({
      mode: 'trusted-oidc',
      expectedVersion: nextVersion,
      latestBefore: expectedVersion,
      observedVersion: nextVersion,
      nextVersion,
      latestVersion: expectedVersion,
    }),
    expectedVersion,
  );

  assert.throws(
    () =>
      validateRegistryAfter({
        mode: 'trusted-oidc',
        expectedVersion: nextVersion,
        latestBefore: expectedVersion,
        observedVersion: nextVersion,
        nextVersion,
        latestVersion: nextVersion,
      }),
    /dist-tags\.latest is 0\.1\.0-next\.1, expected 0\.1\.0-next\.0/u,
  );
});

test('makes recovery verification explicit and non-inferential', () => {
  assert.throws(
    () =>
      resolveExpectedLatest({
        mode: 'verify-registry',
        expectedVersion,
      }),
    /expectedLatest must be a non-empty string/u,
  );

  assert.equal(
    validateRegistryAfter({
      mode: 'verify-registry',
      expectedVersion,
      expectedLatest: expectedVersion,
      observedVersion: expectedVersion,
      nextVersion: expectedVersion,
      latestVersion: expectedVersion,
    }),
    expectedVersion,
  );

  assert.throws(
    () =>
      resolveExpectedLatest({
        mode: 'verify-registry',
        expectedVersion,
        expectedLatest: `${expectedVersion}\ninjected-output=true`,
      }),
    /expectedLatest must be a single safe npm version/u,
  );
});

test('rejects a missing version or a next tag pointed elsewhere', () => {
  assert.throws(
    () =>
      validateRegistryAfter({
        mode: 'verify-registry',
        expectedVersion,
        expectedLatest: expectedVersion,
        observedVersion: '',
        nextVersion: expectedVersion,
        latestVersion: expectedVersion,
      }),
    /registry version is <missing>/u,
  );

  assert.throws(
    () =>
      validateRegistryAfter({
        mode: 'verify-registry',
        expectedVersion,
        expectedLatest: expectedVersion,
        observedVersion: expectedVersion,
        nextVersion: '0.1.0-next.9',
        latestVersion: expectedVersion,
      }),
    /dist-tags\.next is 0\.1\.0-next\.9/u,
  );

  assert.throws(
    () =>
      validateRegistryAfter({
        mode: 'verify-registry',
        expectedVersion,
        expectedLatest: expectedVersion,
        observedVersion: expectedVersion,
        nextVersion: expectedVersion,
        latestVersion: '0.1.0-next.9',
      }),
    /dist-tags\.latest is 0\.1\.0-next\.9/u,
  );
});
