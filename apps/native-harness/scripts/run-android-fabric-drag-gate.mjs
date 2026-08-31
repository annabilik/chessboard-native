import { Buffer } from 'node:buffer';
import { spawn, spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { once } from 'node:events';
import {
  closeSync,
  existsSync,
  mkdirSync,
  openSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import path from 'node:path';
import { setTimeout } from 'node:timers';
import { fileURLToPath, pathToFileURL } from 'node:url';

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const harnessRoot = path.resolve(scriptDirectory, '..');
const repositoryRoot = path.resolve(harnessRoot, '../..');
const androidRoot = path.join(harnessRoot, 'android');
const defaultEvidenceDirectory = path.join(
  androidRoot,
  'app/build/reports/fabric-drag-gate',
);
const releaseBundleOutputDirectory = path.join(
  androidRoot,
  'app/build/generated/assets/react/release',
);

export const defaultAndroidAcceptedDragTest =
  'com.vibechess.chessboardnativeharness.ChessboardAcceptedDragTest#acceptedDragsPublishCorrelatedControlledCommitsExactlyOnce';
export const androidProviderUnmountDragTest =
  'com.vibechess.chessboardnativeharness.ChessboardProviderUnmountDragTest#unmountingProviderDuringActiveDragDoesNotUpdateRemovedFabricHosts';
export const androidTerminalDragHandoffTestClass =
  'com.vibechess.chessboardnativeharness.ChessboardTerminalDragHandoffTest';
export const androidTerminalDragHandoffTest = `${androidTerminalDragHandoffTestClass}#terminalHandoffIsPaintContinuousAndAllOutcomesRemainReusable`;
export const androidTransitionProviderUnmountDragTest =
  'com.vibechess.chessboardnativeharness.ChessboardTransitionProviderUnmountDragTest#providerReplacementWhileTransitionAndDragOverlapLeavesStateReusable';
export const androidTransitionProviderWholeUnmountTest =
  'com.vibechess.chessboardnativeharness.ChessboardTransitionProviderWholeUnmountTest#wholeProviderUnmountDuringActiveTransitionSurvivesNativeTouchesAndRemainsReusable';
export const androidPlainFenTransitionInterruptTest =
  'com.vibechess.chessboardnativeharness.ChessboardPlainFenTransitionInterruptTest#rapidPlainFenUpdatesRetireInterruptedTransitionHostsAndRemainReusable';
export const androidPlainFenTransitionInterrupt200Test =
  'com.vibechess.chessboardnativeharness.ChessboardPlainFenTransitionInterrupt200Test#rapidPlainFenUpdatesRetireInterruptedTransitionHostsAndRemainReusable';
export const androidDragPerformanceTest =
  'com.vibechess.chessboardnativeharness.ChessboardDragPerformanceTest#sustainedDragMeetsReleaseFrameBudget';

const dragPerformanceLogPrefix = 'CHESSBOARD_DRAG_PERF ';
const dragPerformanceChunkLogPrefix = 'CHESSBOARD_DRAG_PERF_CHUNK ';
const terminalDragHandoffLogPrefix = 'CHESSBOARD_DRAG_HANDOFF ';
const terminalDragHandoffChunkLogPrefix = 'CHESSBOARD_DRAG_HANDOFF_CHUNK ';
const dragPerformanceChunkEnvelopePattern =
  /^v=(\d+) id=([a-f0-9]{16}) sha256=([a-f0-9]{64}) part=(\d+)\/(\d+) bytes=(\d+) data=([A-Za-z0-9+/]+={0,2})$/u;
const dragPerformanceLogTransportVersion = 1;
const terminalDragHandoffChunkEnvelopePattern =
  /^v=(\d+) id=([a-f0-9]{16}) sha256=([a-f0-9]{64}) part=(\d+)\/(\d+) bytes=(\d+) data=([A-Za-z0-9+/]+={0,2})$/u;
const terminalDragHandoffLogTransportVersion = 1;
const terminalDragHandoffMaximumChunkCount = 6;
const terminalDragHandoffMaximumChunkPayloadCharacters = 2_000;
const terminalDragHandoffMaximumRecordBytes = 8_192;
const dragPerformanceThresholds = Object.freeze({
  expectedFrameDurationToleranceMs: 0.01,
  jankHeuristicMultiplier: 2,
  maximumFrameCount: 270,
  maximumInputSpanMs: 4_100,
  maximumMeasurementSpanMs: 4_100,
  maximumPlausibleDeadlinePeriods: 4,
  maximumRefreshRateHz: 60.5,
  // Rounded five-interval 60 Hz budget. Cold pickup includes mounting an
  // arbitrary consumer renderer; already-mounted movement stays at 50 ms.
  maximumActivationLatencyMs: 83.34,
  maximumFinalMoveLatencyMs: 50,
  maximumTotalDurationMs: 50,
  maximumSustainedVsyncGapMs: 50,
  measuredMoveCount: 301,
  measuredRunCount: 5,
  minimumDeliveryPercent: 95,
  minimumFrameCount: 228,
  minimumInputSpanMs: 3_950,
  minimumMeasurementSpanMs: 3_950,
  minimumRefreshRateHz: 59.5,
});
const terminalDragHandoffSchemaKeys = Object.freeze([
  'acceptedCount',
  'acceptedFinalCanonicalTargetCount',
  'acceptedOffTargetFrames',
  'acceptedSourceSnapbackFrames',
  'activeOverlayFrames',
  'blockedJsQueueReleaseConfirmed',
  'blockedTerminalFrames',
  'blockedTerminalOverlayFrames',
  'blockedTerminalSpanMs',
  'cancelCount',
  'canonicalFrames',
  'canonicalTransitionFrames',
  'droppedInvalidFrameWitnessCount',
  'endPid',
  'finalActiveOverlayHosts',
  'finalRetiringOverlayHosts',
  'gestureCount',
  'invalidFrameCount',
  'invalidFrameWitnesses',
  'invalidPrimaryCompositionFrames',
  'offBoardCount',
  'overOpacityFrames',
  'pendingCanonicalCrossfadeFrames',
  'pendingSourceGhostFrames',
  'pendingTargetFrames',
  'postTerminalFrames',
  'processStable',
  'recoveryFinalCanonicalSourceCount',
  'recoveryPostTerminalFrames',
  'recoverySourceLocationFrames',
  'recoveryTerminalLocationFrames',
  'recoveryUnexpectedLocationFrames',
  'rejectedCount',
  'reusePassed',
  'schemaVersion',
  'singlePrimaryFrames',
  'sourceVisibleWithOverlayFrames',
  'spatialDuplicateFrames',
  'startPid',
  'terminalOutcomeWitnessCount',
  'terminalOverlayFrames',
  'underOpacityFrames',
  'zeroPrimaryFrames',
]);

const failureSignatures = Object.freeze([
  {
    id: 'retryable-mounting-layer-exception',
    pattern: /RetryableMountingLayerException/iu,
  },
  {
    id: 'missing-surface-mounting-manager',
    pattern: /Unable to find SurfaceMountingManager/iu,
  },
  {
    id: 'fabric-host-missing-or-removed',
    pattern:
      /(?:Unable to find viewState for tag|(?:Could not|Cannot|Unable to) find (?:native )?(?:view|host)(?: with)? tag|No (?:native )?(?:view|host) found for tag|view with tag \d+ (?:does not exist|was removed|has been removed)|(?:Fabric|Mounting)[^\n]*\b(?:missing|removed|unmounted)\b[^\n]*(?:host|view|tag)|(?:host|view)[^\n]*\b(?:missing|removed|unmounted)\b[^\n]*(?:Fabric|Mounting))/iu,
  },
  {
    id: 'reanimated-synchronous-update-failure',
    pattern:
      /(?:\[?Reanimated\]?|react-native-reanimated)[^\n]*(?:synchronous(?:ly)?\s*(?:call|update)|failed to synchronously)/iu,
  },
]);

function delay(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

function commandLabel(command, args) {
  return [command, ...args].join(' ');
}

function runCaptured(command, args, options = {}) {
  const result = spawnSync(command, args, {
    encoding: 'utf8',
    ...options,
  });
  if (result.error) {
    throw result.error;
  }
  if (result.status !== 0) {
    const stderr = result.stderr?.trim();
    throw new Error(
      `${commandLabel(command, args)} exited with ${String(result.status)}${
        stderr ? `\n${stderr}` : ''
      }`,
    );
  }
  return result.stdout.trim();
}

function runCapturedBytes(command, args, options = {}) {
  const result = spawnSync(command, args, {
    encoding: null,
    ...options,
  });
  if (result.error) {
    throw result.error;
  }
  if (result.status !== 0) {
    const stderr = result.stderr?.toString('utf8').trim();
    throw new Error(
      `${commandLabel(command, args)} exited with ${String(result.status)}${
        stderr ? `\n${stderr}` : ''
      }`,
    );
  }
  return result.stdout ?? Buffer.alloc(0);
}

export function parseAdbDevices(output) {
  return output
    .split(/\r?\n/u)
    .slice(1)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const [serial = '', state = 'unknown', ...details] = line.split(/\s+/u);
      return { details: details.join(' '), serial, state };
    });
}

export function selectAndroidDevice(output, requestedSerial) {
  const devices = parseAdbDevices(output);
  const requested = requestedSerial?.trim();

  if (requested) {
    const matchingDevice = devices.find(
      (device) => device.serial === requested,
    );
    if (matchingDevice === undefined) {
      throw new Error(
        `ANDROID_SERIAL=${requested} is not listed by adb devices -l.`,
      );
    }
    if (matchingDevice.state !== 'device') {
      throw new Error(
        `ANDROID_SERIAL=${requested} is ${matchingDevice.state}, not ready.`,
      );
    }
    return matchingDevice;
  }

  const readyDevices = devices.filter((device) => device.state === 'device');
  if (readyDevices.length === 1) {
    return readyDevices[0];
  }
  if (readyDevices.length === 0) {
    const listed = devices
      .map((device) => `${device.serial} (${device.state})`)
      .join(', ');
    throw new Error(
      `No ready Android device is connected.${listed ? ` Listed: ${listed}.` : ''}`,
    );
  }
  throw new Error(
    `More than one Android device is ready (${readyDevices
      .map((device) => device.serial)
      .join(', ')}). Set ANDROID_SERIAL explicitly.`,
  );
}

export function adbArguments(serial, ...args) {
  return ['-s', serial, ...args];
}

export function classifyAndroidDeviceKind(qemuProperty) {
  const normalized = qemuProperty.trim();
  if (normalized === '1') return 'emulator';
  if (normalized === '' || normalized === '0') return 'physical';
  return 'unknown';
}

export function requirePhysicalAndroidDevice(kind, environment = {}) {
  if (kind === 'physical') return;
  if (
    kind === 'emulator' &&
    environment.ANDROID_FABRIC_ALLOW_EMULATOR?.trim() === '1'
  ) {
    return;
  }
  throw new Error(
    kind === 'emulator'
      ? 'Android Fabric drag release gates require a physical device. Set ANDROID_FABRIC_ALLOW_EMULATOR=1 only for non-release diagnostics.'
      : 'Unable to prove that the selected Android target is a physical device.',
  );
}

export function buildGradleArguments(
  testClass = defaultAndroidAcceptedDragTest,
) {
  if (!/^[A-Za-z0-9_.$]+(?:#[A-Za-z0-9_$]+)?$/u.test(testClass)) {
    throw new Error(`Invalid Android instrumentation class: ${testClass}`);
  }
  return [
    ':app:connectedReleaseAndroidTest',
    '--no-daemon',
    `-Pandroid.testInstrumentationRunnerArguments.class=${testClass}`,
  ];
}

export function resolveAndroidInstrumentationTest(environment = {}) {
  return (
    environment.ANDROID_TEST_CLASS?.trim() || defaultAndroidAcceptedDragTest
  );
}

export function scanAndroidFabricFailures(logcat) {
  const findings = [];
  const lines = logcat.split(/\r?\n/u);

  for (const [index, line] of lines.entries()) {
    for (const signature of failureSignatures) {
      if (signature.pattern.test(line)) {
        findings.push({
          evidence: line.trim(),
          line: index + 1,
          signature: signature.id,
        });
      }
    }
  }

  return findings;
}

function parseTerminalHandoffPositiveSafeInteger(value, label) {
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed <= 0) {
    throw new Error(
      `Android terminal drag handoff chunk ${label} must be a positive safe integer.`,
    );
  }
  return parsed;
}

function reassembleAndroidTerminalDragHandoffChunks(chunkPayloads) {
  if (chunkPayloads.length > terminalDragHandoffMaximumChunkCount) {
    throw new Error(
      `Android terminal drag handoff chunk count must not exceed ${String(terminalDragHandoffMaximumChunkCount)}.`,
    );
  }
  const chunks = chunkPayloads.map((payload, index) => {
    const match = terminalDragHandoffChunkEnvelopePattern.exec(payload);
    if (match === null) {
      throw new Error(
        `Android terminal drag handoff chunk ${String(index + 1)} has a malformed envelope.`,
      );
    }
    const [
      ,
      versionText,
      recordId,
      checksum,
      partText,
      countText,
      bytesText,
      data,
    ] = match;
    if (data.length > terminalDragHandoffMaximumChunkPayloadCharacters) {
      throw new Error(
        `Android terminal drag handoff chunk ${String(index + 1)} data must not exceed ${String(terminalDragHandoffMaximumChunkPayloadCharacters)} characters.`,
      );
    }
    return {
      byteLength: parseTerminalHandoffPositiveSafeInteger(
        bytesText,
        'byte length',
      ),
      checksum,
      count: parseTerminalHandoffPositiveSafeInteger(countText, 'count'),
      data,
      part: parseTerminalHandoffPositiveSafeInteger(partText, 'part'),
      recordId,
      version: parseTerminalHandoffPositiveSafeInteger(versionText, 'version'),
    };
  });
  const first = chunks[0];
  if (first.version !== terminalDragHandoffLogTransportVersion) {
    throw new Error(
      `Android terminal drag handoff chunk transport version must equal ${String(terminalDragHandoffLogTransportVersion)}.`,
    );
  }
  if (first.recordId !== first.checksum.slice(0, first.recordId.length)) {
    throw new Error(
      'Android terminal drag handoff chunk record id is inconsistent with its checksum.',
    );
  }
  if (first.count > terminalDragHandoffMaximumChunkCount) {
    throw new Error(
      `Android terminal drag handoff chunk count must not exceed ${String(terminalDragHandoffMaximumChunkCount)}.`,
    );
  }
  if (chunks.length !== first.count) {
    throw new Error(
      `Android terminal drag handoff chunk count is incomplete or duplicated; expected ${String(first.count)}, found ${String(chunks.length)}.`,
    );
  }
  if (first.byteLength > terminalDragHandoffMaximumRecordBytes) {
    throw new Error(
      `Android terminal drag handoff record must not exceed ${String(terminalDragHandoffMaximumRecordBytes)} bytes.`,
    );
  }
  const expectedEncodedLength = 4 * Math.ceil(first.byteLength / 3);
  const expectedChunkCount = Math.ceil(
    expectedEncodedLength / terminalDragHandoffMaximumChunkPayloadCharacters,
  );
  if (first.count !== expectedChunkCount) {
    throw new Error(
      `Android terminal drag handoff chunk count must be canonical for the declared byte length; expected ${String(expectedChunkCount)}, found ${String(first.count)}.`,
    );
  }

  for (const [index, chunk] of chunks.entries()) {
    if (
      chunk.version !== first.version ||
      chunk.recordId !== first.recordId ||
      chunk.checksum !== first.checksum ||
      chunk.count !== first.count ||
      chunk.byteLength !== first.byteLength
    ) {
      throw new Error(
        `Android terminal drag handoff chunk ${String(index + 1)} does not belong to the same logical record.`,
      );
    }
    if (chunk.part !== index + 1) {
      throw new Error(
        `Android terminal drag handoff chunks are out of order at chunk ${String(index + 1)}; found part ${String(chunk.part)}.`,
      );
    }
    const expectedLength = Math.min(
      terminalDragHandoffMaximumChunkPayloadCharacters,
      expectedEncodedLength -
        index * terminalDragHandoffMaximumChunkPayloadCharacters,
    );
    if (chunk.data.length !== expectedLength) {
      throw new Error(
        `Android terminal drag handoff chunk ${String(index + 1)} is not canonically sized.`,
      );
    }
  }

  const encodedPayload = chunks.map((chunk) => chunk.data).join('');
  const decodedPayload = Buffer.from(encodedPayload, 'base64');
  if (decodedPayload.toString('base64') !== encodedPayload) {
    throw new Error(
      'Android terminal drag handoff chunk payload is not canonical Base64.',
    );
  }
  if (decodedPayload.length !== first.byteLength) {
    throw new Error(
      `Android terminal drag handoff chunk byte length mismatch; expected ${String(first.byteLength)}, found ${String(decodedPayload.length)}.`,
    );
  }
  const actualChecksum = createHash('sha256')
    .update(decodedPayload)
    .digest('hex');
  if (actualChecksum !== first.checksum) {
    throw new Error('Android terminal drag handoff chunk checksum mismatch.');
  }
  const payload = decodedPayload.toString('utf8');
  if (!Buffer.from(payload, 'utf8').equals(decodedPayload)) {
    throw new Error(
      'Android terminal drag handoff chunk payload is not valid UTF-8.',
    );
  }
  return payload;
}

function extractAndroidTerminalDragHandoffPayload(logcat) {
  const directPayloads = [];
  const chunkPayloads = [];
  for (const line of logcat.split(/\r?\n/u)) {
    const chunkMarkerIndex = line.indexOf(terminalDragHandoffChunkLogPrefix);
    if (chunkMarkerIndex >= 0) {
      chunkPayloads.push(
        line
          .slice(chunkMarkerIndex + terminalDragHandoffChunkLogPrefix.length)
          .trim(),
      );
      continue;
    }
    const markerIndex = line.indexOf(terminalDragHandoffLogPrefix);
    if (markerIndex >= 0) {
      directPayloads.push(
        line.slice(markerIndex + terminalDragHandoffLogPrefix.length).trim(),
      );
    }
  }
  if (directPayloads.length > 0) {
    throw new Error(
      chunkPayloads.length > 0
        ? 'Expected exactly one CHESSBOARD_DRAG_HANDOFF logical record; found both direct and chunked records.'
        : 'Android terminal drag handoff schemaVersion 5 records must use checksummed chunk transport.',
    );
  }
  if (chunkPayloads.length === 0) {
    throw new Error(
      `Expected exactly one ${terminalDragHandoffChunkLogPrefix.trim()} logical record; found 0.`,
    );
  }
  return reassembleAndroidTerminalDragHandoffChunks(chunkPayloads);
}

function requireTerminalHandoffBoolean(summary, field) {
  const value = summary[field];
  if (typeof value !== 'boolean') {
    throw new Error(
      `Android terminal drag handoff ${field} must be a boolean.`,
    );
  }
  return value;
}

function requireTerminalHandoffNumber(summary, field) {
  const value = summary[field];
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new Error(
      `Android terminal drag handoff ${field} must be a finite number.`,
    );
  }
  return value;
}

