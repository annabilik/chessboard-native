import assert from 'node:assert/strict';
import test from 'node:test';

import { selectIOSSimulator } from '../../apps/native-harness/scripts/run-ios-accessibility-audit.mjs';

const devices = {
  'com.apple.CoreSimulator.SimRuntime.iOS-16-4': [
    {
      isAvailable: true,
      name: 'iPhone 14',
      state: 'Booted',
      udid: 'too-old',
    },
  ],
  'com.apple.CoreSimulator.SimRuntime.iOS-25-4': [
    {
      isAvailable: true,
      name: 'iPhone 16',
      state: 'Shutdown',
      udid: 'older',
    },
  ],
  'com.apple.CoreSimulator.SimRuntime.iOS-26-2': [
    {
      isAvailable: true,
      name: 'iPad Pro',
      state: 'Shutdown',
      udid: 'ipad',
    },
    {
      isAvailable: true,
      name: 'iPhone 17 Pro',
      state: 'Shutdown',
      udid: 'newest',
    },
  ],
};

test('selects an available iPhone from the newest runtime', () => {
  assert.equal(selectIOSSimulator(devices).udid, 'newest');
});

test('prefers an already booted iPhone and honors an explicit UDID', () => {
  const withBooted = {
    ...devices,
    'com.apple.CoreSimulator.SimRuntime.iOS-25-4': [
      {
        ...devices['com.apple.CoreSimulator.SimRuntime.iOS-25-4'][0],
        state: 'Booted',
      },
    ],
  };

  assert.equal(selectIOSSimulator(withBooted).udid, 'older');
  assert.equal(selectIOSSimulator(withBooted, 'newest').udid, 'newest');
});

test('rejects unavailable or non-iPhone explicit destinations', () => {
  assert.throws(
    () => selectIOSSimulator(devices, 'too-old'),
    /does not identify an available iPhone simulator/u,
  );
  assert.throws(
    () => selectIOSSimulator(devices, 'ipad'),
    /does not identify an available iPhone simulator/u,
  );
  assert.throws(
    () => selectIOSSimulator({}),
    /No available iPhone simulator running iOS 17 or newer/u,
  );
});
