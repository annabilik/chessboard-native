import { spawn, spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { once } from 'node:events';
import {
  closeSync,
  existsSync,
  mkdirSync,
  openSync,
  readFileSync,
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

export const defaultAndroidAcceptedDragTest =
  'com.vibechess.chessboardnativeharness.ChessboardAcceptedDragTest#acceptedDragsPublishCorrelatedControlledCommitsExactlyOnce';

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
      /(?:Unable to find viewState for tag|(?:Could not|Cannot|Unable to) find (?:native )?(?:view|host)(?: with)? tag|No (?:native )?(?:view|host) found for tag|view with tag \d+ (?:does not exist|was removed|has been removed)|(?:Fabric|Mounting)[^\n]*(?:missing|removed|unmounted)[^\n]*(?:host|view|tag)|(?:host|view)[^\n]*(?:missing|removed|unmounted)[^\n]*(?:Fabric|Mounting))/iu,
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

  try {
    await Promise.race([
      once(child, 'spawn'),
      once(child, 'error').then(([error]) => Promise.reject(error)),
    ]);
  } catch (error) {
    closeSync(logFileDescriptor);
    throw error;
  }

  return { child, closed, logFileDescriptor };
}

async function stopLogcatCapture(capture) {
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
}

function sha256(contents) {
  return createHash('sha256').update(contents).digest('hex');
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
  const testClass =
    environment.ANDROID_TEST_CLASS?.trim() || defaultAndroidAcceptedDragTest;
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
    manufacturer: readDeviceProperty(adb, serial, 'ro.product.manufacturer'),
    model: readDeviceProperty(adb, serial, 'ro.product.model'),
    serial,
  };
  const sourceCommit = runCaptured('git', ['rev-parse', 'HEAD'], {
    cwd: repositoryRoot,
  });

  process.stdout.write(
    [
      `Android Fabric drag gate: ${deviceEvidence.manufacturer} ${deviceEvidence.model}`,
      `Serial: ${serial}`,
      `Android: ${deviceEvidence.androidRelease} (API ${deviceEvidence.apiLevel}, ${deviceEvidence.abi})`,
      `Instrumentation: ${testClass}`,
      `Logcat evidence: ${logPath}`,
      '',
    ].join('\n'),
  );

  runCaptured(adb, adbArguments(serial, 'logcat', '-b', 'all', '-c'));
  const capture = await startLogcatCapture({ adb, logPath, serial });
  await delay(250);

  let gradleResult;
  try {
    gradleResult = spawnSync('./gradlew', gradleArguments, {
      cwd: androidRoot,
      env: { ...environment, ANDROID_SERIAL: serial },
      stdio: 'inherit',
    });
  } finally {
    await stopLogcatCapture(capture);
  }

  const logcat = readFileSync(logPath, 'utf8');
  const findings = scanAndroidFabricFailures(logcat);
  const gradleError = gradleResult?.error?.message ?? null;
  const gradleExitCode = gradleResult?.status ?? null;
  const passed =
    gradleError === null && gradleExitCode === 0 && findings.length === 0;
  const result = {
    schemaVersion: 1,
    status: passed ? 'passed' : 'failed',
    sourceCommit,
    startedAt,
    finishedAt: new Date().toISOString(),
    device: deviceEvidence,
    instrumentation: {
      gradleError,
      gradleExitCode,
      task: gradleArguments[0],
      testClass,
    },
    logcat: {
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
    throw new Error(
      [
        instrumentationFailure,
        findings.length > 0
          ? 'Android Fabric/Reanimated logcat gate failed.'
          : null,
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