function requireTerminalHandoffInteger(summary, field) {
  const value = requireTerminalHandoffNumber(summary, field);
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new Error(
      `Android terminal drag handoff ${field} must be a non-negative safe integer.`,
    );
  }
  return value;
}

function requireTerminalHandoffExact(summary, field, expected) {
  const value = requireTerminalHandoffInteger(summary, field);
  if (value !== expected) {
    throw new Error(
      `Android terminal drag handoff ${field} must equal ${String(expected)}; found ${String(value)}.`,
    );
  }
  return value;
}

function requireTerminalHandoffObjectKeys(value, expectedKeys, label) {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(
      `Android terminal drag handoff ${label} must be an object.`,
    );
  }
  const actualKeys = Object.keys(value).sort();
  if (
    actualKeys.length !== expectedKeys.length ||
    actualKeys.some((key, index) => key !== expectedKeys[index])
  ) {
    throw new Error(
      `Android terminal drag handoff ${label} must contain exactly the documented fields.`,
    );
  }
  return value;
}

const terminalHandoffPrimaryRoles = new Set([
  'canonical',
  'canonical-transition',
  'overlay',
  'pending-target',
]);
const terminalHandoffCenterTolerancePx = 14;
const terminalHandoffMinimumPrimaryOpacity = 0.95;
const terminalHandoffMaximumPrimaryOpacity = 1.05;
const terminalHandoffVisibilityEpsilon = Math.fround(1 / 255);

function terminalHandoffNear(leftX, leftY, rightX, rightY) {
  return (
    Math.hypot(Math.fround(leftX - rightX), Math.fround(leftY - rightY)) <=
    terminalHandoffCenterTolerancePx
  );
}

