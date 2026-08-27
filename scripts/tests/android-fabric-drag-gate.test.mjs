import assert from 'node:assert/strict';
import { Buffer } from 'node:buffer';
import { createHash } from 'node:crypto';
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
  const displayRefreshHz = 60;
  return {
    schemaVersion: 3,
    displayRefreshHz,
    expectedFrameDurationMs: 1_000 / displayRefreshHz,
    jankHeuristicMultiplier: 2,
    runs: Array.from({ length: 5 }, (_, index) => ({
      callbackCount: 480,
      deadlinePlausible: false,
      deliveryPercent: 100,
      droppedReports: 0,
      duplicateMetrics: 240,
      duplicatePayloadMismatchCount: 0,
      expectedVsyncSlots: 240,
      frameCount: 240,
      heuristicJankCount: 0,
      heuristicJankPercent: 0,
      implausibleDeadlineCount: 240,
      inputSpanMs: 4_000,
      intendedVsyncSpanMs: 3_983.33,
      invalidMetrics: 0,
      leadingCoverageGapMs: 8,
      maximumDeadlineMs: 1_000,
      measurementSpanMs: 4_000,
      minimumDeadlineMs: 700,
      missedVsyncSlots: 0,
      outOfWindowMetrics: 0,
      p50DeadlineMs: 800,
      p95DeadlineMs: 900,
      p95TotalDurationMs: 19.5,
      p95UiDurationMs: 15,
      p95VsyncGapMs: 16.67,
      p99TotalDurationMs: 35,
      p99UiDurationMs: 20,
      p99VsyncGapMs: 33.33,
      run: index + 1,
      successfulMoves: 240,
      trailingCoverageGapMs: 8.67,
      worstCoverageGapMs: 33.33,
      worstTotalDurationMs: 49.5,
      worstUiDurationMs: 30,
      worstVsyncGapMs: 33.33,
    })),
  };
}

