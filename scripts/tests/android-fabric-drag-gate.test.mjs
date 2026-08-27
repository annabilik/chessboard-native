import assert from 'node:assert/strict';
import { Buffer } from 'node:buffer';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import {
  adbArguments,
  androidDragPerformanceTest,
  androidProviderUnmountDragTest,
  androidTransitionProviderUnmountDragTest,
  buildSourceEvidence,
  buildGradleArguments,
  classifyAndroidDeviceKind,
  defaultAndroidAcceptedDragTest,
  didAndroidFabricGatePass,
  didSourceEvidenceChange,
  parseAndroidDragPerformance,
  parseAdbDevices,
  resolveAndroidInstrumentationTest,
  requirePhysicalAndroidDevice,
  scanAndroidFabricFailures,
  selectAndroidDevice,
} from '../../apps/native-harness/scripts/run-android-fabric-drag-gate.mjs';

function validPerformanceSummary() {
  return {
    schemaVersion: 2,
    displayRefreshHz: 60,
    runs: Array.from({ length: 5 }, (_, index) => ({
      callbackCount: 240,
      droppedReports: 0,
      duplicateMetrics: 0,
      frameCount: 240,
      inputSpanMs: 4_000,
      invalidMetrics: 0,
      jankPercent: 0,
      measurementSpanMs: 4_200,
      outOfWindowMetrics: 0,
      p95Ms: 19.5,
      p95OverrunMs: -4,
      p99Ms: 35,
      p99OverrunMs: -2,
      run: index + 1,
      successfulMoves: 240,
      worstFrameMs: 49.5,
      worstOverrunMs: -0.25,
    })),
  };
}

test('attributes physical evidence to both the commit and normalized tracked diff', () => {
  const clean = buildSourceEvidence({
    commit: 'abc123',
    status: '',
    trackedDiff: Buffer.alloc(0),
  });
  const dirty = buildSourceEvidence({
    commit: 'abc123',
    status: ' M packages/chessboard-native/src/render/drag-overlay.tsx\n',
    trackedDiff: Buffer.from('diff --git a/file b/file\n+changed\n'),
    untrackedFiles: [
      { contents: Buffer.from('fixture A'), path: 'untracked-fixture.ts' },
    ],
  });

  assert.equal(clean.commit, 'abc123');
  assert.equal(clean.dirty, false);
  assert.equal(clean.status, '');
  assert.equal(clean.untrackedFileCount, 0);
  assert.equal(dirty.commit, 'abc123');
  assert.equal(dirty.dirty, true);
  assert.equal(
    dirty.status,
    'M packages/chessboard-native/src/render/drag-overlay.tsx',
  );
  assert.match(dirty.trackedDiffSha256, /^[a-f0-9]{64}$/u);
  assert.equal(dirty.untrackedFileCount, 1);
  assert.match(dirty.untrackedFilesSha256, /^[a-f0-9]{64}$/u);
  assert.match(dirty.worktreeSha256, /^[a-f0-9]{64}$/u);
  assert.notEqual(dirty.trackedDiffSha256, clean.trackedDiffSha256);
  assert.notEqual(dirty.worktreeSha256, clean.worktreeSha256);
  assert.equal(didSourceEvidenceChange(clean, clean), false);
  assert.equal(didSourceEvidenceChange(clean, dirty), true);
  assert.notEqual(
    dirty.worktreeSha256,
    buildSourceEvidence({
      ...dirty,
      trackedDiff: Buffer.from('diff --git a/file b/file\n+changed\n'),
      untrackedFiles: [
        { contents: Buffer.from('fixture B'), path: 'untracked-fixture.ts' },
      ],
    }).worktreeSha256,
  );
});

test('fails closed when logcat exits before instrumentation completes', () => {
  const base = {
    findings: [],
    gradleError: null,
    gradleExitCode: 0,
    logcatPrematureExit: null,
  };

  assert.equal(didAndroidFabricGatePass(base), true);
  assert.equal(
    didAndroidFabricGatePass({
      ...base,
      logcatPrematureExit: { exitCode: 1, signalCode: null },
    }),
    false,
  );
  assert.equal(
    didAndroidFabricGatePass({
      ...base,
      sourceChangedDuringRun: true,
    }),
    false,
  );
  assert.equal(
    didAndroidFabricGatePass({
      ...base,
      performanceError: 'missing performance evidence',
    }),
    false,
  );
});

