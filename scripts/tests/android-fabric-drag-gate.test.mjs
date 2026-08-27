import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import {
  adbArguments,
  buildGradleArguments,
  defaultAndroidAcceptedDragTest,
  parseAdbDevices,
  scanAndroidFabricFailures,
  selectAndroidDevice,
} from '../../apps/native-harness/scripts/run-android-fabric-drag-gate.mjs';

const repositoryRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../..',
);

test('detects the Android Fabric and Reanimated drag failure signatures', () => {
  const logcat = [
    'E ReactNative: com.facebook.react.fabric.mounting.RetryableMountingLayerException: retry',
    'E ReactNative: Unable to find SurfaceMountingManager for surfaceId 21',
    'E ReactNative: Unable to find viewState for tag 703',
    'E ReactNativeJS: [Reanimated] Tried to synchronously call a non-worklet function on the UI thread.',
    'E ReactNative: Reanimated synchronouslyUpdateUIProps failed for tag 703',
  ].join('\n');

  assert.deepEqual(
    new Set(scanAndroidFabricFailures(logcat).map((item) => item.signature)),
    new Set([
      'retryable-mounting-layer-exception',
      'missing-surface-mounting-manager',
      'fabric-host-missing-or-removed',
      'reanimated-synchronous-update-failure',
    ]),
  );
  assert.equal(
    scanAndroidFabricFailures(logcat).filter(
      (item) => item.signature === 'reanimated-synchronous-update-failure',
    ).length,
    2,
  );
});

test('accepts unrelated React Native and gesture logcat output', () => {
  assert.deepEqual(
    scanAndroidFabricFailures(
      [
        'I ReactNativeJS: Running "ChessboardNativeHarness"',
        'I ReactNativeJS: accepted drag d4 to d5',
        'D GestureHandler: gesture completed',
      ].join('\n'),
    ),
    [],
  );
});

test('selects an explicit ANDROID_SERIAL and rejects ambiguous targets', () => {
  const output = [
    'List of devices attached',
    'R8YYB0LMG2K device product:a07 model:SM_A075F',
    'emulator-5554 device product:sdk_gphone64_arm64 model:sdk_gphone64_arm64',
    'offline-device offline',
    '',
  ].join('\n');

  assert.deepEqual(parseAdbDevices(output), [
    {
      details: 'product:a07 model:SM_A075F',
      serial: 'R8YYB0LMG2K',
      state: 'device',
    },
    {
      details: 'product:sdk_gphone64_arm64 model:sdk_gphone64_arm64',
      serial: 'emulator-5554',
      state: 'device',
    },
    { details: '', serial: 'offline-device', state: 'offline' },
  ]);
  assert.equal(
    selectAndroidDevice(output, 'R8YYB0LMG2K').serial,
    'R8YYB0LMG2K',
  );
  assert.throws(
    () => selectAndroidDevice(output),
    /More than one Android device is ready.*Set ANDROID_SERIAL explicitly/u,
  );
  assert.throws(
    () => selectAndroidDevice(output, 'missing'),
    /ANDROID_SERIAL=missing is not listed/u,
  );
});

test('targets the release interaction class and scopes adb to the selected device', () => {
  assert.deepEqual(adbArguments('R8YYB0LMG2K', 'logcat', '-c'), [
    '-s',
    'R8YYB0LMG2K',
    'logcat',
    '-c',
  ]);
  assert.deepEqual(buildGradleArguments(), [
    ':app:connectedReleaseAndroidTest',
    '--no-daemon',
    `-Pandroid.testInstrumentationRunnerArguments.class=${defaultAndroidAcceptedDragTest}`,
  ]);
  assert.deepEqual(buildGradleArguments('example.Test#acceptedDrag'), [
    ':app:connectedReleaseAndroidTest',
    '--no-daemon',
    '-Pandroid.testInstrumentationRunnerArguments.class=example.Test#acceptedDrag',
  ]);
  assert.throws(
    () => buildGradleArguments('example.Test#accepted drag'),
    /Invalid Android instrumentation class/u,
  );
});

test('publishes root and harness commands for the physical drag gate', async () => {
  const [rootPackage, harnessPackage] = await Promise.all([
    readFile(path.join(repositoryRoot, 'package.json'), 'utf8').then(
      JSON.parse,
    ),
    readFile(
      path.join(repositoryRoot, 'apps/native-harness/package.json'),
      'utf8',
    ).then(JSON.parse),
  ]);

  assert.equal(
    rootPackage.scripts['native:android:drag:gate'],
    'pnpm --filter @vibechess/chessboard-native-harness android:drag:gate',
  );
  assert.equal(
    harnessPackage.scripts['android:drag:gate'],
    'node scripts/run-android-fabric-drag-gate.mjs',
  );
});