function expectedTerminalHandoffWitnessViolations(witness) {
  const violations = new Set();
  const visibleActors = witness.actors.filter((actor) => actor.visible);
  const visibleOverlays = visibleActors.filter(
    (actor) => actor.role === 'overlay',
  );
  if (
    visibleOverlays.length > 0 &&
    visibleActors.some(
      (actor) =>
        actor.role !== 'overlay' &&
        terminalHandoffNear(
          actor.centerX,
          actor.centerY,
          witness.sourceX,
          witness.sourceY,
        ),
    )
  ) {
    violations.add('source-visible-with-overlay');
  }

  if (witness.frameAfterArmMs === null) {
    return [...violations].sort();
  }

  const primary = visibleActors.filter((actor) =>
    terminalHandoffPrimaryRoles.has(actor.role),
  );
  const opacityMass = primary.reduce((total, actor) => total + actor.alpha, 0);
  if (primary.length === 0) {
    violations.add('zero-primary');
    violations.add('invalid-composition');
  } else {
    if (opacityMass < terminalHandoffMinimumPrimaryOpacity) {
      violations.add('under-opacity');
    }
    if (opacityMass > terminalHandoffMaximumPrimaryOpacity) {
      violations.add('over-opacity');
    }
    const singleFullOpacity =
      primary.length === 1 &&
      primary[0].alpha >= terminalHandoffMinimumPrimaryOpacity &&
      primary[0].alpha <= terminalHandoffMaximumPrimaryOpacity;
    let allowedAcceptedCrossfade = false;
    if (witness.outcome === 'accepted' && primary.length === 2) {
      const pending = primary.filter(
        (actor) => actor.role === 'pending-target',
      );
      const canonical = primary.filter(
        (actor) =>
          actor.role === 'canonical' || actor.role === 'canonical-transition',
      );
      allowedAcceptedCrossfade =
        pending.length === 1 &&
        canonical.length === 1 &&
        terminalHandoffNear(
          pending[0].centerX,
          pending[0].centerY,
          canonical[0].centerX,
          canonical[0].centerY,
        ) &&
        Math.fround(pending[0].alpha + canonical[0].alpha) >=
          terminalHandoffMinimumPrimaryOpacity &&
        Math.fround(pending[0].alpha + canonical[0].alpha) <=
          terminalHandoffMaximumPrimaryOpacity;
    }
    if (!singleFullOpacity && !allowedAcceptedCrossfade) {
      violations.add('invalid-composition');
    }
  }

  const sourceVisible = primary.some((actor) =>
    terminalHandoffNear(
      actor.centerX,
      actor.centerY,
      witness.sourceX,
      witness.sourceY,
    ),
  );
  if (witness.outcome === 'accepted') {
    if (sourceVisible) {
      violations.add('source-snapback');
    }
    if (
      primary.some(
        (actor) =>
          !terminalHandoffNear(
            actor.centerX,
            actor.centerY,
            witness.targetX,
            witness.targetY,
          ),
      )
    ) {
      violations.add('off-target');
    }
  } else if (
    primary.some(
      (actor) =>
        !terminalHandoffNear(
          actor.centerX,
          actor.centerY,
          witness.sourceX,
          witness.sourceY,
        ) &&
        !terminalHandoffNear(
          actor.centerX,
          actor.centerY,
          witness.targetX,
          witness.targetY,
        ),
    )
  ) {
    violations.add('unexpected-location');
  }
  if (
    primary.some((left, leftIndex) =>
      primary.some(
        (right, rightIndex) =>
          rightIndex > leftIndex &&
          Math.hypot(
            Math.fround(left.centerX - right.centerX),
            Math.fround(left.centerY - right.centerY),
          ) > terminalHandoffCenterTolerancePx,
      ),
    )
  ) {
    violations.add('spatial-duplicate');
  }
  return [...violations].sort();
}

function requireTerminalHandoffInvalidFrameWitnesses(summary) {
  const witnesses = summary.invalidFrameWitnesses;
  if (!Array.isArray(witnesses) || witnesses.length > 2) {
    throw new Error(
      'Android terminal drag handoff invalidFrameWitnesses must be an array with at most 2 entries.',
    );
  }
  const witnessKeys = [
    'activeOverlayHosts',
    'actors',
    'droppedActorCount',
    'frameAfterArmMs',
    'frameAfterInjectionMs',
    'frameTimeNs',
    'jsQueueBlocked',
    'observedActorCount',
    'opacityMass',
    'outcome',
    'postInjection',
    'retiringOverlayHosts',
    'sessionIndex',
    'sourceX',
    'sourceY',
    'targetX',
    'targetY',
    'violations',
  ];
  const actorKeys = ['alpha', 'centerX', 'centerY', 'role', 'visible'];
  const outcomes = new Set(['accepted', 'cancelled', 'off_board', 'rejected']);
  const expectedOutcomeBySession = [
    'accepted',
    'rejected',
    'off_board',
    'cancelled',
    'accepted',
  ];
  const roles = new Set([
    'canonical',
    'canonical-transition',
    'overlay',
    'pending-source',
    'pending-target',
    'source-ghost',
  ]);
  const allowedViolations = new Set([
    'invalid-composition',
    'off-target',
    'over-opacity',
    'source-snapback',
    'source-visible-with-overlay',
    'spatial-duplicate',
    'under-opacity',
    'unexpected-location',
    'zero-primary',
  ]);

  let previousSessionIndex = -1;
  let previousFrameTimeNs = -1;
  for (const [witnessIndex, candidate] of witnesses.entries()) {
    const label = `invalidFrameWitnesses[${String(witnessIndex)}]`;
    const witness = requireTerminalHandoffObjectKeys(
      candidate,
      witnessKeys,
      label,
    );
    const sessionIndex = requireTerminalHandoffInteger(witness, 'sessionIndex');
    if (sessionIndex >= 5) {
      throw new Error(
        `Android terminal drag handoff ${label}.sessionIndex must be less than 5.`,
      );
    }
    if (typeof witness.outcome !== 'string' || !outcomes.has(witness.outcome)) {
      throw new Error(
        `Android terminal drag handoff ${label}.outcome is invalid.`,
      );
    }
    if (witness.outcome !== expectedOutcomeBySession[sessionIndex]) {
      throw new Error(
        `Android terminal drag handoff ${label}.outcome must match its sessionIndex.`,
      );
    }
    for (const field of [
      'activeOverlayHosts',
      'droppedActorCount',
      'observedActorCount',
      'retiringOverlayHosts',
      'frameTimeNs',
    ]) {
      requireTerminalHandoffInteger(witness, field);
    }
    if (witness.frameTimeNs <= 0) {
      throw new Error(
        `Android terminal drag handoff ${label}.frameTimeNs must be positive.`,
      );
    }
    if (
      sessionIndex < previousSessionIndex ||
      witness.frameTimeNs <= previousFrameTimeNs
    ) {
      throw new Error(
        'Android terminal drag handoff invalidFrameWitnesses must be unique and chronological.',
      );
    }
    previousSessionIndex = sessionIndex;
    previousFrameTimeNs = witness.frameTimeNs;
    if (requireTerminalHandoffNumber(witness, 'opacityMass') < 0) {
      throw new Error(
        `Android terminal drag handoff ${label}.opacityMass must be non-negative.`,
      );
    }
    if (
      witness.frameAfterArmMs !== null &&
      requireTerminalHandoffNumber(witness, 'frameAfterArmMs') <= 0
    ) {
      throw new Error(
        `Android terminal drag handoff ${label}.frameAfterArmMs must be null or positive.`,
      );
    }
    if (
      witness.frameAfterInjectionMs !== null &&
      requireTerminalHandoffNumber(witness, 'frameAfterInjectionMs') <= 0
    ) {
      throw new Error(
        `Android terminal drag handoff ${label}.frameAfterInjectionMs must be null or positive.`,
      );
    }
    requireTerminalHandoffBoolean(witness, 'postInjection');
    requireTerminalHandoffBoolean(witness, 'jsQueueBlocked');
    if (witness.postInjection !== (witness.frameAfterInjectionMs !== null)) {
      throw new Error(
        `Android terminal drag handoff ${label} post-injection fields must agree.`,
      );
    }
    if (witness.postInjection && witness.frameAfterArmMs === null) {
      throw new Error(
        `Android terminal drag handoff ${label}.frameAfterArmMs is required after injection.`,
      );
    }
    if (
      witness.frameAfterInjectionMs !== null &&
      witness.frameAfterInjectionMs - witness.frameAfterArmMs > 1e-6
    ) {
      throw new Error(
        `Android terminal drag handoff ${label}.frameAfterInjectionMs cannot exceed frameAfterArmMs.`,
      );
    }
    if (
      !Array.isArray(witness.violations) ||
      witness.violations.length === 0 ||
      witness.violations.length > allowedViolations.size ||
      new Set(witness.violations).size !== witness.violations.length ||
      witness.violations.some(
        (violation) =>
          typeof violation !== 'string' || !allowedViolations.has(violation),
      )
    ) {
      throw new Error(
        `Android terminal drag handoff ${label}.violations must be unique known violation strings.`,
      );
    }
    if (
      witness.violations.some(
        (violation, index) =>
          violation !== [...witness.violations].sort()[index],
      )
    ) {
      throw new Error(
        `Android terminal drag handoff ${label}.violations must be sorted.`,
      );
    }
    if (!Array.isArray(witness.actors) || witness.actors.length > 6) {
      throw new Error(
        `Android terminal drag handoff ${label}.actors must be an array with at most 6 entries.`,
      );
    }
    if (
      witness.actors.length !== Math.min(witness.observedActorCount, 6) ||
      witness.droppedActorCount !==
        witness.observedActorCount - witness.actors.length
    ) {
      throw new Error(
        `Android terminal drag handoff ${label} actor counts are inconsistent.`,
      );
    }
    for (const [actorIndex, candidateActor] of witness.actors.entries()) {
      const actorLabel = `${label}.actors[${String(actorIndex)}]`;
      const actor = requireTerminalHandoffObjectKeys(
        candidateActor,
        actorKeys,
        actorLabel,
      );
      if (typeof actor.role !== 'string' || !roles.has(actor.role)) {
        throw new Error(
          `Android terminal drag handoff ${actorLabel}.role is invalid.`,
        );
      }
      requireTerminalHandoffBoolean(actor, 'visible');
      for (const field of ['alpha', 'centerX', 'centerY']) {
        requireTerminalHandoffNumber(actor, field);
      }
      if (actor.alpha < 0 || actor.alpha > 1) {
        throw new Error(
          `Android terminal drag handoff ${actorLabel}.alpha must be between 0 and 1.`,
        );
      }
      if (actor.visible && actor.alpha <= terminalHandoffVisibilityEpsilon) {
        throw new Error(
          `Android terminal drag handoff ${actorLabel}.visible requires alpha above the visibility epsilon.`,
        );
      }
    }
    for (const field of ['sourceX', 'sourceY', 'targetX', 'targetY']) {
      requireTerminalHandoffNumber(witness, field);
    }
    if (witness.droppedActorCount === 0) {
      const primaryOpacityMass = witness.actors
        .filter(
          (actor) =>
            actor.visible && terminalHandoffPrimaryRoles.has(actor.role),
        )
        .reduce((total, actor) => total + actor.alpha, 0);
      if (Math.abs(primaryOpacityMass - witness.opacityMass) > 1e-6) {
        throw new Error(
          `Android terminal drag handoff ${label}.opacityMass is inconsistent with its visible primary actors.`,
        );
      }
      const expectedViolations =
        expectedTerminalHandoffWitnessViolations(witness);
      if (
        expectedViolations.length !== witness.violations.length ||
        expectedViolations.some(
          (violation, index) => violation !== witness.violations[index],
        )
      ) {
        throw new Error(
          `Android terminal drag handoff ${label}.violations are inconsistent with its actors and phase.`,
        );
      }
    } else if (
      witness.frameAfterArmMs === null &&
      (witness.violations.length !== 1 ||
        witness.violations[0] !== 'source-visible-with-overlay')
    ) {
      throw new Error(
        `Android terminal drag handoff ${label} pre-arm violations are inconsistent.`,
      );
    }
  }
  return witnesses;
}