test('requires a proven physical target unless emulator diagnostics are explicit', () => {
  assert.equal(classifyAndroidDeviceKind(''), 'physical');
  assert.equal(classifyAndroidDeviceKind('0'), 'physical');
  assert.equal(classifyAndroidDeviceKind('1'), 'emulator');
  assert.equal(classifyAndroidDeviceKind('unexpected'), 'unknown');
  assert.doesNotThrow(() => requirePhysicalAndroidDevice('physical'));
  assert.doesNotThrow(() =>
    requirePhysicalAndroidDevice('emulator', {
      ANDROID_FABRIC_ALLOW_EMULATOR: '1',
    }),
  );
  assert.throws(
    () => requirePhysicalAndroidDevice('emulator'),
    /require a physical device/u,
  );
  assert.throws(
    () => requirePhysicalAndroidDevice('unknown'),
    /Unable to prove/u,
  );
});

test('parses one complete Android drag performance record', () => {
  const expected = validPerformanceSummary();
  const logcat = `08-27 I ChessboardDragPerf: CHESSBOARD_DRAG_PERF ${JSON.stringify(expected)}\n`;

  assert.deepEqual(parseAndroidDragPerformance(logcat), expected);
});

test('fails closed for missing, duplicate, malformed, or invalid performance records', () => {
  const valid = validPerformanceSummary();
  const record = `I ChessboardDragPerf: CHESSBOARD_DRAG_PERF ${JSON.stringify(valid)}`;

  assert.throws(
    () => parseAndroidDragPerformance('I TestRunner: finished'),
    /Expected exactly one CHESSBOARD_DRAG_PERF record; found 0/u,
  );
  assert.throws(
    () => parseAndroidDragPerformance(`${record}\n${record}`),
    /Expected exactly one CHESSBOARD_DRAG_PERF record; found 2/u,
  );
  assert.throws(
    () =>
      parseAndroidDragPerformance(
        'I ChessboardDragPerf: CHESSBOARD_DRAG_PERF {broken',
      ),
    /malformed JSON/u,
  );

  const invalidMetrics = validPerformanceSummary();
  invalidMetrics.runs[0].invalidMetrics = 1;
  invalidMetrics.runs[0].callbackCount = 241;
  assert.throws(
    () =>
      parseAndroidDragPerformance(
        `I ChessboardDragPerf: CHESSBOARD_DRAG_PERF ${JSON.stringify(invalidMetrics)}`,
      ),
    /run 1 contained invalid frame metrics/u,
  );

  const noValidFrames = validPerformanceSummary();
  noValidFrames.runs[0].invalidMetrics = 240;
  noValidFrames.runs[0].callbackCount = 240;
  noValidFrames.runs[0].frameCount = 0;
  noValidFrames.runs[0].p95Ms = 0;
  noValidFrames.runs[0].p99Ms = 0;
  noValidFrames.runs[0].worstFrameMs = 0;
  assert.throws(
    () =>
      parseAndroidDragPerformance(
        `I ChessboardDragPerf: CHESSBOARD_DRAG_PERF ${JSON.stringify(noValidFrames)}`,
      ),
    /run 1 collected a frame count outside the cadence range/u,
  );

  const inconsistentPercentiles = validPerformanceSummary();
  inconsistentPercentiles.runs[1].p95Ms = 36;
  assert.throws(
    () =>
      parseAndroidDragPerformance(
        `I ChessboardDragPerf: CHESSBOARD_DRAG_PERF ${JSON.stringify(inconsistentPercentiles)}`,
      ),
    /run 2 has inconsistent frame percentiles/u,
  );

  const fractionalFrameCount = validPerformanceSummary();
  fractionalFrameCount.runs[4].frameCount = 239.5;
  assert.throws(
    () =>
      parseAndroidDragPerformance(
        `I ChessboardDragPerf: CHESSBOARD_DRAG_PERF ${JSON.stringify(fractionalFrameCount)}`,
      ),
    /run 5 frameCount must be a non-negative integer/u,
  );

  const nonFiniteOverrun = validPerformanceSummary();
  nonFiniteOverrun.runs[3].p95OverrunMs = null;
  assert.throws(
    () =>
      parseAndroidDragPerformance(
        `I ChessboardDragPerf: CHESSBOARD_DRAG_PERF ${JSON.stringify(nonFiniteOverrun)}`,
      ),
    /run 4 p95OverrunMs must be a finite number/u,
  );
});

