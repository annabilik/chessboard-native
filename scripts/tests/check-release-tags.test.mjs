import assert from 'node:assert/strict';
import test from 'node:test';

import {
  resolveExpectedLatest,
  validateRegistryAfter,
  validateRegistryBefore,
} from '../check-release-tags.mjs';

const expectedVersion = '0.1.0-next.0';

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