function requireTerminalHandoffMinimum(summary, field, minimum) {
  const value = requireTerminalHandoffInteger(summary, field);
  if (value < minimum) {
    throw new Error(
      `Android terminal drag handoff ${field} must be at least ${String(minimum)}; found ${String(value)}.`,
    );
  }
  return value;
}

const terminalHandoffVisualViolationCounterByLabel = new Map([
  ['invalid-composition', 'invalidPrimaryCompositionFrames'],
  ['off-target', 'acceptedOffTargetFrames'],
  ['over-opacity', 'overOpacityFrames'],
  ['source-snapback', 'acceptedSourceSnapbackFrames'],
  ['source-visible-with-overlay', 'sourceVisibleWithOverlayFrames'],
  ['spatial-duplicate', 'spatialDuplicateFrames'],
  ['under-opacity', 'underOpacityFrames'],
  ['unexpected-location', 'recoveryUnexpectedLocationFrames'],
  ['zero-primary', 'zeroPrimaryFrames'],
]);

function decodeAndroidTerminalDragHandoff(logcat) {
  const payload = extractAndroidTerminalDragHandoffPayload(logcat);
  let summary;
  try {
    summary = JSON.parse(payload);
  } catch (error) {
    throw new Error(
      `Android terminal drag handoff record is malformed JSON: ${error instanceof Error ? error.message : String(error)}`,
      { cause: error },
    );
  }
  if (
    summary === null ||
    typeof summary !== 'object' ||
    Array.isArray(summary)
  ) {
    throw new Error('Android terminal drag handoff record must be an object.');
  }

  const actualKeys = Object.keys(summary).sort();
  if (
    actualKeys.length !== terminalDragHandoffSchemaKeys.length ||
    actualKeys.some(
      (key, index) => key !== terminalDragHandoffSchemaKeys[index],
    )
  ) {
    throw new Error(
      'Android terminal drag handoff record must contain exactly the schemaVersion 5 fields.',
    );
  }
  requireTerminalHandoffExact(summary, 'schemaVersion', 5);
  const invalidFrameWitnesses =
    requireTerminalHandoffInvalidFrameWitnesses(summary);

  for (const field of [
    'blockedJsQueueReleaseConfirmed',
    'processStable',
    'reusePassed',
  ]) {
    requireTerminalHandoffBoolean(summary, field);
  }
  requireTerminalHandoffNumber(summary, 'blockedTerminalSpanMs');
  for (const field of terminalDragHandoffSchemaKeys) {
    if (
      field === 'blockedJsQueueReleaseConfirmed' ||
      field === 'blockedTerminalSpanMs' ||
      field === 'invalidFrameWitnesses' ||
      field === 'processStable' ||
      field === 'reusePassed'
    ) {
      continue;
    }
    requireTerminalHandoffInteger(summary, field);
  }

  const startPid = requireTerminalHandoffMinimum(summary, 'startPid', 1);
  const endPid = requireTerminalHandoffMinimum(summary, 'endPid', 1);
  if (summary.processStable !== (startPid === endPid)) {
    throw new Error(
      'Android terminal drag handoff processStable is inconsistent with its PIDs.',
    );
  }

  const invalidFrameCount = requireTerminalHandoffInteger(
    summary,
    'invalidFrameCount',
  );
  const droppedInvalidFrameWitnessCount = requireTerminalHandoffInteger(
    summary,
    'droppedInvalidFrameWitnessCount',
  );
  if (
    invalidFrameWitnesses.length !== Math.min(invalidFrameCount, 2) ||
    droppedInvalidFrameWitnessCount !==
      invalidFrameCount - invalidFrameWitnesses.length
  ) {
    throw new Error(
      'Android terminal drag handoff invalid-frame witness counts are inconsistent.',
    );
  }

  const reasonWitnessCounts = new Map(
    [...terminalHandoffVisualViolationCounterByLabel.keys()].map((label) => [
      label,
      0,
    ]),
  );
  for (const witness of invalidFrameWitnesses) {
    for (const violation of witness.violations) {
      reasonWitnessCounts.set(
        violation,
        reasonWitnessCounts.get(violation) + 1,
      );
    }
  }
  const aggregateViolationCounts = [
    ...terminalHandoffVisualViolationCounterByLabel.entries(),
  ].map(([label, field]) => {
    const aggregateCount = requireTerminalHandoffInteger(summary, field);
    const witnessedCount = reasonWitnessCounts.get(label);
    if (
      witnessedCount > aggregateCount ||
      (droppedInvalidFrameWitnessCount === 0 &&
        witnessedCount !== aggregateCount)
    ) {
      throw new Error(
        `Android terminal drag handoff ${field} is inconsistent with invalidFrameWitnesses.`,
      );
    }
    return aggregateCount;
  });
  const aggregateViolationCount = aggregateViolationCounts.reduce(
    (total, count) => total + count,
    0,
  );
  const maximumAggregateViolationCount = Math.max(
    0,
    ...aggregateViolationCounts,
  );
  if (
    maximumAggregateViolationCount > invalidFrameCount ||
    invalidFrameCount > aggregateViolationCount
  ) {
    throw new Error(
      'Android terminal drag handoff invalidFrameCount is inconsistent with its visual violation counters.',
    );
  }

  return summary;
}

function validateAndroidTerminalDragHandoffContinuity(summary) {
  const startPid = requireTerminalHandoffMinimum(summary, 'startPid', 1);
  const endPid = requireTerminalHandoffMinimum(summary, 'endPid', 1);
  if (startPid !== endPid) {
    throw new Error(
      `Android terminal drag handoff PIDs must match; start=${String(startPid)}, end=${String(endPid)}.`,
    );
  }
  if (!requireTerminalHandoffBoolean(summary, 'processStable')) {
    throw new Error(
      'Android terminal drag handoff processStable must be true.',
    );
  }
  if (
    !requireTerminalHandoffBoolean(summary, 'blockedJsQueueReleaseConfirmed')
  ) {
    throw new Error(
      'Android terminal drag handoff blockedJsQueueReleaseConfirmed must be true.',
    );
  }
  if (!requireTerminalHandoffBoolean(summary, 'reusePassed')) {
    throw new Error('Android terminal drag handoff reusePassed must be true.');
  }

  const gestureCount = requireTerminalHandoffExact(summary, 'gestureCount', 5);
  const acceptedCount = requireTerminalHandoffExact(
    summary,
    'acceptedCount',
    2,
  );
  const rejectedCount = requireTerminalHandoffExact(
    summary,
    'rejectedCount',
    1,
  );
  const offBoardCount = requireTerminalHandoffExact(
    summary,
    'offBoardCount',
    1,
  );
  const cancelCount = requireTerminalHandoffExact(summary, 'cancelCount', 1);
  const recoveryCount = rejectedCount + offBoardCount + cancelCount;
  if (
    acceptedCount + rejectedCount + offBoardCount + cancelCount !==
    gestureCount
  ) {
    throw new Error(
      'Android terminal drag handoff outcome counts must sum to gestureCount.',
    );
  }

  const activeOverlayFrames = requireTerminalHandoffMinimum(
    summary,
    'activeOverlayFrames',
    gestureCount,
  );
  const blockedTerminalFrames = requireTerminalHandoffMinimum(
    summary,
    'blockedTerminalFrames',
    8,
  );
  const blockedTerminalOverlayFrames = requireTerminalHandoffInteger(
    summary,
    'blockedTerminalOverlayFrames',
  );
  if (blockedTerminalOverlayFrames !== blockedTerminalFrames) {
    throw new Error(
      'Android terminal drag handoff every blocked post-UP frame must retain the terminal overlay.',
    );
  }
  const blockedTerminalSpanMs = requireTerminalHandoffNumber(
    summary,
    'blockedTerminalSpanMs',
  );
  if (blockedTerminalSpanMs < 100) {
    throw new Error(
      `Android terminal drag handoff blockedTerminalSpanMs must be at least 100; found ${String(blockedTerminalSpanMs)}.`,
    );
  }

  const postTerminalFrames = requireTerminalHandoffMinimum(
    summary,
    'postTerminalFrames',
    gestureCount,
  );
  requireTerminalHandoffExact(
    summary,
    'terminalOutcomeWitnessCount',
    gestureCount,
  );
  const recoveryPostTerminalFrames = requireTerminalHandoffMinimum(
    summary,
    'recoveryPostTerminalFrames',
    3,
  );
  const terminalOverlayFrames = requireTerminalHandoffMinimum(
    summary,
    'terminalOverlayFrames',
    1,
  );
  const pendingSourceGhostFrames = requireTerminalHandoffInteger(
    summary,
    'pendingSourceGhostFrames',
  );
  const pendingCanonicalCrossfadeFrames = requireTerminalHandoffInteger(
    summary,
    'pendingCanonicalCrossfadeFrames',
  );
  const singlePrimaryFrames = requireTerminalHandoffInteger(
    summary,
    'singlePrimaryFrames',
  );
  const pendingTargetFrames = requireTerminalHandoffMinimum(
    summary,
    'pendingTargetFrames',
    acceptedCount,
  );
  const canonicalTransitionFrames = requireTerminalHandoffMinimum(
    summary,
    'canonicalTransitionFrames',
    acceptedCount,
  );
  const canonicalFrames = requireTerminalHandoffMinimum(
    summary,
    'canonicalFrames',
    gestureCount,
  );
  const recoveryTerminalLocationFrames = requireTerminalHandoffInteger(
    summary,
    'recoveryTerminalLocationFrames',
  );
  const recoverySourceLocationFrames = requireTerminalHandoffMinimum(
    summary,
    'recoverySourceLocationFrames',
    recoveryCount,
  );

  for (const field of [
    'acceptedOffTargetFrames',
    'acceptedSourceSnapbackFrames',
    'finalActiveOverlayHosts',
    'finalRetiringOverlayHosts',
    'invalidPrimaryCompositionFrames',
    'overOpacityFrames',
    'recoveryUnexpectedLocationFrames',
    'sourceVisibleWithOverlayFrames',
    'spatialDuplicateFrames',
    'underOpacityFrames',
    'zeroPrimaryFrames',
  ]) {
    requireTerminalHandoffExact(summary, field, 0);
  }
  requireTerminalHandoffExact(summary, 'invalidFrameCount', 0);
  requireTerminalHandoffExact(summary, 'droppedInvalidFrameWitnessCount', 0);
  requireTerminalHandoffExact(summary, 'recoveryFinalCanonicalSourceCount', 3);
  requireTerminalHandoffExact(
    summary,
    'acceptedFinalCanonicalTargetCount',
    acceptedCount,
  );

  for (const [field, value] of [
    ['blockedTerminalFrames', blockedTerminalFrames],
    ['canonicalFrames', canonicalFrames],
    ['canonicalTransitionFrames', canonicalTransitionFrames],
    ['pendingSourceGhostFrames', pendingSourceGhostFrames],
    ['pendingCanonicalCrossfadeFrames', pendingCanonicalCrossfadeFrames],
    ['pendingTargetFrames', pendingTargetFrames],
    ['recoveryPostTerminalFrames', recoveryPostTerminalFrames],
    ['singlePrimaryFrames', singlePrimaryFrames],
    ['terminalOverlayFrames', terminalOverlayFrames],
  ]) {
    if (value > postTerminalFrames) {
      throw new Error(
        `Android terminal drag handoff ${field} cannot exceed postTerminalFrames.`,
      );
    }
  }
  if (
    recoverySourceLocationFrames > recoveryPostTerminalFrames ||
    recoveryTerminalLocationFrames > recoveryPostTerminalFrames
  ) {
    throw new Error(
      'Android terminal drag handoff recovery location counts cannot exceed recoveryPostTerminalFrames.',
    );
  }
  if (
    recoverySourceLocationFrames + recoveryTerminalLocationFrames !==
    recoveryPostTerminalFrames
  ) {
    throw new Error(
      'Android terminal drag handoff source and terminal location counts must cover recoveryPostTerminalFrames.',
    );
  }
  if (postTerminalFrames - recoveryPostTerminalFrames < acceptedCount) {
    throw new Error(
      'Android terminal drag handoff accepted outcomes must each contribute a post-terminal frame.',
    );
  }
  const acceptedPostTerminalFrames =
    postTerminalFrames - recoveryPostTerminalFrames;
  if (pendingCanonicalCrossfadeFrames > acceptedPostTerminalFrames) {
    throw new Error(
      'Android terminal drag handoff pending/canonical crossfades must be confined to accepted outcomes.',
    );
  }
  if (
    singlePrimaryFrames + pendingCanonicalCrossfadeFrames !==
    postTerminalFrames
  ) {
    throw new Error(
      'Android terminal drag handoff exact primary compositions must cover every post-terminal frame.',
    );
  }
  if (activeOverlayFrames < terminalOverlayFrames) {
    throw new Error(
      'Android terminal drag handoff terminalOverlayFrames cannot exceed activeOverlayFrames.',
    );
  }
  if (terminalOverlayFrames < blockedTerminalOverlayFrames) {
    throw new Error(
      'Android terminal drag handoff blockedTerminalOverlayFrames cannot exceed terminalOverlayFrames.',
    );
  }

  return summary;
}