test('accounts for duplicate and out-of-window callbacks without counting them as frames', () => {
  const withFilteredCallbacks = validPerformanceSummary();
  withFilteredCallbacks.runs[0].duplicateMetrics = 2;
  withFilteredCallbacks.runs[0].outOfWindowMetrics = 3;
  withFilteredCallbacks.runs[0].callbackCount = 245;

  assert.deepEqual(
    parseAndroidDragPerformance(
      `I ChessboardDragPerf: CHESSBOARD_DRAG_PERF ${JSON.stringify(withFilteredCallbacks)}`,
    ),
    withFilteredCallbacks,
  );

  withFilteredCallbacks.runs[0].callbackCount = 244;
  assert.throws(
    () =>
      parseAndroidDragPerformance(
        `I ChessboardDragPerf: CHESSBOARD_DRAG_PERF ${JSON.stringify(withFilteredCallbacks)}`,
      ),
    /run 1 has inconsistent callback accounting/u,
  );

  const fractionalDuplicate = validPerformanceSummary();
  fractionalDuplicate.runs[0].duplicateMetrics = 0.5;
  assert.throws(
    () =>
      parseAndroidDragPerformance(
        `I ChessboardDragPerf: CHESSBOARD_DRAG_PERF ${JSON.stringify(fractionalDuplicate)}`,
      ),
    /run 1 duplicateMetrics must be a non-negative integer/u,
  );

  const negativeOutOfWindow = validPerformanceSummary();
  negativeOutOfWindow.runs[0].outOfWindowMetrics = -1;
  assert.throws(
    () =>
      parseAndroidDragPerformance(
        `I ChessboardDragPerf: CHESSBOARD_DRAG_PERF ${JSON.stringify(negativeOutOfWindow)}`,
      ),
    /run 1 outOfWindowMetrics must be a non-negative integer/u,
  );
});

test('requires signed overrun ordering and strictly negative deadline margins', () => {
  const inconsistentOverruns = validPerformanceSummary();
  inconsistentOverruns.runs[1].p95OverrunMs = -1;
  inconsistentOverruns.runs[1].p99OverrunMs = -2;
  assert.throws(
    () =>
      parseAndroidDragPerformance(
        `I ChessboardDragPerf: CHESSBOARD_DRAG_PERF ${JSON.stringify(inconsistentOverruns)}`,
      ),
    /run 2 has inconsistent frame overruns/u,
  );

  const deadlineBoundary = validPerformanceSummary();
  deadlineBoundary.runs[2].worstOverrunMs = 0;
  assert.throws(
    () =>
      parseAndroidDragPerformance(
        `I ChessboardDragPerf: CHESSBOARD_DRAG_PERF ${JSON.stringify(deadlineBoundary)}`,
      ),
    /run 3 reached or exceeded a frame deadline/u,
  );

  const justWithinDeadline = validPerformanceSummary();
  justWithinDeadline.runs[2].worstOverrunMs = -Number.EPSILON;
  assert.doesNotThrow(() =>
    parseAndroidDragPerformance(
      `I ChessboardDragPerf: CHESSBOARD_DRAG_PERF ${JSON.stringify(justWithinDeadline)}`,
    ),
  );
});

test('caps unique frame cadence at 270 reports per measured run', () => {
  const cadenceMaximum = validPerformanceSummary();
  cadenceMaximum.runs[4].frameCount = 270;
  cadenceMaximum.runs[4].callbackCount = 270;
  assert.doesNotThrow(() =>
    parseAndroidDragPerformance(
      `I ChessboardDragPerf: CHESSBOARD_DRAG_PERF ${JSON.stringify(cadenceMaximum)}`,
    ),
  );

  cadenceMaximum.runs[4].frameCount = 271;
  cadenceMaximum.runs[4].callbackCount = 271;
  assert.throws(
    () =>
      parseAndroidDragPerformance(
        `I ChessboardDragPerf: CHESSBOARD_DRAG_PERF ${JSON.stringify(cadenceMaximum)}`,
      ),
    /run 5 collected a frame count outside the cadence range/u,
  );

  const measurementMaximum = validPerformanceSummary();
  measurementMaximum.runs[4].measurementSpanMs = 4_300;
  assert.doesNotThrow(() =>
    parseAndroidDragPerformance(
      `I ChessboardDragPerf: CHESSBOARD_DRAG_PERF ${JSON.stringify(measurementMaximum)}`,
    ),
  );

  measurementMaximum.runs[4].measurementSpanMs = 4_301;
  assert.throws(
    () =>
      parseAndroidDragPerformance(
        `I ChessboardDragPerf: CHESSBOARD_DRAG_PERF ${JSON.stringify(measurementMaximum)}`,
      ),
    /run 5 measurement span is out of range/u,
  );
});

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

