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
  androidPlainFenTransitionInterrupt200Test,
  androidPlainFenTransitionInterruptTest,
  androidProviderUnmountDragTest,
  androidTerminalDragHandoffTest,
  androidTerminalDragHandoffTestClass,
  androidTransitionProviderUnmountDragTest,
  androidTransitionProviderWholeUnmountTest,
  buildAndroidDragPerformanceEvidence,
  buildAndroidTerminalDragHandoffEvidence,
  buildAndroidTerminalDragHandoffGateEvidence,
  buildSourceEvidence,
  buildGradleArguments,
  classifyAndroidDeviceKind,
  defaultAndroidAcceptedDragTest,
  didAndroidFabricGatePass,
  didSourceEvidenceChange,
  evaluateAndroidDragPerformance,
  parseAndroidDragPerformance,
  parseAndroidTerminalDragHandoff,
  parseAdbDevices,
  resolveAndroidInstrumentationTest,
  requirePhysicalAndroidDevice,
  scanAndroidFabricFailures,
  selectAndroidDevice,
  targetsAndroidTerminalDragHandoffTest,
} from '../../apps/native-harness/scripts/run-android-fabric-drag-gate.mjs';

function validTerminalHandoffSummary() {
  return {
    acceptedCount: 2,
    acceptedFinalCanonicalTargetCount: 2,
    acceptedOffTargetFrames: 0,
    acceptedSourceSnapbackFrames: 0,
    activeOverlayFrames: 30,
    blockedJsQueueReleaseConfirmed: true,
    blockedTerminalFrames: 8,
    blockedTerminalOverlayFrames: 8,
    blockedTerminalSpanMs: 116.67,
    cancelCount: 1,
    canonicalFrames: 20,
    canonicalTransitionFrames: 12,
    endPid: 4321,
    finalActiveOverlayHosts: 0,
    finalRetiringOverlayHosts: 0,
    gestureCount: 5,
    invalidFrameWitnesses: [],
    invalidPrimaryCompositionFrames: 0,
    offBoardCount: 1,
    overOpacityFrames: 0,
    pendingCanonicalCrossfadeFrames: 4,
    pendingSourceGhostFrames: 4,
    pendingTargetFrames: 6,
    postTerminalFrames: 50,
    processStable: true,
    recoveryFinalCanonicalSourceCount: 3,
    recoveryPostTerminalFrames: 20,
    recoverySourceLocationFrames: 15,
    recoveryTerminalLocationFrames: 5,
    recoveryUnexpectedLocationFrames: 0,
    rejectedCount: 1,
    reusePassed: true,
    schemaVersion: 4,
    singlePrimaryFrames: 46,
    sourceVisibleWithOverlayFrames: 0,
    spatialDuplicateFrames: 0,
    startPid: 4321,
    terminalOutcomeWitnessCount: 5,
    terminalOverlayFrames: 10,
    underOpacityFrames: 0,
    zeroPrimaryFrames: 0,
  };
}

function terminalHandoffLog(summary) {
  return `08-30 I ChessboardDragHandoff: CHESSBOARD_DRAG_HANDOFF ${JSON.stringify(summary)}\n`;
}

function invalidFrameWitness() {
  return {
    activeOverlayHosts: 0,
    actors: [
      {
        alpha: 1,
        centerX: 320.5,
        centerY: 970.5,
        role: 'pending-target',
      },
      {
        alpha: 0.45,
        centerX: 320.5,
        centerY: 970.5,
        role: 'canonical-transition',
      },
    ],
    frameAfterArmMs: 142.5,
    frameAfterInjectionMs: 130,
    frameTimeNs: 123_456_789,
    jsQueueBlocked: false,
    opacityMass: 1.45,
    outcome: 'accepted',
    postInjection: true,
    retiringOverlayHosts: 0,
    sessionIndex: 0,
  };
}