export function parseAndroidTerminalDragHandoff(logcat) {
  const summary = decodeAndroidTerminalDragHandoff(logcat);
  return validateAndroidTerminalDragHandoffContinuity(summary);
}

export function buildAndroidTerminalDragHandoffEvidence(logcat) {
  let summary;
  try {
    summary = decodeAndroidTerminalDragHandoff(logcat);
  } catch (error) {
    return {
      error: error instanceof Error ? error.message : String(error),
      required: true,
      summary: null,
    };
  }
  try {
    validateAndroidTerminalDragHandoffContinuity(summary);
    return { error: null, required: true, summary };
  } catch (error) {
    return {
      error: error instanceof Error ? error.message : String(error),
      required: true,
      summary,
    };
  }
}

export function targetsAndroidTerminalDragHandoffTest(testClass) {
  const [className] = testClass.trim().split('#', 1);
  return className === androidTerminalDragHandoffTestClass;
}

export function buildAndroidTerminalDragHandoffGateEvidence(testClass, logcat) {
  return targetsAndroidTerminalDragHandoffTest(testClass)
    ? buildAndroidTerminalDragHandoffEvidence(logcat)
    : {
        error: null,
        required: false,
        summary: null,
      };
}

function requireFiniteNumber(value, label) {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new Error(
      `Android drag performance ${label} must be a finite number.`,
    );
  }
  return value;
}

function requireNonNegativeInteger(value, label) {
  const number = requireFiniteNumber(value, label);
  if (!Number.isInteger(number) || number < 0) {
    throw new Error(
      `Android drag performance ${label} must be a non-negative integer.`,
    );
  }
  return number;
}

function requireNonNegativeNumber(value, label) {
  const number = requireFiniteNumber(value, label);
  if (number < 0) {
    throw new Error(`Android drag performance ${label} must be non-negative.`);
  }
  return number;
}

function requireBoolean(value, label) {
  if (typeof value !== 'boolean') {
    throw new Error(`Android drag performance ${label} must be a boolean.`);
  }
  return value;
}

function parsePositiveSafeInteger(value, label) {
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed <= 0) {
    throw new Error(
      `Android drag performance chunk ${label} must be a positive safe integer.`,
    );
  }
  return parsed;
}

function reassembleAndroidDragPerformanceChunks(chunkPayloads) {
  const chunks = chunkPayloads.map((payload, index) => {
    const match = dragPerformanceChunkEnvelopePattern.exec(payload);
    if (match === null) {
      throw new Error(
        `Android drag performance chunk ${String(index + 1)} has a malformed envelope.`,
      );
    }
    const [
      ,
      versionText,
      recordId,
      checksum,
      partText,
      countText,
      bytesText,
      data,
    ] = match;
    return {
      byteLength: parsePositiveSafeInteger(bytesText, 'byte length'),
      checksum,
      count: parsePositiveSafeInteger(countText, 'count'),
      data,
      part: parsePositiveSafeInteger(partText, 'part'),
      recordId,
      version: parsePositiveSafeInteger(versionText, 'version'),
    };
  });
  const first = chunks[0];
  if (first.version !== dragPerformanceLogTransportVersion) {
    throw new Error(
      `Android drag performance chunk transport version must equal ${String(dragPerformanceLogTransportVersion)}.`,
    );
  }
  if (first.recordId !== first.checksum.slice(0, first.recordId.length)) {
    throw new Error(
      'Android drag performance chunk record id is inconsistent with its checksum.',
    );
  }
  if (chunks.length !== first.count) {
    throw new Error(
      `Android drag performance chunk count is incomplete or duplicated; expected ${String(first.count)}, found ${String(chunks.length)}.`,
    );
  }

  for (const [index, chunk] of chunks.entries()) {
    if (
      chunk.version !== first.version ||
      chunk.recordId !== first.recordId ||
      chunk.checksum !== first.checksum ||
      chunk.count !== first.count ||
      chunk.byteLength !== first.byteLength
    ) {
      throw new Error(
        `Android drag performance chunk ${String(index + 1)} does not belong to the same logical record.`,
      );
    }
    if (chunk.part !== index + 1) {
      throw new Error(
        `Android drag performance chunks are out of order at chunk ${String(index + 1)}; found part ${String(chunk.part)}.`,
      );
    }
  }

  const encodedPayload = chunks.map((chunk) => chunk.data).join('');
  const decodedPayload = Buffer.from(encodedPayload, 'base64');
  if (decodedPayload.toString('base64') !== encodedPayload) {
    throw new Error(
      'Android drag performance chunk payload is not canonical Base64.',
    );
  }
  if (decodedPayload.length !== first.byteLength) {
    throw new Error(
      `Android drag performance chunk byte length mismatch; expected ${String(first.byteLength)}, found ${String(decodedPayload.length)}.`,
    );
  }
  const actualChecksum = createHash('sha256')
    .update(decodedPayload)
    .digest('hex');
  if (actualChecksum !== first.checksum) {
    throw new Error('Android drag performance chunk checksum mismatch.');
  }
  const payload = decodedPayload.toString('utf8');
  if (!Buffer.from(payload, 'utf8').equals(decodedPayload)) {
    throw new Error(
      'Android drag performance chunk payload is not valid UTF-8.',
    );
  }
  return payload;
}

function extractAndroidDragPerformancePayload(logcat) {
  const directPayloads = [];
  const chunkPayloads = [];
  for (const line of logcat.split(/\r?\n/u)) {
    const chunkMarkerIndex = line.indexOf(dragPerformanceChunkLogPrefix);
    if (chunkMarkerIndex >= 0) {
      chunkPayloads.push(
        line
          .slice(chunkMarkerIndex + dragPerformanceChunkLogPrefix.length)
          .trim(),
      );
      continue;
    }
    const markerIndex = line.indexOf(dragPerformanceLogPrefix);
    if (markerIndex >= 0) {
      directPayloads.push(
        line.slice(markerIndex + dragPerformanceLogPrefix.length).trim(),
      );
    }
  }

  if (chunkPayloads.length > 0) {
    if (directPayloads.length > 0) {
      throw new Error(
        'Expected exactly one CHESSBOARD_DRAG_PERF logical record; found both direct and chunked records.',
      );
    }
    return reassembleAndroidDragPerformanceChunks(chunkPayloads);
  }
  if (directPayloads.length !== 1) {
    throw new Error(
      `Expected exactly one ${dragPerformanceLogPrefix.trim()} record; found ${String(directPayloads.length)}.`,
    );
  }
  return directPayloads[0];
}

class AndroidDragPerformanceThresholdError extends Error {
  constructor(violations, summary) {
    super(violations.map((violation) => violation.message).join('\n'));
    this.name = 'AndroidDragPerformanceThresholdError';
    this.summary = summary;
    this.violations = violations;
  }
}

function performanceViolation({
  code,
  message,
  metric,
  observed,
  run = null,
  threshold,
}) {
  return {
    code,
    message,
    metric,
    observed,
    run,
    threshold,
  };
}