test('does not treat a camel-cased lifecycle test name as a removed Fabric host', () => {
  const lifecycleTest =
    'unmountingProviderDuringActiveDragDoesNotUpdateRemovedFabricHosts(com.vibechess.chessboardnativeharness.ChessboardProviderUnmountDragTest)';

  assert.deepEqual(
    scanAndroidFabricFailures(
      [
        `08-27 17:37:47.674 21924 21939 I TestRunner: started: ${lifecycleTest}`,
        `08-27 17:37:56.265 21924 21939 I TestRunner: finished: ${lifecycleTest}`,
      ].join('\n'),
    ),
    [],
  );

  assert.deepEqual(
    scanAndroidFabricFailures(
      [
        'E ReactNative: Fabric transaction tried to update a removed host tag 703',
        'E ReactNative: native host was unmounted before the Fabric transaction completed',
      ].join('\n'),
    ).map((finding) => finding.signature),
    ['fabric-host-missing-or-removed', 'fabric-host-missing-or-removed'],
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

test('keeps accepted drag as the default and allows the provider-unmount lifecycle target', () => {
  assert.equal(
    resolveAndroidInstrumentationTest({}),
    defaultAndroidAcceptedDragTest,
  );
  assert.equal(
    resolveAndroidInstrumentationTest({ ANDROID_TEST_CLASS: '   ' }),
    defaultAndroidAcceptedDragTest,
  );
  assert.equal(
    resolveAndroidInstrumentationTest({
      ANDROID_TEST_CLASS: ` ${androidProviderUnmountDragTest} `,
    }),
    androidProviderUnmountDragTest,
  );
  assert.deepEqual(buildGradleArguments(androidProviderUnmountDragTest), [
    ':app:connectedReleaseAndroidTest',
    '--no-daemon',
    `-Pandroid.testInstrumentationRunnerArguments.class=${androidProviderUnmountDragTest}`,
  ]);
});

test('allows the transition/provider overlap lifecycle target', () => {
  assert.equal(
    resolveAndroidInstrumentationTest({
      ANDROID_TEST_CLASS: ` ${androidTransitionProviderUnmountDragTest} `,
    }),
    androidTransitionProviderUnmountDragTest,
  );
  assert.deepEqual(
    buildGradleArguments(androidTransitionProviderUnmountDragTest),
    [
      ':app:connectedReleaseAndroidTest',
      '--no-daemon',
      `-Pandroid.testInstrumentationRunnerArguments.class=${androidTransitionProviderUnmountDragTest}`,
    ],
  );
});

test('allows the sustained drag performance target', () => {
  assert.equal(
    resolveAndroidInstrumentationTest({
      ANDROID_TEST_CLASS: ` ${androidDragPerformanceTest} `,
    }),
    androidDragPerformanceTest,
  );
  assert.deepEqual(buildGradleArguments(androidDragPerformanceTest), [
    ':app:connectedReleaseAndroidTest',
    '--no-daemon',
    `-Pandroid.testInstrumentationRunnerArguments.class=${androidDragPerformanceTest}`,
  ]);
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
    rootPackage.scripts['native:android:drag:lifecycle:gate'],
    'pnpm --filter @vibechess/chessboard-native-harness android:drag:lifecycle:gate',
  );
  assert.equal(
    harnessPackage.scripts['android:drag:gate'],
    'node scripts/run-android-fabric-drag-gate.mjs',
  );
  assert.equal(
    harnessPackage.scripts['android:drag:lifecycle:gate'],
    `ANDROID_TEST_CLASS=${androidProviderUnmountDragTest} ANDROID_FABRIC_DRAG_EVIDENCE_DIR=android/app/build/reports/fabric-drag-provider-unmount-gate node scripts/run-android-fabric-drag-gate.mjs`,
  );
});

test('publishes a separate transition/provider overlap gate and evidence directory', async () => {
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
    rootPackage.scripts['native:android:drag:transition-lifecycle:gate'],
    'pnpm --filter @vibechess/chessboard-native-harness android:drag:transition-lifecycle:gate',
  );
  assert.equal(
    harnessPackage.scripts['android:drag:transition-lifecycle:gate'],
    `ANDROID_TEST_CLASS=${androidTransitionProviderUnmountDragTest} ANDROID_FABRIC_DRAG_EVIDENCE_DIR=android/app/build/reports/fabric-drag-transition-provider-unmount-gate node scripts/run-android-fabric-drag-gate.mjs`,
  );
});

test('publishes a separate sustained drag performance gate and evidence directory', async () => {
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
    rootPackage.scripts['native:android:drag:performance:gate'],
    'pnpm --filter @vibechess/chessboard-native-harness android:drag:performance:gate',
  );
  assert.equal(
    harnessPackage.scripts['android:drag:performance:gate'],
    `ANDROID_TEST_CLASS=${androidDragPerformanceTest} ANDROID_FABRIC_DRAG_EVIDENCE_DIR=android/app/build/reports/fabric-drag-performance-gate node scripts/run-android-fabric-drag-gate.mjs`,
  );
});