function validPerformanceSummary() {
  const displayRefreshHz = 60;
  return {
    schemaVersion: 4,
    displayRefreshHz,
    expectedFrameDurationMs: 1_000 / displayRefreshHz,
    jankHeuristicMultiplier: 2,
    runs: Array.from({ length: 5 }, (_, index) => ({
      activationLatencyMs: 20,
      callbackCount: 482,
      deadlinePlausible: false,
      deliveryPercent: 100,
      droppedReports: 0,
      duplicateMetrics: 241,
      duplicatePayloadMismatchCount: 0,
      expectedVsyncSlots: 241,
      finalMoveLatencyMs: 20,
      frameCount: 241,
      heuristicJankCount: 0,
      heuristicJankPercent: 0,
      implausibleDeadlineCount: 241,
      inputSpanMs: 4_000,
      intendedVsyncSpanMs: 4_000,
      invalidMetrics: 0,
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
      successfulMoves: 301,
      worstSustainedVsyncGapMs: 33.33,
      worstTotalDurationMs: 49.5,
      worstUiDurationMs: 30,
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
      handoffError: 'missing terminal handoff evidence',
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

test('parses one complete terminal drag handoff record', () => {
  const expected = validTerminalHandoffSummary();
  const logcat = terminalHandoffLog(expected);

  assert.deepEqual(parseAndroidTerminalDragHandoff(logcat), expected);
  assert.deepEqual(buildAndroidTerminalDragHandoffEvidence(logcat), {
    error: null,
    required: true,
    summary: expected,
  });
});

test('fails closed for terminal-class zero-test and method-filter mismatch runs', () => {
  const expected = validTerminalHandoffSummary();
  assert.deepEqual(
    buildAndroidTerminalDragHandoffGateEvidence(
      androidTerminalDragHandoffTest,
      terminalHandoffLog(expected),
    ),
    {
      error: null,
      required: true,
      summary: expected,
    },
  );
  assert.match(
    buildAndroidTerminalDragHandoffGateEvidence(
      androidTerminalDragHandoffTest,
      '',
    ).error,
    /found 0/u,
  );
  for (const testClass of [
    androidTerminalDragHandoffTestClass,
    `${androidTerminalDragHandoffTestClass}#`,
    `${androidTerminalDragHandoffTestClass}#missingMethod`,
  ]) {
    assert.equal(targetsAndroidTerminalDragHandoffTest(testClass), true);
    const zeroTestEvidence = buildAndroidTerminalDragHandoffGateEvidence(
      testClass,
      '',
    );
    assert.equal(zeroTestEvidence.required, true);
    assert.equal(zeroTestEvidence.summary, null);
    assert.match(zeroTestEvidence.error, /found 0/u);
  }
  assert.throws(
    () => buildGradleArguments(`${androidTerminalDragHandoffTestClass}#`),
    /Invalid Android instrumentation class/u,
  );
  assert.equal(
    targetsAndroidTerminalDragHandoffTest(defaultAndroidAcceptedDragTest),
    false,
  );
  assert.deepEqual(
    buildAndroidTerminalDragHandoffGateEvidence(
      defaultAndroidAcceptedDragTest,
      '',
    ),
    {
      error: null,
      required: false,
      summary: null,
    },
  );
});

test('fails closed for missing, duplicate, malformed, or schema-drifted handoff records', () => {
  const validLog = terminalHandoffLog(validTerminalHandoffSummary());
  assert.throws(
    () => parseAndroidTerminalDragHandoff(''),
    /Expected exactly one CHESSBOARD_DRAG_HANDOFF record; found 0/u,
  );
  assert.throws(
    () => parseAndroidTerminalDragHandoff(`${validLog}${validLog}`),
    /Expected exactly one CHESSBOARD_DRAG_HANDOFF record; found 2/u,
  );
  assert.throws(
    () =>
      parseAndroidTerminalDragHandoff(
        'I ChessboardDragHandoff: CHESSBOARD_DRAG_HANDOFF {bad json}\n',
      ),
    /malformed JSON/u,
  );

  const missingField = validTerminalHandoffSummary();
  delete missingField.reusePassed;
  assert.throws(
    () => parseAndroidTerminalDragHandoff(terminalHandoffLog(missingField)),
    /exactly the schemaVersion 4 fields/u,
  );
  assert.throws(
    () =>
      parseAndroidTerminalDragHandoff(
        terminalHandoffLog({
          ...validTerminalHandoffSummary(),
          unexpected: 1,
        }),
      ),
    /exactly the schemaVersion 4 fields/u,
  );
});

test('validates bounded invalid-frame witnesses before enforcing continuity', () => {
  const witness = invalidFrameWitness();
  assert.throws(
    () =>
      parseAndroidTerminalDragHandoff(
        terminalHandoffLog({
          ...validTerminalHandoffSummary(),
          invalidFrameWitnesses: [witness],
          invalidPrimaryCompositionFrames: 1,
          overOpacityFrames: 1,
        }),
      ),
    /invalidPrimaryCompositionFrames must equal 0/u,
  );
  assert.throws(
    () =>
      parseAndroidTerminalDragHandoff(
        terminalHandoffLog({
          ...validTerminalHandoffSummary(),
          invalidFrameWitnesses: [witness],
        }),
      ),
    /invalidFrameWitnesses must be empty/u,
  );
  assert.throws(
    () =>
      parseAndroidTerminalDragHandoff(
        terminalHandoffLog({
          ...validTerminalHandoffSummary(),
          invalidFrameWitnesses: [
            {
              ...witness,
              actors: [{ ...witness.actors[0], alpha: 1.5 }],
            },
          ],
        }),
      ),
    /alpha must be between 0 and 1/u,
  );
});

test('rejects invalid terminal outcome, continuity, PID, blocker, and cleanup evidence', () => {
  const invalidCases = [
    ['schemaVersion', 3, /schemaVersion must equal 4/u],
    ['processStable', false, /processStable must be true/u],
    [
      'blockedJsQueueReleaseConfirmed',
      false,
      /blockedJsQueueReleaseConfirmed must be true/u,
    ],
    ['gestureCount', 4, /gestureCount must equal 5/u],
    ['blockedTerminalFrames', 7, /blockedTerminalFrames must be at least 8/u],
    [
      'blockedTerminalSpanMs',
      99.99,
      /blockedTerminalSpanMs must be at least 100/u,
    ],
    [
      'terminalOutcomeWitnessCount',
      4,
      /terminalOutcomeWitnessCount must equal 5/u,
    ],
    ['zeroPrimaryFrames', 1, /zeroPrimaryFrames must equal 0/u],
    ['underOpacityFrames', 1, /underOpacityFrames must equal 0/u],
    ['overOpacityFrames', 1, /overOpacityFrames must equal 0/u],
    [
      'invalidPrimaryCompositionFrames',
      1,
      /invalidPrimaryCompositionFrames must equal 0/u,
    ],
    ['spatialDuplicateFrames', 1, /spatialDuplicateFrames must equal 0/u],
    [
      'recoveryUnexpectedLocationFrames',
      1,
      /recoveryUnexpectedLocationFrames must equal 0/u,
    ],
    [
      'sourceVisibleWithOverlayFrames',
      1,
      /sourceVisibleWithOverlayFrames must equal 0/u,
    ],
    ['finalActiveOverlayHosts', 1, /finalActiveOverlayHosts must equal 0/u],
    ['finalRetiringOverlayHosts', 1, /finalRetiringOverlayHosts must equal 0/u],
    [
      'recoveryFinalCanonicalSourceCount',
      2,
      /recoveryFinalCanonicalSourceCount must equal 3/u,
    ],
    [
      'acceptedFinalCanonicalTargetCount',
      1,
      /acceptedFinalCanonicalTargetCount must equal 2/u,
    ],
    ['reusePassed', false, /reusePassed must be true/u],
  ];

  for (const [field, value, pattern] of invalidCases) {
    assert.throws(
      () =>
        parseAndroidTerminalDragHandoff(
          terminalHandoffLog({
            ...validTerminalHandoffSummary(),
            [field]: value,
          }),
        ),
      pattern,
    );
  }

  assert.throws(
    () =>
      parseAndroidTerminalDragHandoff(
        terminalHandoffLog({
          ...validTerminalHandoffSummary(),
          endPid: 4322,
        }),
      ),
    /PIDs must match/u,
  );
  const invalidEvidence = buildAndroidTerminalDragHandoffEvidence(
    terminalHandoffLog({
      ...validTerminalHandoffSummary(),
      zeroPrimaryFrames: 1,
    }),
  );
  assert.equal(invalidEvidence.required, true);
  assert.equal(invalidEvidence.summary, null);
  assert.match(invalidEvidence.error, /zeroPrimaryFrames must equal 0/u);

  assert.throws(
    () =>
      parseAndroidTerminalDragHandoff(
        terminalHandoffLog({
          ...validTerminalHandoffSummary(),
          blockedTerminalOverlayFrames: 7,
        }),
      ),
    /every blocked post-UP frame must retain the terminal overlay/u,
  );
  assert.throws(
    () =>
      parseAndroidTerminalDragHandoff(
        terminalHandoffLog({
          ...validTerminalHandoffSummary(),
          postTerminalFrames: 21,
          pendingCanonicalCrossfadeFrames: 1,
          recoveryPostTerminalFrames: 20,
          singlePrimaryFrames: 20,
        }),
      ),
    /accepted outcomes must each contribute a post-terminal frame/u,
  );
  assert.throws(
    () =>
      parseAndroidTerminalDragHandoff(
        terminalHandoffLog({
          ...validTerminalHandoffSummary(),
          singlePrimaryFrames: 45,
        }),
      ),
    /exact primary compositions must cover every post-terminal frame/u,
  );
  assert.throws(
    () =>
      parseAndroidTerminalDragHandoff(
        terminalHandoffLog({
          ...validTerminalHandoffSummary(),
          pendingCanonicalCrossfadeFrames: 31,
          singlePrimaryFrames: 19,
        }),
      ),
    /pending\/canonical crossfades must be confined to accepted outcomes/u,
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

test('retains valid threshold-failed summaries but not corrupt transport payloads', () => {
  const thresholdFailed = validPerformanceSummary();
  thresholdFailed.runs[0].activationLatencyMs = 83.34;
  const failedEvidence = buildAndroidDragPerformanceEvidence(
    chunkedPerformanceLog(thresholdFailed).join('\n'),
  );
  assert.deepEqual(failedEvidence.summary, thresholdFailed);
  assert.match(
    failedEvidence.error,
    /activation latency at or above 83\.34 ms/u,
  );
  assert.deepEqual(failedEvidence.violations, [
    {
      code: 'activation-latency',
      message:
        'Android drag performance run 1 had activation latency at or above 83.34 ms.',
      metric: 'activationLatencyMs',
      observed: 83.34,
      run: 1,
      threshold: 83.34,
    },
  ]);

  const corruptChunks = chunkedPerformanceLog(validPerformanceSummary()).slice(
    0,
    -1,
  );
  const corruptEvidence = buildAndroidDragPerformanceEvidence(
    corruptChunks.join('\n'),
  );
  assert.equal(corruptEvidence.summary, null);
  assert.match(corruptEvidence.error, /chunk count is incomplete/u);
  assert.deepEqual(corruptEvidence.violations, []);
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
    /schemaVersion must equal 4/u,
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
  invalidMetrics.runs[0].callbackCount = 483;
  assert.throws(
    () =>
      parseAndroidDragPerformance(
        `I ChessboardDragPerf: CHESSBOARD_DRAG_PERF ${JSON.stringify(invalidMetrics)}`,
      ),
    /run 1 contained invalid frame metrics/u,
  );

  const tooFewValidFrames = validPerformanceSummary();
  tooFewValidFrames.runs[0].callbackCount = 468;
  tooFewValidFrames.runs[0].deliveryPercent = (227 * 100) / 240;
  tooFewValidFrames.runs[0].expectedVsyncSlots = 240;
  tooFewValidFrames.runs[0].frameCount = 227;
  tooFewValidFrames.runs[0].implausibleDeadlineCount = 227;
  tooFewValidFrames.runs[0].missedVsyncSlots = 13;
  assert.throws(
    () =>
      parseAndroidDragPerformance(
        `I ChessboardDragPerf: CHESSBOARD_DRAG_PERF ${JSON.stringify(tooFewValidFrames)}`,
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
  withFilteredCallbacks.runs[0].callbackCount = 485;

  assert.deepEqual(
    parseAndroidDragPerformance(
      `I ChessboardDragPerf: CHESSBOARD_DRAG_PERF ${JSON.stringify(withFilteredCallbacks)}`,
    ),
    withFilteredCallbacks,
  );

  withFilteredCallbacks.runs[0].callbackCount = 484;
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
  impossibleMismatchCount.runs[0].duplicatePayloadMismatchCount = 242;
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
  exactDeliveryBoundary.runs[0].callbackCount = 469;
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
  underDeliveryBudget.runs[2].callbackCount = 469;
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

  const inconsistentMeasurementSpan = validPerformanceSummary();
  inconsistentMeasurementSpan.runs[0].intendedVsyncSpanMs = 3_900;
  assert.throws(
    () =>
      parseAndroidDragPerformance(
        `I ChessboardDragPerf: CHESSBOARD_DRAG_PERF ${JSON.stringify(inconsistentMeasurementSpan)}`,
      ),
    /run 1 intended-vsync span is inconsistent/u,
  );
});

test('caps unique frame cadence and measurement duration at their inclusive maxima', () => {
  const cadenceMaximum = validPerformanceSummary();
  cadenceMaximum.runs[4].frameCount = 270;
  cadenceMaximum.runs[4].callbackCount = 511;
  cadenceMaximum.runs[4].expectedVsyncSlots = 270;
  cadenceMaximum.runs[4].deliveryPercent = 100;
  assert.doesNotThrow(() =>
    parseAndroidDragPerformance(
      `I ChessboardDragPerf: CHESSBOARD_DRAG_PERF ${JSON.stringify(cadenceMaximum)}`,
    ),
  );

  cadenceMaximum.runs[4].frameCount = 271;
  cadenceMaximum.runs[4].callbackCount = 512;
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
  measurementMaximum.runs[4].callbackCount = 481;
  measurementMaximum.runs[4].deliveryPercent = (240 * 100) / 246;
  measurementMaximum.runs[4].expectedVsyncSlots = 246;
  measurementMaximum.runs[4].frameCount = 240;
  measurementMaximum.runs[4].implausibleDeadlineCount = 240;
  measurementMaximum.runs[4].intendedVsyncSpanMs = 4_100;
  measurementMaximum.runs[4].measurementSpanMs = 4_100;
  measurementMaximum.runs[4].missedVsyncSlots = 6;
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

test('enforces the five-frame pickup and tighter active-movement ceilings independently', () => {
  const ceilings = [
    {
      boundary: 83.34,
      code: 'activation-latency',
      metric: 'activationLatencyMs',
      message:
        'Android drag performance run 3 had activation latency at or above 83.34 ms.',
    },
    {
      boundary: 50,
      code: 'final-move-latency',
      metric: 'finalMoveLatencyMs',
      message:
        'Android drag performance run 3 had final-move latency at or above 50 ms.',
    },
    {
      boundary: 50,
      code: 'sustained-vsync-gap',
      metric: 'worstSustainedVsyncGapMs',
      message:
        'Android drag performance run 3 contained a sustained vsync gap at or above 50 ms.',
    },
    {
      boundary: 50,
      code: 'total-frame-duration',
      metric: 'worstTotalDurationMs',
      message:
        'Android drag performance run 3 contained a total-duration frame at or above 50 ms.',
    },
  ];

  for (const ceiling of ceilings) {
    const below = validPerformanceSummary();
    below.runs[2][ceiling.metric] = ceiling.boundary - 0.001;
    assert.deepEqual(
      parseAndroidDragPerformance(
        `I ChessboardDragPerf: CHESSBOARD_DRAG_PERF ${JSON.stringify(below)}`,
      ),
      below,
    );

    const atBoundary = validPerformanceSummary();
    atBoundary.runs[2][ceiling.metric] = ceiling.boundary;
    const logcat = `I ChessboardDragPerf: CHESSBOARD_DRAG_PERF ${JSON.stringify(atBoundary)}`;
    const evaluation = evaluateAndroidDragPerformance(logcat);
    assert.deepEqual(evaluation.summary, atBoundary);
    assert.deepEqual(evaluation.violations, [
      {
        code: ceiling.code,
        message: ceiling.message,
        metric: ceiling.metric,
        observed: ceiling.boundary,
        run: 3,
        threshold: ceiling.boundary,
      },
    ]);
    assert.throws(
      () => parseAndroidDragPerformance(logcat),
      (error) => {
        assert.equal(error.message, ceiling.message);
        assert.deepEqual(error.summary, atBoundary);
        assert.deepEqual(error.violations, evaluation.violations);
        return true;
      },
    );
  }
});

test('ignores removed v3 coverage fields and fails closed on malformed v4 metrics', () => {
  const withHostileLegacyFields = validPerformanceSummary();
  Object.assign(withHostileLegacyFields.runs[0], {
    leadingCoverageGapMs: 50_000,
    trailingCoverageGapMs: -1,
    worstCoverageGapMs: 'stale',
    worstVsyncGapMs: null,
  });
  assert.deepEqual(
    parseAndroidDragPerformance(
      `I ChessboardDragPerf: CHESSBOARD_DRAG_PERF ${JSON.stringify(withHostileLegacyFields)}`,
    ),
    withHostileLegacyFields,
  );

  for (const metric of [
    'activationLatencyMs',
    'finalMoveLatencyMs',
    'worstSustainedVsyncGapMs',
  ]) {
    const missing = validPerformanceSummary();
    missing.runs[0][metric] = undefined;
    assert.throws(
      () =>
        parseAndroidDragPerformance(
          `I ChessboardDragPerf: CHESSBOARD_DRAG_PERF ${JSON.stringify(missing)}`,
        ),
      new RegExp(`run 1 ${metric} must be a finite number`, 'u'),
    );
  }

  const nonFinite = validPerformanceSummary();
  nonFinite.runs[0].finalMoveLatencyMs = null;
  assert.throws(
    () =>
      parseAndroidDragPerformance(
        `I ChessboardDragPerf: CHESSBOARD_DRAG_PERF ${JSON.stringify(nonFinite)}`,
      ),
    /run 1 finalMoveLatencyMs must be a finite number/u,
  );

  const inconsistentPercentiles = validPerformanceSummary();
  inconsistentPercentiles.runs[0].worstSustainedVsyncGapMs = 30;
  assert.throws(
    () =>
      parseAndroidDragPerformance(
        `I ChessboardDragPerf: CHESSBOARD_DRAG_PERF ${JSON.stringify(inconsistentPercentiles)}`,
      ),
    /run 1 has inconsistent vsync gap percentiles/u,
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
  reportedJank.runs[1].heuristicJankPercent = 100 / 241;
  reportedJank.runs[1].worstUiDurationMs = 34;
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
    /run 3 has UI duration inconsistent with its heuristic jank count/u,
  );
});

test('keeps raw TOTAL percentiles internally ordered', () => {
  const inconsistentTotals = validPerformanceSummary();
  inconsistentTotals.runs[0].p95TotalDurationMs = 36;
  assert.throws(
    () =>
      parseAndroidDragPerformance(
        `I ChessboardDragPerf: CHESSBOARD_DRAG_PERF ${JSON.stringify(inconsistentTotals)}`,
      ),
    /run 1 has inconsistent total-duration percentiles/u,
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

test('allows the terminal drag handoff visual-continuity target', () => {
  assert.equal(
    resolveAndroidInstrumentationTest({
      ANDROID_TEST_CLASS: ` ${androidTerminalDragHandoffTest} `,
    }),
    androidTerminalDragHandoffTest,
  );
  assert.deepEqual(buildGradleArguments(androidTerminalDragHandoffTest), [
    ':app:connectedReleaseAndroidTest',
    '--no-daemon',
    `-Pandroid.testInstrumentationRunnerArguments.class=${androidTerminalDragHandoffTest}`,
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

test('allows the controlled-transition whole-provider unmount target', () => {
  assert.equal(
    resolveAndroidInstrumentationTest({
      ANDROID_TEST_CLASS: ` ${androidTransitionProviderWholeUnmountTest} `,
    }),
    androidTransitionProviderWholeUnmountTest,
  );
  assert.deepEqual(
    buildGradleArguments(androidTransitionProviderWholeUnmountTest),
    [
      ':app:connectedReleaseAndroidTest',
      '--no-daemon',
      `-Pandroid.testInstrumentationRunnerArguments.class=${androidTransitionProviderWholeUnmountTest}`,
    ],
  );
});

test('allows the rapid plain FEN transition interruption target', () => {
  assert.equal(
    resolveAndroidInstrumentationTest({
      ANDROID_TEST_CLASS: ` ${androidPlainFenTransitionInterruptTest} `,
    }),
    androidPlainFenTransitionInterruptTest,
  );
  assert.deepEqual(
    buildGradleArguments(androidPlainFenTransitionInterruptTest),
    [
      ':app:connectedReleaseAndroidTest',
      '--no-daemon',
      `-Pandroid.testInstrumentationRunnerArguments.class=${androidPlainFenTransitionInterruptTest}`,
    ],
  );
});

test('allows the repeated 200/125 ms plain FEN interruption target', () => {
  assert.equal(
    resolveAndroidInstrumentationTest({
      ANDROID_TEST_CLASS: ` ${androidPlainFenTransitionInterrupt200Test} `,
    }),
    androidPlainFenTransitionInterrupt200Test,
  );
  assert.deepEqual(
    buildGradleArguments(androidPlainFenTransitionInterrupt200Test),
    [
      ':app:connectedReleaseAndroidTest',
      '--no-daemon',
      `-Pandroid.testInstrumentationRunnerArguments.class=${androidPlainFenTransitionInterrupt200Test}`,
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

test('publishes a separate terminal drag handoff gate and evidence directory', async () => {
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
    rootPackage.scripts['native:android:drag:terminal-handoff:gate'],
    'pnpm --filter @vibechess/chessboard-native-harness android:drag:terminal-handoff:gate',
  );
  assert.equal(
    harnessPackage.scripts['android:drag:terminal-handoff:gate'],
    `ANDROID_TEST_CLASS=${androidTerminalDragHandoffTest} ANDROID_FABRIC_DRAG_EVIDENCE_DIR=android/app/build/reports/fabric-drag-terminal-handoff-gate node scripts/run-android-fabric-drag-gate.mjs`,
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

test('publishes a separate controlled-transition whole-unmount gate', async () => {
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
    rootPackage.scripts[
      'native:android:position-transition:whole-unmount:gate'
    ],
    'pnpm --filter @vibechess/chessboard-native-harness android:position-transition:whole-unmount:gate',
  );
  assert.equal(
    harnessPackage.scripts['android:position-transition:whole-unmount:gate'],
    `ANDROID_TEST_CLASS=${androidTransitionProviderWholeUnmountTest} ANDROID_FABRIC_DRAG_EVIDENCE_DIR=android/app/build/reports/fabric-position-transition-whole-unmount-gate node scripts/run-android-fabric-drag-gate.mjs`,
  );
});

test('publishes a separate rapid plain FEN transition interruption gate', async () => {
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
    rootPackage.scripts['native:android:position-transition:interrupt:gate'],
    'pnpm --filter @vibechess/chessboard-native-harness android:position-transition:interrupt:gate',
  );
  assert.equal(
    harnessPackage.scripts['android:position-transition:interrupt:gate'],
    `ANDROID_TEST_CLASS=${androidPlainFenTransitionInterruptTest} ANDROID_FABRIC_DRAG_EVIDENCE_DIR=android/app/build/reports/fabric-plain-fen-transition-interrupt-gate node scripts/run-android-fabric-drag-gate.mjs`,
  );
  assert.equal(
    rootPackage.scripts[
      'native:android:position-transition:interrupt:200ms:gate'
    ],
    'pnpm --filter @vibechess/chessboard-native-harness android:position-transition:interrupt:200ms:gate',
  );
  assert.equal(
    harnessPackage.scripts['android:position-transition:interrupt:200ms:gate'],
    `ANDROID_TEST_CLASS=${androidPlainFenTransitionInterrupt200Test} ANDROID_FABRIC_DRAG_EVIDENCE_DIR=android/app/build/reports/fabric-plain-fen-transition-interrupt-200ms-gate node scripts/run-android-fabric-drag-gate.mjs`,
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