export function evaluateAndroidDragPerformance(logcat) {
  const payload = extractAndroidDragPerformancePayload(logcat);
  const violations = [];

  let summary;
  try {
    summary = JSON.parse(payload);
  } catch (error) {
    throw new Error(
      `Android drag performance record is malformed JSON: ${error instanceof Error ? error.message : String(error)}`,
      { cause: error },
    );
  }
  if (
    summary === null ||
    typeof summary !== 'object' ||
    Array.isArray(summary)
  ) {
    throw new Error('Android drag performance record must be an object.');
  }
  if (summary.schemaVersion !== 4) {
    throw new Error('Android drag performance schemaVersion must equal 4.');
  }
  const refreshRate = requireFiniteNumber(
    summary.displayRefreshHz,
    'displayRefreshHz',
  );
  if (
    refreshRate < dragPerformanceThresholds.minimumRefreshRateHz ||
    refreshRate > dragPerformanceThresholds.maximumRefreshRateHz
  ) {
    violations.push(
      performanceViolation({
        code: 'display-refresh-rate',
        message: `Android drag performance display refresh ${String(refreshRate)} Hz is outside 59.5–60.5 Hz.`,
        metric: 'displayRefreshHz',
        observed: refreshRate,
        threshold: {
          maximum: dragPerformanceThresholds.maximumRefreshRateHz,
          minimum: dragPerformanceThresholds.minimumRefreshRateHz,
        },
      }),
    );
  }
  const expectedFrameDurationMs = requireNonNegativeNumber(
    summary.expectedFrameDurationMs,
    'expectedFrameDurationMs',
  );
  const derivedFrameDurationMs = 1_000 / refreshRate;
  if (
    Math.abs(expectedFrameDurationMs - derivedFrameDurationMs) >
    dragPerformanceThresholds.expectedFrameDurationToleranceMs
  ) {
    throw new Error(
      'Android drag performance expectedFrameDurationMs is inconsistent with displayRefreshHz.',
    );
  }
  const jankHeuristicMultiplier = requireNonNegativeNumber(
    summary.jankHeuristicMultiplier,
    'jankHeuristicMultiplier',
  );
  if (
    jankHeuristicMultiplier !==
    dragPerformanceThresholds.jankHeuristicMultiplier
  ) {
    throw new Error(
      'Android drag performance jankHeuristicMultiplier must equal 2.',
    );
  }
  if (!Array.isArray(summary.runs)) {
    throw new Error('Android drag performance runs must be an array.');
  }
  if (summary.runs.length !== dragPerformanceThresholds.measuredRunCount) {
    throw new Error(
      `Android drag performance must contain ${String(dragPerformanceThresholds.measuredRunCount)} runs; found ${String(summary.runs.length)}.`,
    );
  }

  for (const [index, run] of summary.runs.entries()) {
    if (run === null || typeof run !== 'object' || Array.isArray(run)) {
      throw new Error(
        `Android drag performance run ${String(index + 1)} must be an object.`,
      );
    }
    const runNumber = requireNonNegativeInteger(
      run.run,
      `run ${String(index + 1)} number`,
    );
    const successfulMoves = requireNonNegativeInteger(
      run.successfulMoves,
      `run ${String(index + 1)} successfulMoves`,
    );
    const inputSpanMs = requireNonNegativeInteger(
      run.inputSpanMs,
      `run ${String(index + 1)} inputSpanMs`,
    );
    const measurementSpanMs = requireNonNegativeInteger(
      run.measurementSpanMs,
      `run ${String(index + 1)} measurementSpanMs`,
    );
    const invalidMetrics = requireNonNegativeInteger(
      run.invalidMetrics,
      `run ${String(index + 1)} invalidMetrics`,
    );
    const callbackCount = requireNonNegativeInteger(
      run.callbackCount,
      `run ${String(index + 1)} callbackCount`,
    );
    const duplicateMetrics = requireNonNegativeInteger(
      run.duplicateMetrics,
      `run ${String(index + 1)} duplicateMetrics`,
    );
    const duplicatePayloadMismatchCount = requireNonNegativeInteger(
      run.duplicatePayloadMismatchCount,
      `run ${String(index + 1)} duplicatePayloadMismatchCount`,
    );
    const outOfWindowMetrics = requireNonNegativeInteger(
      run.outOfWindowMetrics,
      `run ${String(index + 1)} outOfWindowMetrics`,
    );
    const frameCount = requireNonNegativeInteger(
      run.frameCount,
      `run ${String(index + 1)} frameCount`,
    );
    const intendedVsyncSpanMs = requireNonNegativeNumber(
      run.intendedVsyncSpanMs,
      `run ${String(index + 1)} intendedVsyncSpanMs`,
    );
    const activationLatencyMs = requireNonNegativeNumber(
      run.activationLatencyMs,
      `run ${String(index + 1)} activationLatencyMs`,
    );
    const finalMoveLatencyMs = requireNonNegativeNumber(
      run.finalMoveLatencyMs,
      `run ${String(index + 1)} finalMoveLatencyMs`,
    );
    const expectedVsyncSlots = requireNonNegativeInteger(
      run.expectedVsyncSlots,
      `run ${String(index + 1)} expectedVsyncSlots`,
    );
    const missedVsyncSlots = requireNonNegativeInteger(
      run.missedVsyncSlots,
      `run ${String(index + 1)} missedVsyncSlots`,
    );
    const deliveryPercent = requireNonNegativeNumber(
      run.deliveryPercent,
      `run ${String(index + 1)} deliveryPercent`,
    );
    const p95VsyncGapMs = requireNonNegativeNumber(
      run.p95VsyncGapMs,
      `run ${String(index + 1)} p95VsyncGapMs`,
    );
    const p99VsyncGapMs = requireNonNegativeNumber(
      run.p99VsyncGapMs,
      `run ${String(index + 1)} p99VsyncGapMs`,
    );
    const worstSustainedVsyncGapMs = requireNonNegativeNumber(
      run.worstSustainedVsyncGapMs,
      `run ${String(index + 1)} worstSustainedVsyncGapMs`,
    );
    const p95UiDurationMs = requireNonNegativeNumber(
      run.p95UiDurationMs,
      `run ${String(index + 1)} p95UiDurationMs`,
    );
    const p99UiDurationMs = requireNonNegativeNumber(
      run.p99UiDurationMs,
      `run ${String(index + 1)} p99UiDurationMs`,
    );
    const worstUiDurationMs = requireNonNegativeNumber(
      run.worstUiDurationMs,
      `run ${String(index + 1)} worstUiDurationMs`,
    );
    const heuristicJankCount = requireNonNegativeInteger(
      run.heuristicJankCount,
      `run ${String(index + 1)} heuristicJankCount`,
    );
    const heuristicJankPercent = requireNonNegativeNumber(
      run.heuristicJankPercent,
      `run ${String(index + 1)} heuristicJankPercent`,
    );
    const p95TotalDurationMs = requireNonNegativeNumber(
      run.p95TotalDurationMs,
      `run ${String(index + 1)} p95TotalDurationMs`,
    );
    const p99TotalDurationMs = requireNonNegativeNumber(
      run.p99TotalDurationMs,
      `run ${String(index + 1)} p99TotalDurationMs`,
    );
    const worstTotalDurationMs = requireNonNegativeNumber(
      run.worstTotalDurationMs,
      `run ${String(index + 1)} worstTotalDurationMs`,
    );
    const deadlinePlausible = requireBoolean(
      run.deadlinePlausible,
      `run ${String(index + 1)} deadlinePlausible`,
    );
    const implausibleDeadlineCount = requireNonNegativeInteger(
      run.implausibleDeadlineCount,
      `run ${String(index + 1)} implausibleDeadlineCount`,
    );
    const minimumDeadlineMs = requireFiniteNumber(
      run.minimumDeadlineMs,
      `run ${String(index + 1)} minimumDeadlineMs`,
    );
    const p50DeadlineMs = requireFiniteNumber(
      run.p50DeadlineMs,
      `run ${String(index + 1)} p50DeadlineMs`,
    );
    const p95DeadlineMs = requireFiniteNumber(
      run.p95DeadlineMs,
      `run ${String(index + 1)} p95DeadlineMs`,
    );
    const maximumDeadlineMs = requireFiniteNumber(
      run.maximumDeadlineMs,
      `run ${String(index + 1)} maximumDeadlineMs`,
    );
    const droppedReports = requireNonNegativeInteger(
      run.droppedReports,
      `run ${String(index + 1)} droppedReports`,
    );
    if (runNumber !== index + 1) {
      throw new Error(
        `Android drag performance run ${String(index + 1)} is misnumbered.`,
      );
    }
    if (successfulMoves !== dragPerformanceThresholds.measuredMoveCount) {
      violations.push(
        performanceViolation({
          code: 'successful-move-count',
          message: `Android drag performance run ${String(index + 1)} did not deliver ${String(dragPerformanceThresholds.measuredMoveCount)} moves.`,
          metric: 'successfulMoves',
          observed: successfulMoves,
          run: runNumber,
          threshold: dragPerformanceThresholds.measuredMoveCount,
        }),
      );
    }
    if (
      inputSpanMs < dragPerformanceThresholds.minimumInputSpanMs ||
      inputSpanMs > dragPerformanceThresholds.maximumInputSpanMs
    ) {
      violations.push(
        performanceViolation({
          code: 'input-span',
          message: `Android drag performance run ${String(index + 1)} input span is out of range.`,
          metric: 'inputSpanMs',
          observed: inputSpanMs,
          run: runNumber,
          threshold: {
            maximum: dragPerformanceThresholds.maximumInputSpanMs,
            minimum: dragPerformanceThresholds.minimumInputSpanMs,
          },
        }),
      );
    }
    if (
      measurementSpanMs < dragPerformanceThresholds.minimumMeasurementSpanMs ||
      measurementSpanMs > dragPerformanceThresholds.maximumMeasurementSpanMs
    ) {
      violations.push(
        performanceViolation({
          code: 'measurement-span',
          message: `Android drag performance run ${String(index + 1)} measurement span is out of range.`,
          metric: 'measurementSpanMs',
          observed: measurementSpanMs,
          run: runNumber,
          threshold: {
            maximum: dragPerformanceThresholds.maximumMeasurementSpanMs,
            minimum: dragPerformanceThresholds.minimumMeasurementSpanMs,
          },
        }),
      );
    }
    if (
      intendedVsyncSpanMs <= 0 ||
      Math.abs(intendedVsyncSpanMs - measurementSpanMs) > 1.1
    ) {
      throw new Error(
        `Android drag performance run ${String(index + 1)} intended-vsync span is inconsistent with its measurement window.`,
      );
    }
    if (
      activationLatencyMs > measurementSpanMs + 1 ||
      finalMoveLatencyMs > measurementSpanMs + 1 ||
      worstSustainedVsyncGapMs > measurementSpanMs + 1
    ) {
      throw new Error(
        `Android drag performance run ${String(index + 1)} has latency diagnostics outside its measurement window.`,
      );
    }
    if (
      frameCount < dragPerformanceThresholds.minimumFrameCount ||
      frameCount > dragPerformanceThresholds.maximumFrameCount
    ) {
      violations.push(
        performanceViolation({
          code: 'frame-count',
          message: `Android drag performance run ${String(index + 1)} collected a frame count outside the cadence range.`,
          metric: 'frameCount',
          observed: frameCount,
          run: runNumber,
          threshold: {
            maximum: dragPerformanceThresholds.maximumFrameCount,
            minimum: dragPerformanceThresholds.minimumFrameCount,
          },
        }),
      );
    }
    if (
      callbackCount !==
      frameCount + duplicateMetrics + outOfWindowMetrics + invalidMetrics
    ) {
      throw new Error(
        `Android drag performance run ${String(index + 1)} has inconsistent callback accounting.`,
      );
    }
    if (duplicatePayloadMismatchCount > duplicateMetrics) {
      throw new Error(
        `Android drag performance run ${String(index + 1)} has more duplicate payload mismatches than duplicates.`,
      );
    }
    if (expectedVsyncSlots !== frameCount + missedVsyncSlots) {
      throw new Error(
        `Android drag performance run ${String(index + 1)} has inconsistent vsync slot accounting.`,
      );
    }
    const nominalWindowSlots = Math.max(
      1,
      Math.round(measurementSpanMs / expectedFrameDurationMs),
    );
    if (
      expectedVsyncSlots < frameCount ||
      expectedVsyncSlots < nominalWindowSlots
    ) {
      throw new Error(
        `Android drag performance run ${String(index + 1)} does not cover its complete measurement window.`,
      );
    }
    const derivedDeliveryPercent = (frameCount * 100) / expectedVsyncSlots;
    if (Math.abs(deliveryPercent - derivedDeliveryPercent) > 0.001) {
      throw new Error(
        `Android drag performance run ${String(index + 1)} has an inconsistent delivery percentage.`,
      );
    }
    if (deliveryPercent < dragPerformanceThresholds.minimumDeliveryPercent) {
      violations.push(
        performanceViolation({
          code: 'vsync-delivery',
          message: `Android drag performance run ${String(index + 1)} delivered less than 95% of expected vsync slots.`,
          metric: 'deliveryPercent',
          observed: deliveryPercent,
          run: runNumber,
          threshold: dragPerformanceThresholds.minimumDeliveryPercent,
        }),
      );
    }
    if (!(
      p95VsyncGapMs <= p99VsyncGapMs &&
      p99VsyncGapMs <= worstSustainedVsyncGapMs
    )) {
      throw new Error(
        `Android drag performance run ${String(index + 1)} has inconsistent vsync gap percentiles.`,
      );
    }
    if (
      activationLatencyMs >=
      dragPerformanceThresholds.maximumActivationLatencyMs
    ) {
      violations.push(
        performanceViolation({
          code: 'activation-latency',
          message: `Android drag performance run ${String(index + 1)} had activation latency at or above ${String(dragPerformanceThresholds.maximumActivationLatencyMs)} ms.`,
          metric: 'activationLatencyMs',
          observed: activationLatencyMs,
          run: runNumber,
          threshold: dragPerformanceThresholds.maximumActivationLatencyMs,
        }),
      );
    }
    if (
      finalMoveLatencyMs >= dragPerformanceThresholds.maximumFinalMoveLatencyMs
    ) {
      violations.push(
        performanceViolation({
          code: 'final-move-latency',
          message: `Android drag performance run ${String(index + 1)} had final-move latency at or above 50 ms.`,
          metric: 'finalMoveLatencyMs',
          observed: finalMoveLatencyMs,
          run: runNumber,
          threshold: dragPerformanceThresholds.maximumFinalMoveLatencyMs,
        }),
      );
    }
    if (
      worstSustainedVsyncGapMs >=
      dragPerformanceThresholds.maximumSustainedVsyncGapMs
    ) {
      violations.push(
        performanceViolation({
          code: 'sustained-vsync-gap',
          message: `Android drag performance run ${String(index + 1)} contained a sustained vsync gap at or above 50 ms.`,
          metric: 'worstSustainedVsyncGapMs',
          observed: worstSustainedVsyncGapMs,
          run: runNumber,
          threshold: dragPerformanceThresholds.maximumSustainedVsyncGapMs,
        }),
      );
    }
    if (!(
      p95UiDurationMs <= p99UiDurationMs && p99UiDurationMs <= worstUiDurationMs
    )) {
      throw new Error(
        `Android drag performance run ${String(index + 1)} has inconsistent UI-duration percentiles.`,
      );
    }
    const derivedHeuristicJankPercent =
      frameCount === 0 ? 0 : (heuristicJankCount * 100) / frameCount;
    if (Math.abs(heuristicJankPercent - derivedHeuristicJankPercent) > 0.001) {
      throw new Error(
        `Android drag performance run ${String(index + 1)} has an inconsistent heuristic jank percentage.`,
      );
    }
    if (heuristicJankCount !== 0) {
      violations.push(
        performanceViolation({
          code: 'heuristic-ui-jank',
          message: `Android drag performance run ${String(index + 1)} reported heuristic UI jank.`,
          metric: 'heuristicJankCount',
          observed: heuristicJankCount,
          run: runNumber,
          threshold: 0,
        }),
      );
    }
    const worstUiDurationIsJanky =
      worstUiDurationMs > expectedFrameDurationMs * jankHeuristicMultiplier;
    if (heuristicJankCount > 0 !== worstUiDurationIsJanky) {
      throw new Error(
        `Android drag performance run ${String(index + 1)} has UI duration inconsistent with its heuristic jank count.`,
      );
    }
    if (!(
      p95TotalDurationMs <= p99TotalDurationMs &&
      p99TotalDurationMs <= worstTotalDurationMs
    )) {
      throw new Error(
        `Android drag performance run ${String(index + 1)} has inconsistent total-duration percentiles.`,
      );
    }
    if (
      worstTotalDurationMs >= dragPerformanceThresholds.maximumTotalDurationMs
    ) {
      violations.push(
        performanceViolation({
          code: 'total-frame-duration',
          message: `Android drag performance run ${String(index + 1)} contained a total-duration frame at or above 50 ms.`,
          metric: 'worstTotalDurationMs',
          observed: worstTotalDurationMs,
          run: runNumber,
          threshold: dragPerformanceThresholds.maximumTotalDurationMs,
        }),
      );
    }
    if (implausibleDeadlineCount > frameCount) {
      throw new Error(
        `Android drag performance run ${String(index + 1)} has too many implausible deadline metrics.`,
      );
    }
    if (deadlinePlausible !== (implausibleDeadlineCount === 0)) {
      throw new Error(
        `Android drag performance run ${String(index + 1)} has inconsistent deadline plausibility diagnostics.`,
      );
    }
    if (!(
      minimumDeadlineMs <= p50DeadlineMs &&
      p50DeadlineMs <= p95DeadlineMs &&
      p95DeadlineMs <= maximumDeadlineMs
    )) {
      throw new Error(
        `Android drag performance run ${String(index + 1)} has inconsistent deadline diagnostics.`,
      );
    }
    const deadlineExtremaArePlausible =
      minimumDeadlineMs > 0 &&
      maximumDeadlineMs <=
        expectedFrameDurationMs *
          dragPerformanceThresholds.maximumPlausibleDeadlinePeriods;
    if (deadlinePlausible !== deadlineExtremaArePlausible) {
      throw new Error(
        `Android drag performance run ${String(index + 1)} has deadline extrema inconsistent with its plausibility diagnostic.`,
      );
    }
    if (droppedReports !== 0) {
      violations.push(
        performanceViolation({
          code: 'dropped-frame-reports',
          message: `Android drag performance run ${String(index + 1)} dropped frame reports.`,
          metric: 'droppedReports',
          observed: droppedReports,
          run: runNumber,
          threshold: 0,
        }),
      );
    }
    if (invalidMetrics !== 0) {
      violations.push(
        performanceViolation({
          code: 'invalid-frame-metrics',
          message: `Android drag performance run ${String(index + 1)} contained invalid frame metrics.`,
          metric: 'invalidMetrics',
          observed: invalidMetrics,
          run: runNumber,
          threshold: 0,
        }),
      );
    }
    if (duplicatePayloadMismatchCount !== 0) {
      violations.push(
        performanceViolation({
          code: 'duplicate-payload-mismatch',
          message: `Android drag performance run ${String(index + 1)} contained mismatched duplicate payloads.`,
          metric: 'duplicatePayloadMismatchCount',
          observed: duplicatePayloadMismatchCount,
          run: runNumber,
          threshold: 0,
        }),
      );
    }
  }
  return { summary, violations };
}

