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
export const androidTransitionProviderUnmountDragTest =
  'com.vibechess.chessboardnativeharness.ChessboardTransitionProviderUnmountDragTest#providerReplacementWhileTransitionAndDragOverlapLeavesStateReusable';
export const androidDragPerformanceTest =
  'com.vibechess.chessboardnativeharness.ChessboardDragPerformanceTest#sustainedDragMeetsReleaseFrameBudget';

const dragPerformanceLogPrefix = 'CHESSBOARD_DRAG_PERF ';
const dragPerformanceThresholds = Object.freeze({
  maximumFrameMs: 50,
  maximumInputSpanMs: 4_100,
  maximumJankPercent: 5,
  maximumP95Ms: 17,
  maximumP99Ms: 34,
  maximumRefreshRateHz: 60.5,
  measuredMoveCount: 240,
  measuredRunCount: 5,
  minimumFrameCount: 228,
  minimumInputSpanMs: 3_950,
  minimumRefreshRateHz: 59.5,
});

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

export function parseAndroidDragPerformance(logcat) {
  const payloads = logcat
    .split(/\r?\n/u)
    .map((line) => {
      const markerIndex = line.indexOf(dragPerformanceLogPrefix);
      return markerIndex < 0
        ? null
        : line.slice(markerIndex + dragPerformanceLogPrefix.length).trim();
    })
    .filter((payload) => payload !== null);
  if (payloads.length !== 1) {
    throw new Error(
      `Expected exactly one ${dragPerformanceLogPrefix.trim()} record; found ${String(payloads.length)}.`,
    );
  }

  let summary;
  try {
    summary = JSON.parse(payloads[0]);
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
  if (summary.schemaVersion !== 1) {
    throw new Error('Android drag performance schemaVersion must equal 1.');
  }
  const refreshRate = requireFiniteNumber(
    summary.displayRefreshHz,
    'displayRefreshHz',
  );
  if (
    refreshRate < dragPerformanceThresholds.minimumRefreshRateHz ||
    refreshRate > dragPerformanceThresholds.maximumRefreshRateHz
  ) {
    throw new Error(
      `Android drag performance display refresh ${String(refreshRate)} Hz is outside 59.5–60.5 Hz.`,
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
    const invalidMetrics = requireNonNegativeInteger(
      run.invalidMetrics,
      `run ${String(index + 1)} invalidMetrics`,
    );
    const frameCount = requireNonNegativeInteger(
      run.frameCount,
      `run ${String(index + 1)} frameCount`,
    );
    const p95Ms = requireNonNegativeNumber(
      run.p95Ms,
      `run ${String(index + 1)} p95Ms`,
    );
    const p99Ms = requireNonNegativeNumber(
      run.p99Ms,
      `run ${String(index + 1)} p99Ms`,
    );
    const jankPercent = requireNonNegativeNumber(
      run.jankPercent,
      `run ${String(index + 1)} jankPercent`,
    );
    const worstFrameMs = requireNonNegativeNumber(
      run.worstFrameMs,
      `run ${String(index + 1)} worstFrameMs`,
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
      throw new Error(
        `Android drag performance run ${String(index + 1)} did not deliver 240 moves.`,
      );
    }
    if (
      inputSpanMs < dragPerformanceThresholds.minimumInputSpanMs ||
      inputSpanMs > dragPerformanceThresholds.maximumInputSpanMs
    ) {
      throw new Error(
        `Android drag performance run ${String(index + 1)} input span is out of range.`,
      );
    }
    if (frameCount < dragPerformanceThresholds.minimumFrameCount) {
      throw new Error(
        `Android drag performance run ${String(index + 1)} collected too few frames.`,
      );
    }
    if (!(p95Ms <= p99Ms && p99Ms <= worstFrameMs)) {
      throw new Error(
        `Android drag performance run ${String(index + 1)} has inconsistent frame percentiles.`,
      );
    }
    if (p95Ms > dragPerformanceThresholds.maximumP95Ms) {
      throw new Error(
        `Android drag performance run ${String(index + 1)} exceeded p95 budget.`,
      );
    }
    if (p99Ms > dragPerformanceThresholds.maximumP99Ms) {
      throw new Error(
        `Android drag performance run ${String(index + 1)} exceeded p99 budget.`,
      );
    }
    if (jankPercent > dragPerformanceThresholds.maximumJankPercent) {
      throw new Error(
        `Android drag performance run ${String(index + 1)} exceeded jank budget.`,
      );
    }
    if (worstFrameMs >= dragPerformanceThresholds.maximumFrameMs) {
      throw new Error(
        `Android drag performance run ${String(index + 1)} contained a 50 ms frame.`,
      );
    }
    if (droppedReports !== 0) {
      throw new Error(
        `Android drag performance run ${String(index + 1)} dropped frame reports.`,
      );
    }
    if (invalidMetrics !== 0) {
      throw new Error(
        `Android drag performance run ${String(index + 1)} contained invalid frame metrics.`,
      );
    }
  }
  return summary;
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
  logcatPrematureExit,
  performanceError = null,
  sourceChangedDuringRun = false,
}) {
  return (
    gradleError === null &&
    gradleExitCode === 0 &&
    findings.length === 0 &&
    logcatPrematureExit === null &&
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
  let performanceSummary = null;
  let performanceError = null;
  if (performanceRequired) {
    try {
      performanceSummary = parseAndroidDragPerformance(logcat);
    } catch (error) {
      performanceError = error instanceof Error ? error.message : String(error);
    }
  }
  const passed = didAndroidFabricGatePass({
    findings,
    gradleError,
    gradleExitCode,
    logcatPrematureExit,
    performanceError,
    sourceChangedDuringRun,
  });
  const result = {
    schemaVersion: 3,
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
    performance: {
      error: performanceError,
      required: performanceRequired,
      summary: performanceSummary,
    },
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