function chunkedPerformanceLog(summary, chunkSize = 256) {
  const payload = Buffer.from(JSON.stringify(summary), 'utf8');
  const checksum = createHash('sha256').update(payload).digest('hex');
  const recordId = checksum.slice(0, 16);
  const encoded = payload.toString('base64');
  const chunks = [];
  for (let offset = 0; offset < encoded.length; offset += chunkSize) {
    chunks.push(encoded.slice(offset, offset + chunkSize));
  }
  return chunks.map(
    (data, index) =>
      `08-27 I ChessboardDragPerf: CHESSBOARD_DRAG_PERF_CHUNK v=1 id=${recordId} sha256=${checksum} part=${String(index + 1)}/${String(chunks.length)} bytes=${String(payload.length)} data=${data}`,
  );
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

test('reassembles one complete checksummed Android drag performance record', () => {
  const expected = validPerformanceSummary();
  const chunks = chunkedPerformanceLog(expected);

  assert.ok(chunks.length > 1);
  assert.deepEqual(parseAndroidDragPerformance(chunks.join('\n')), expected);
});

test('fails closed for truncated, missing, duplicate, or out-of-order performance chunks', () => {
  const chunks = chunkedPerformanceLog(validPerformanceSummary());
  const truncated = [...chunks];
  truncated[truncated.length - 1] = truncated.at(-1).slice(0, -1);

  assert.throws(
    () => parseAndroidDragPerformance(truncated.join('\n')),
    /Base64|byte length|checksum/u,
  );
  assert.throws(
    () => parseAndroidDragPerformance(chunks.slice(0, -1).join('\n')),
    /chunk count is incomplete or duplicated/u,
  );
  assert.throws(
    () =>
      parseAndroidDragPerformance(
        [...chunks.slice(0, 1), chunks[0], ...chunks.slice(1)].join('\n'),
      ),
    /chunk count is incomplete or duplicated/u,
  );
  assert.throws(
    () =>
      parseAndroidDragPerformance(
        [chunks[1], chunks[0], ...chunks.slice(2)].join('\n'),
      ),
    /chunks are out of order/u,
  );
});

test('fails closed for inconsistent performance chunk identity, metadata, or checksum', () => {
  const chunks = chunkedPerformanceLog(validPerformanceSummary());
  const inconsistentId = [...chunks];
  inconsistentId[1] = inconsistentId[1].replace(
    / id=[a-f0-9]{16} /u,
    ' id=0000000000000000 ',
  );
  const inconsistentCount = [...chunks];
  inconsistentCount[1] = inconsistentCount[1].replace(
    / part=(\d+)\/(\d+) /u,
    (_match, part, count) => ` part=${part}/${String(Number(count) + 1)} `,
  );
  const badChecksum = [...chunks];
  badChecksum[0] = badChecksum[0].replace(
    / data=([A-Za-z0-9+/])/u,
    (_match, character) => ` data=${character === 'A' ? 'B' : 'A'}`,
  );

  assert.throws(
    () => parseAndroidDragPerformance(inconsistentId.join('\n')),
    /same logical record/u,
  );
  assert.throws(
    () => parseAndroidDragPerformance(inconsistentCount.join('\n')),
    /same logical record/u,
  );
  assert.throws(
    () => parseAndroidDragPerformance(badChecksum.join('\n')),
    /checksum mismatch/u,
  );
  assert.throws(
    () =>
      parseAndroidDragPerformance(
        `${chunks.join('\n')}\nI ChessboardDragPerf: CHESSBOARD_DRAG_PERF ${JSON.stringify(validPerformanceSummary())}`,
      ),
    /both direct and chunked records/u,
  );
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

  const oldSchema = validPerformanceSummary();
  oldSchema.schemaVersion = 2;
  assert.throws(
    () =>
      parseAndroidDragPerformance(
        `I ChessboardDragPerf: CHESSBOARD_DRAG_PERF ${JSON.stringify(oldSchema)}`,
      ),
    /schemaVersion must equal 3/u,
  );

  const wrongFrameDuration = validPerformanceSummary();
  wrongFrameDuration.expectedFrameDurationMs = 17;
  assert.throws(
    () =>
      parseAndroidDragPerformance(
        `I ChessboardDragPerf: CHESSBOARD_DRAG_PERF ${JSON.stringify(wrongFrameDuration)}`,
      ),
    /expectedFrameDurationMs is inconsistent/u,
  );

  const wrongJankMultiplier = validPerformanceSummary();
  wrongJankMultiplier.jankHeuristicMultiplier = 1;
  assert.throws(
    () =>
      parseAndroidDragPerformance(
        `I ChessboardDragPerf: CHESSBOARD_DRAG_PERF ${JSON.stringify(wrongJankMultiplier)}`,
      ),
    /jankHeuristicMultiplier must equal 2/u,
  );

  const invalidMetrics = validPerformanceSummary();
  invalidMetrics.runs[0].invalidMetrics = 1;
  invalidMetrics.runs[0].callbackCount = 481;
  assert.throws(
    () =>
      parseAndroidDragPerformance(
        `I ChessboardDragPerf: CHESSBOARD_DRAG_PERF ${JSON.stringify(invalidMetrics)}`,
      ),
    /run 1 contained invalid frame metrics/u,
  );

  const noValidFrames = validPerformanceSummary();
  noValidFrames.runs[0].invalidMetrics = 240;
  noValidFrames.runs[0].callbackCount = 480;
  noValidFrames.runs[0].frameCount = 0;
  assert.throws(
    () =>
      parseAndroidDragPerformance(
        `I ChessboardDragPerf: CHESSBOARD_DRAG_PERF ${JSON.stringify(noValidFrames)}`,
      ),
    /run 1 collected a frame count outside the cadence range/u,
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

  const nonFiniteTotal = validPerformanceSummary();
  nonFiniteTotal.runs[3].p95TotalDurationMs = null;
  assert.throws(
    () =>
      parseAndroidDragPerformance(
        `I ChessboardDragPerf: CHESSBOARD_DRAG_PERF ${JSON.stringify(nonFiniteTotal)}`,
      ),
    /run 4 p95TotalDurationMs must be a finite number/u,
  );
});

test('accounts for duplicate and out-of-window callbacks and rejects mismatched duplicate payloads', () => {
  const withFilteredCallbacks = validPerformanceSummary();
  withFilteredCallbacks.runs[0].outOfWindowMetrics = 3;
  withFilteredCallbacks.runs[0].callbackCount = 483;

  assert.deepEqual(
    parseAndroidDragPerformance(
      `I ChessboardDragPerf: CHESSBOARD_DRAG_PERF ${JSON.stringify(withFilteredCallbacks)}`,
    ),
    withFilteredCallbacks,
  );

  withFilteredCallbacks.runs[0].callbackCount = 482;
  assert.throws(
    () =>
      parseAndroidDragPerformance(
        `I ChessboardDragPerf: CHESSBOARD_DRAG_PERF ${JSON.stringify(withFilteredCallbacks)}`,
      ),
    /run 1 has inconsistent callback accounting/u,
  );

  const mismatchedDuplicate = validPerformanceSummary();
  mismatchedDuplicate.runs[0].duplicatePayloadMismatchCount = 1;
  assert.throws(
    () =>
      parseAndroidDragPerformance(
        `I ChessboardDragPerf: CHESSBOARD_DRAG_PERF ${JSON.stringify(mismatchedDuplicate)}`,
      ),
    /run 1 contained mismatched duplicate payloads/u,
  );

  const impossibleMismatchCount = validPerformanceSummary();
  impossibleMismatchCount.runs[0].duplicatePayloadMismatchCount = 241;
  assert.throws(
    () =>
      parseAndroidDragPerformance(
        `I ChessboardDragPerf: CHESSBOARD_DRAG_PERF ${JSON.stringify(impossibleMismatchCount)}`,
      ),
    /more duplicate payload mismatches than duplicates/u,
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

test('requires internally consistent intended-vsync cadence and at least 95% delivery', () => {
  const exactDeliveryBoundary = validPerformanceSummary();
  exactDeliveryBoundary.runs[0].callbackCount = 468;
  exactDeliveryBoundary.runs[0].deliveryPercent = 95;
  exactDeliveryBoundary.runs[0].expectedVsyncSlots = 240;
  exactDeliveryBoundary.runs[0].frameCount = 228;
  exactDeliveryBoundary.runs[0].implausibleDeadlineCount = 228;
  exactDeliveryBoundary.runs[0].missedVsyncSlots = 12;
  assert.doesNotThrow(() =>
    parseAndroidDragPerformance(
      `I ChessboardDragPerf: CHESSBOARD_DRAG_PERF ${JSON.stringify(exactDeliveryBoundary)}`,
    ),
  );

  const inconsistentSlots = validPerformanceSummary();
  inconsistentSlots.runs[1].missedVsyncSlots = 9;
  assert.throws(
    () =>
      parseAndroidDragPerformance(
        `I ChessboardDragPerf: CHESSBOARD_DRAG_PERF ${JSON.stringify(inconsistentSlots)}`,
      ),
    /run 2 has inconsistent vsync slot accounting/u,
  );

  const inconsistentDelivery = validPerformanceSummary();
  inconsistentDelivery.runs[2].deliveryPercent = 95.9;
  assert.throws(
    () =>
      parseAndroidDragPerformance(
        `I ChessboardDragPerf: CHESSBOARD_DRAG_PERF ${JSON.stringify(inconsistentDelivery)}`,
      ),
    /run 3 has an inconsistent delivery percentage/u,
  );

  const underDeliveryBudget = validPerformanceSummary();
  underDeliveryBudget.runs[2].callbackCount = 468;
  underDeliveryBudget.runs[2].expectedVsyncSlots = 241;
  underDeliveryBudget.runs[2].frameCount = 228;
  underDeliveryBudget.runs[2].implausibleDeadlineCount = 228;
  underDeliveryBudget.runs[2].missedVsyncSlots = 13;
  underDeliveryBudget.runs[2].deliveryPercent = (228 * 100) / 241;
  assert.throws(
    () =>
      parseAndroidDragPerformance(
        `I ChessboardDragPerf: CHESSBOARD_DRAG_PERF ${JSON.stringify(underDeliveryBudget)}`,
      ),
    /run 3 delivered less than 95%/u,
  );

  const inconsistentGaps = validPerformanceSummary();
  inconsistentGaps.runs[3].p95VsyncGapMs = 34;
  assert.throws(
    () =>
      parseAndroidDragPerformance(
        `I ChessboardDragPerf: CHESSBOARD_DRAG_PERF ${JSON.stringify(inconsistentGaps)}`,
      ),
    /run 4 has inconsistent vsync gap percentiles/u,
  );

  const gapBoundary = validPerformanceSummary();
  gapBoundary.runs[4].leadingCoverageGapMs = 49.999;
  gapBoundary.runs[4].intendedVsyncSpanMs = 3_941.331;
  gapBoundary.runs[4].worstCoverageGapMs = 49.999;
  assert.doesNotThrow(() =>
    parseAndroidDragPerformance(
      `I ChessboardDragPerf: CHESSBOARD_DRAG_PERF ${JSON.stringify(gapBoundary)}`,
    ),
  );

  gapBoundary.runs[4].leadingCoverageGapMs = 50;
  gapBoundary.runs[4].intendedVsyncSpanMs = 3_941.33;
  gapBoundary.runs[4].worstCoverageGapMs = 50;
  assert.throws(
    () =>
      parseAndroidDragPerformance(
        `I ChessboardDragPerf: CHESSBOARD_DRAG_PERF ${JSON.stringify(gapBoundary)}`,
      ),
    /run 5 contained a 50 ms measurement-coverage gap/u,
  );

  const inconsistentWorstCoverage = validPerformanceSummary();
  inconsistentWorstCoverage.runs[0].worstCoverageGapMs = 40;
  assert.throws(
    () =>
      parseAndroidDragPerformance(
        `I ChessboardDragPerf: CHESSBOARD_DRAG_PERF ${JSON.stringify(inconsistentWorstCoverage)}`,
      ),
    /run 1 has an inconsistent worst coverage gap/u,
  );

  const outOfWindowBoundary = validPerformanceSummary();
  outOfWindowBoundary.runs[0].leadingCoverageGapMs = 4_001.01;
  assert.throws(
    () =>
      parseAndroidDragPerformance(
        `I ChessboardDragPerf: CHESSBOARD_DRAG_PERF ${JSON.stringify(outOfWindowBoundary)}`,
      ),
    /run 1 has a coverage gap outside its measurement window/u,
  );

  const hiddenTrailingFreeze = validPerformanceSummary();
  Object.assign(hiddenTrailingFreeze.runs[0], {
    callbackCount: 468,
    deliveryPercent: 95,
    expectedVsyncSlots: 240,
    frameCount: 228,
    implausibleDeadlineCount: 228,
    intendedVsyncSpanMs: 3_783.33,
    leadingCoverageGapMs: 0,
    missedVsyncSlots: 12,
    p95VsyncGapMs: 16.67,
    p99VsyncGapMs: 16.67,
    trailingCoverageGapMs: 216.67,
    worstCoverageGapMs: 216.67,
    worstVsyncGapMs: 16.67,
  });
  assert.throws(
    () =>
      parseAndroidDragPerformance(
        `I ChessboardDragPerf: CHESSBOARD_DRAG_PERF ${JSON.stringify(hiddenTrailingFreeze)}`,
      ),
    /run 1 contained a 50 ms measurement-coverage gap/u,
  );
});

test('caps unique frame cadence and measurement duration at their inclusive maxima', () => {
  const cadenceMaximum = validPerformanceSummary();
  cadenceMaximum.runs[4].frameCount = 270;
  cadenceMaximum.runs[4].callbackCount = 510;
  cadenceMaximum.runs[4].expectedVsyncSlots = 270;
  cadenceMaximum.runs[4].deliveryPercent = 100;
  assert.doesNotThrow(() =>
    parseAndroidDragPerformance(
      `I ChessboardDragPerf: CHESSBOARD_DRAG_PERF ${JSON.stringify(cadenceMaximum)}`,
    ),
  );

  cadenceMaximum.runs[4].frameCount = 271;
  cadenceMaximum.runs[4].callbackCount = 511;
  cadenceMaximum.runs[4].expectedVsyncSlots = 271;
  cadenceMaximum.runs[4].deliveryPercent = 100;
  assert.throws(
    () =>
      parseAndroidDragPerformance(
        `I ChessboardDragPerf: CHESSBOARD_DRAG_PERF ${JSON.stringify(cadenceMaximum)}`,
      ),
    /run 5 collected a frame count outside the cadence range/u,
  );

  const measurementMaximum = validPerformanceSummary();
  measurementMaximum.runs[4].deliveryPercent = (240 * 100) / 246;
  measurementMaximum.runs[4].expectedVsyncSlots = 246;
  measurementMaximum.runs[4].intendedVsyncSpanMs = 4_066.66;
  measurementMaximum.runs[4].leadingCoverageGapMs = 16.67;
  measurementMaximum.runs[4].measurementSpanMs = 4_100;
  measurementMaximum.runs[4].missedVsyncSlots = 6;
  measurementMaximum.runs[4].trailingCoverageGapMs = 16.67;
  assert.doesNotThrow(() =>
    parseAndroidDragPerformance(
      `I ChessboardDragPerf: CHESSBOARD_DRAG_PERF ${JSON.stringify(measurementMaximum)}`,
    ),
  );

  measurementMaximum.runs[4].measurementSpanMs = 4_101;
  assert.throws(
    () =>
      parseAndroidDragPerformance(
        `I ChessboardDragPerf: CHESSBOARD_DRAG_PERF ${JSON.stringify(measurementMaximum)}`,
      ),
    /run 5 measurement span is out of range/u,
  );
});

test('uses the AndroidX API-24 UI-duration heuristic at twice the refresh period', () => {
  const inconsistentUiPercentiles = validPerformanceSummary();
  inconsistentUiPercentiles.runs[0].p95UiDurationMs = 21;
  assert.throws(
    () =>
      parseAndroidDragPerformance(
        `I ChessboardDragPerf: CHESSBOARD_DRAG_PERF ${JSON.stringify(inconsistentUiPercentiles)}`,
      ),
    /run 1 has inconsistent UI-duration percentiles/u,
  );

  const reportedJank = validPerformanceSummary();
  reportedJank.runs[1].heuristicJankCount = 1;
  reportedJank.runs[1].heuristicJankPercent = 100 / 240;
  assert.throws(
    () =>
      parseAndroidDragPerformance(
        `I ChessboardDragPerf: CHESSBOARD_DRAG_PERF ${JSON.stringify(reportedJank)}`,
      ),
    /run 2 reported heuristic UI jank/u,
  );

  const hiddenJank = validPerformanceSummary();
  hiddenJank.runs[2].worstUiDurationMs = 34;
  assert.throws(
    () =>
      parseAndroidDragPerformance(
        `I ChessboardDragPerf: CHESSBOARD_DRAG_PERF ${JSON.stringify(hiddenJank)}`,
      ),
    /run 3 has UI duration inconsistent with zero heuristic jank/u,
  );
});

test('keeps raw TOTAL percentiles diagnostic while enforcing only a sub-50ms worst frame', () => {
  const inconsistentTotals = validPerformanceSummary();
  inconsistentTotals.runs[0].p95TotalDurationMs = 36;
  assert.throws(
    () =>
      parseAndroidDragPerformance(
        `I ChessboardDragPerf: CHESSBOARD_DRAG_PERF ${JSON.stringify(inconsistentTotals)}`,
      ),
    /run 1 has inconsistent total-duration percentiles/u,
  );

  const boundary = validPerformanceSummary();
  boundary.runs[1].worstTotalDurationMs = 50;
  assert.throws(
    () =>
      parseAndroidDragPerformance(
        `I ChessboardDragPerf: CHESSBOARD_DRAG_PERF ${JSON.stringify(boundary)}`,
      ),
    /run 2 contained a 50 ms total-duration frame/u,
  );
});

test('validates deadline diagnostics without using deadline plausibility as a gate', () => {
  const corruptButDiagnosticOnly = validPerformanceSummary();
  assert.doesNotThrow(() =>
    parseAndroidDragPerformance(
      `I ChessboardDragPerf: CHESSBOARD_DRAG_PERF ${JSON.stringify(corruptButDiagnosticOnly)}`,
    ),
  );

  const plausible = validPerformanceSummary();
  Object.assign(plausible.runs[0], {
    deadlinePlausible: true,
    implausibleDeadlineCount: 0,
    maximumDeadlineMs: 16.67,
    minimumDeadlineMs: 16.66,
    p50DeadlineMs: 16.67,
    p95DeadlineMs: 16.67,
  });
  assert.doesNotThrow(() =>
    parseAndroidDragPerformance(
      `I ChessboardDragPerf: CHESSBOARD_DRAG_PERF ${JSON.stringify(plausible)}`,
    ),
  );

  plausible.runs[0].deadlinePlausible = false;
  assert.throws(
    () =>
      parseAndroidDragPerformance(
        `I ChessboardDragPerf: CHESSBOARD_DRAG_PERF ${JSON.stringify(plausible)}`,
      ),
    /run 1 has inconsistent deadline plausibility diagnostics/u,
  );

  const falsePlausibility = validPerformanceSummary();
  falsePlausibility.runs[0].deadlinePlausible = true;
  falsePlausibility.runs[0].implausibleDeadlineCount = 0;
  assert.throws(
    () =>
      parseAndroidDragPerformance(
        `I ChessboardDragPerf: CHESSBOARD_DRAG_PERF ${JSON.stringify(falsePlausibility)}`,
      ),
    /deadline extrema inconsistent with its plausibility diagnostic/u,
  );

  const inconsistentDeadlineOrder = validPerformanceSummary();
  inconsistentDeadlineOrder.runs[1].p50DeadlineMs = 1_001;
  assert.throws(
    () =>
      parseAndroidDragPerformance(
        `I ChessboardDragPerf: CHESSBOARD_DRAG_PERF ${JSON.stringify(inconsistentDeadlineOrder)}`,
      ),
    /run 2 has inconsistent deadline diagnostics/u,
  );

  const nonFiniteDeadline = validPerformanceSummary();
  nonFiniteDeadline.runs[2].minimumDeadlineMs = null;
  assert.throws(
    () =>
      parseAndroidDragPerformance(
        `I ChessboardDragPerf: CHESSBOARD_DRAG_PERF ${JSON.stringify(nonFiniteDeadline)}`,
      ),
    /run 3 minimumDeadlineMs must be a finite number/u,
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