export function parseAndroidDragPerformance(logcat) {
  const evaluation = evaluateAndroidDragPerformance(logcat);
  if (evaluation.violations.length > 0) {
    throw new AndroidDragPerformanceThresholdError(
      evaluation.violations,
      evaluation.summary,
    );
  }
  return evaluation.summary;
}

export function buildAndroidDragPerformanceEvidence(logcat) {
  try {
    const evaluation = evaluateAndroidDragPerformance(logcat);
    return {
      error:
        evaluation.violations.length === 0
          ? null
          : evaluation.violations
              .map((violation) => violation.message)
              .join('\n'),
      required: true,
      summary: evaluation.summary,
      violations: evaluation.violations,
    };
  } catch (error) {
    return {
      error: error instanceof Error ? error.message : String(error),
      required: true,
      summary: null,
      violations: [],
    };
  }
}

function resolveAdbExecutable(environment) {
  const explicitAdb = environment.ADB?.trim();
  if (explicitAdb) return explicitAdb;

  const androidHome = environment.ANDROID_HOME?.trim();
  if (androidHome) {
    const sdkAdb = path.join(androidHome, 'platform-tools', 'adb');
    if (existsSync(sdkAdb)) return sdkAdb;
  }
  return 'adb';
}

function readDeviceProperty(adb, serial, property) {
  return runCaptured(adb, adbArguments(serial, 'shell', 'getprop', property));
}

async function startLogcatCapture({ adb, logPath, serial }) {
  const logFileDescriptor = openSync(logPath, 'w');
  const child = spawn(
    adb,
    adbArguments(serial, 'logcat', '-b', 'all', '-v', 'threadtime'),
    {
      stdio: ['ignore', logFileDescriptor, logFileDescriptor],
    },
  );
  const closed = once(child, 'close');
  const capture = {
    child,
    closed,
    logFileDescriptor,
    prematureExit: null,
    stopping: false,
  };
  child.once('close', (exitCode, signalCode) => {
    if (!capture.stopping) {
      capture.prematureExit = { exitCode, signalCode };
    }
  });

  try {
    await Promise.race([
      once(child, 'spawn'),
      once(child, 'error').then(([error]) => Promise.reject(error)),
    ]);
  } catch (error) {
    closeSync(logFileDescriptor);
    throw error;
  }

  return capture;
}

async function stopLogcatCapture(capture) {
  const alreadyExited =
    capture.child.exitCode !== null || capture.child.signalCode !== null;
  if (alreadyExited && capture.prematureExit === null) {
    capture.prematureExit = {
      exitCode: capture.child.exitCode,
      signalCode: capture.child.signalCode,
    };
  }
  capture.stopping = true;
  if (capture.child.exitCode === null && capture.child.signalCode === null) {
    capture.child.kill('SIGINT');
    const stopped = await Promise.race([
      capture.closed.then(() => true),
      delay(2_000).then(() => false),
    ]);
    if (!stopped) {
      capture.child.kill('SIGKILL');
      await capture.closed;
    }
  }
  closeSync(capture.logFileDescriptor);
  return capture.prematureExit;
}

function sha256(contents) {
  return createHash('sha256').update(contents).digest('hex');
}

export function buildSourceEvidence({
  commit,
  status,
  trackedDiff,
  untrackedFiles = [],
}) {
  const normalizedStatus = status.trim();
  const trackedDiffBytes = Buffer.isBuffer(trackedDiff)
    ? trackedDiff
    : Buffer.from(trackedDiff);
  const sortedUntrackedFiles = [...untrackedFiles].sort((left, right) =>
    left.path.localeCompare(right.path),
  );
  const untrackedBytes = Buffer.concat(
    sortedUntrackedFiles.flatMap((file) => [
      Buffer.from(file.path),
      Buffer.from([0]),
      Buffer.isBuffer(file.contents)
        ? file.contents
        : Buffer.from(file.contents),
      Buffer.from([0]),
    ]),
  );
  return {
    commit,
    dirty: normalizedStatus.length > 0,
    status: normalizedStatus,
    trackedDiffSha256: sha256(trackedDiffBytes),
    untrackedFileCount: sortedUntrackedFiles.length,
    untrackedFilesSha256: sha256(untrackedBytes),
    worktreeSha256: sha256(
      Buffer.concat([
        Buffer.from(commit),
        Buffer.from([0]),
        trackedDiffBytes,
        Buffer.from([0]),
        untrackedBytes,
      ]),
    ),
  };
}

function readUntrackedFiles() {
  const paths = runCapturedBytes(
    'git',
    ['ls-files', '--others', '--exclude-standard', '-z'],
    { cwd: repositoryRoot },
  )
    .toString('utf8')
    .split('\0')
    .filter(Boolean);
  return paths.map((relativePath) => ({
    contents: readFileSync(path.resolve(repositoryRoot, relativePath)),
    path: relativePath,
  }));
}

function readSourceEvidence() {
  return buildSourceEvidence({
    commit: runCaptured('git', ['rev-parse', 'HEAD'], {
      cwd: repositoryRoot,
    }),
    status: runCaptured(
      'git',
      ['status', '--porcelain=v1', '--untracked-files=all'],
      { cwd: repositoryRoot },
    ),
    trackedDiff: runCapturedBytes(
      'git',
      ['diff', '--binary', '--no-ext-diff', 'HEAD'],
      { cwd: repositoryRoot },
    ),
    untrackedFiles: readUntrackedFiles(),
  });
}

export function didSourceEvidenceChange(before, after) {
  return (
    before.commit !== after.commit ||
    before.status !== after.status ||
    before.trackedDiffSha256 !== after.trackedDiffSha256 ||
    before.untrackedFileCount !== after.untrackedFileCount ||
    before.untrackedFilesSha256 !== after.untrackedFilesSha256 ||
    before.worktreeSha256 !== after.worktreeSha256
  );
}

export function didAndroidFabricGatePass({
  findings,
  gradleError,
  gradleExitCode,
  handoffError = null,
  logcatPrematureExit,
  performanceError = null,
  sourceChangedDuringRun = false,
}) {
  return (
    gradleError === null &&
    gradleExitCode === 0 &&
    findings.length === 0 &&
    logcatPrematureExit === null &&
    handoffError === null &&
    performanceError === null &&
    !sourceChangedDuringRun
  );
}

function printFindings(findings) {
  const shown = findings.slice(0, 20);
  for (const finding of shown) {
    process.stderr.write(
      `  ${finding.signature} at logcat line ${String(finding.line)}\n` +
        `    ${finding.evidence}\n`,
    );
  }
  if (findings.length > shown.length) {
    process.stderr.write(
      `  ... ${String(findings.length - shown.length)} more finding(s); inspect the complete log.\n`,
    );
  }
}

export async function main(environment = process.env) {
  const adb = resolveAdbExecutable(environment);
  const devicesOutput = runCaptured(adb, ['devices', '-l']);
  const device = selectAndroidDevice(devicesOutput, environment.ANDROID_SERIAL);
  const serial = device.serial;
  const testClass = resolveAndroidInstrumentationTest(environment);
  const gradleArguments = buildGradleArguments(testClass);
  const evidenceDirectory = path.resolve(
    environment.ANDROID_FABRIC_DRAG_EVIDENCE_DIR?.trim() ||
      defaultEvidenceDirectory,
  );
  const logPath = path.join(evidenceDirectory, 'logcat.txt');
  const resultPath = path.join(evidenceDirectory, 'result.json');
  const startedAt = new Date().toISOString();

  mkdirSync(evidenceDirectory, { recursive: true });
  runCaptured(adb, adbArguments(serial, 'get-state'));
  const deviceEvidence = {
    abi: readDeviceProperty(adb, serial, 'ro.product.cpu.abi'),
    androidRelease: readDeviceProperty(adb, serial, 'ro.build.version.release'),
    apiLevel: readDeviceProperty(adb, serial, 'ro.build.version.sdk'),
    kind: classifyAndroidDeviceKind(
      readDeviceProperty(adb, serial, 'ro.kernel.qemu'),
    ),
    manufacturer: readDeviceProperty(adb, serial, 'ro.product.manufacturer'),
    model: readDeviceProperty(adb, serial, 'ro.product.model'),
    serial,
  };
  requirePhysicalAndroidDevice(deviceEvidence.kind, environment);
  const source = readSourceEvidence();

  process.stdout.write(
    [
      `Android Fabric drag gate: ${deviceEvidence.manufacturer} ${deviceEvidence.model}`,
      `Serial: ${serial}`,
      `Android: ${deviceEvidence.androidRelease} (API ${deviceEvidence.apiLevel}, ${deviceEvidence.abi}, ${deviceEvidence.kind})`,
      `Instrumentation: ${testClass}`,
      `Source: ${source.commit}${source.dirty ? ` + worktree ${source.worktreeSha256}` : ''}`,
      `Logcat evidence: ${logPath}`,
      '',
    ].join('\n'),
  );

  // Metro sources live outside the generated Android project. Remove only the
  // generated Release bundle so Gradle cannot reuse JavaScript from a previous
  // package source tree while still retaining native build caches.
  rmSync(releaseBundleOutputDirectory, { force: true, recursive: true });
  runCaptured(adb, adbArguments(serial, 'logcat', '-b', 'all', '-c'));
  const capture = await startLogcatCapture({ adb, logPath, serial });
  await delay(250);

  let gradleResult;
  let logcatPrematureExit;
  try {
    gradleResult = spawnSync('./gradlew', gradleArguments, {
      cwd: androidRoot,
      env: { ...environment, ANDROID_SERIAL: serial },
      stdio: 'inherit',
    });
  } finally {
    logcatPrematureExit = await stopLogcatCapture(capture);
  }

  const logcat = readFileSync(logPath, 'utf8');
  const sourceAtFinish = readSourceEvidence();
  const sourceChangedDuringRun = didSourceEvidenceChange(
    source,
    sourceAtFinish,
  );
  const findings = scanAndroidFabricFailures(logcat);
  const gradleError = gradleResult?.error?.message ?? null;
  const gradleExitCode = gradleResult?.status ?? null;
  const performanceRequired = testClass === androidDragPerformanceTest;
  const performance = performanceRequired
    ? buildAndroidDragPerformanceEvidence(logcat)
    : {
        error: null,
        required: false,
        summary: null,
        violations: [],
      };
  const performanceError = performance.error;
  const terminalHandoff = buildAndroidTerminalDragHandoffGateEvidence(
    testClass,
    logcat,
  );
  const handoffError = terminalHandoff.error;
  const passed = didAndroidFabricGatePass({
    findings,
    gradleError,
    gradleExitCode,
    handoffError,
    logcatPrematureExit,
    performanceError,
    sourceChangedDuringRun,
  });
  const result = {
    schemaVersion: 4,
    status: passed ? 'passed' : 'failed',
    source,
    sourceAtFinish,
    sourceChangedDuringRun,
    startedAt,
    finishedAt: new Date().toISOString(),
    device: deviceEvidence,
    instrumentation: {
      gradleError,
      gradleExitCode,
      task: gradleArguments[0],
      testClass,
    },
    terminalHandoff,
    performance,
    logcat: {
      capturePrematureExit: logcatPrematureExit,
      findingCount: findings.length,
      findings,
      path: logPath,
      sha256: sha256(logcat),
    },
  };
  writeFileSync(resultPath, `${JSON.stringify(result, null, 2)}\n`);

  process.stdout.write(
    `Fabric drag gate result: ${result.status.toUpperCase()}\n` +
      `Machine-readable evidence: ${resultPath}\n`,
  );

  if (findings.length > 0) {
    process.stderr.write(
      `Detected ${String(findings.length)} Fabric/Reanimated failure signature(s):\n`,
    );
    printFindings(findings);
  }
  if (!passed) {
    const instrumentationFailure =
      gradleError ??
      (gradleExitCode === 0
        ? null
        : `Gradle instrumentation exited with ${String(gradleExitCode)}`);
    const logcatFailure =
      logcatPrematureExit === null
        ? null
        : `adb logcat exited before instrumentation completed (${JSON.stringify(logcatPrematureExit)}).`;
    const sourceFailure = sourceChangedDuringRun
      ? 'Repository source changed while the Android Fabric drag gate was running.'
      : null;
    throw new Error(
      [
        instrumentationFailure,
        logcatFailure,
        sourceFailure,
        findings.length > 0
          ? 'Android Fabric/Reanimated logcat gate failed.'
          : null,
        handoffError,
        performanceError,
        `Inspect ${logPath} and ${resultPath}.`,
      ]
        .filter(Boolean)
        .join('\n'),
    );
  }
}

const entryPath = process.argv[1];
if (
  entryPath !== undefined &&
  pathToFileURL(path.resolve(entryPath)).href === import.meta.url
) {
  main().catch((error) => {
    process.stderr.write(
      `${error instanceof Error ? error.message : String(error)}\n`,
    );
    process.exitCode = 1;
  });
}
