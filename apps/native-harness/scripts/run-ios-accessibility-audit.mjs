import { spawnSync } from 'node:child_process';
import { mkdirSync, rmSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

function runtimeVersion(runtime) {
  const match = runtime.match(/\.iOS-(\d+(?:-\d+)*)$/u);
  return match?.[1]?.split('-').map(Number) ?? [];
}

function compareVersionsDescending(left, right) {
  const width = Math.max(left.length, right.length);
  for (let index = 0; index < width; index += 1) {
    const comparison = (right[index] ?? 0) - (left[index] ?? 0);
    if (comparison !== 0) {
      return comparison;
    }
  }
  return 0;
}

export function selectIOSSimulator(devicesByRuntime, requestedUdid) {
  const runtimes = Object.entries(devicesByRuntime)
    .filter(([runtime]) => {
      const version = runtimeVersion(runtime);
      return version.length > 0 && (version[0] ?? 0) >= 17;
    })
    .sort(([left], [right]) =>
      compareVersionsDescending(runtimeVersion(left), runtimeVersion(right)),
    );
  const available = runtimes.flatMap(([runtime, devices]) =>
    devices
      .filter(
        (device) =>
          device.isAvailable !== false &&
          typeof device.name === 'string' &&
          device.name.startsWith('iPhone'),
      )
      .map((device) => ({ ...device, runtime })),
  );

  if (requestedUdid !== undefined) {
    const requested = available.find((device) => device.udid === requestedUdid);
    if (requested === undefined) {
      throw new Error(
        `IOS_SIMULATOR_UDID does not identify an available iPhone simulator running iOS 17 or newer: ${requestedUdid}`,
      );
    }
    return requested;
  }

  const booted = available.find((device) => device.state === 'Booted');
  const selected = booted ?? available[0];
  if (selected === undefined) {
    throw new Error(
      'No available iPhone simulator running iOS 17 or newer is installed.',
    );
  }
  return selected;
}

function run(command, args, options = {}) {
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
      `${command} ${args.join(' ')} exited with ${String(result.status)}${
        stderr ? `\n${stderr}` : ''
      }`,
    );
  }
  return result.stdout;
}

export function main() {
  const rawDevices = run('xcrun', [
    'simctl',
    'list',
    'devices',
    'available',
    '--json',
  ]);
  const parsed = JSON.parse(rawDevices);
  const simulator = selectIOSSimulator(
    parsed.devices ?? {},
    process.env.IOS_SIMULATOR_UDID,
  );
  const buildDirectory = path.resolve('ios/build');
  const resultBundle = path.join(
    buildDirectory,
    'ChessboardNativeHarnessAccessibility.xcresult',
  );
  mkdirSync(buildDirectory, { recursive: true });
  rmSync(resultBundle, { force: true, recursive: true });

  process.stdout.write(
    `Running accessibility audit on ${simulator.name} (${simulator.runtime}, ${simulator.udid})\n`,
  );
  const result = spawnSync(
    'xcodebuild',
    [
      'test',
      '-workspace',
      'ios/ChessboardNativeHarness.xcworkspace',
      '-scheme',
      'ChessboardNativeHarness',
      '-configuration',
      'Release',
      '-destination',
      `platform=iOS Simulator,id=${simulator.udid}`,
      '-derivedDataPath',
      path.join(buildDirectory, 'accessibility-audit'),
      '-resultBundlePath',
      resultBundle,
      '-parallel-testing-enabled',
      'NO',
      '-only-testing:ChessboardNativeHarnessUITests',
      'CODE_SIGNING_ALLOWED=NO',
      'CODE_SIGNING_REQUIRED=NO',
    ],
    { stdio: 'inherit' },
  );
  if (result.error) {
    throw result.error;
  }
  if (result.status !== 0) {
    throw new Error(
      `xcodebuild accessibility audit exited with ${String(result.status)}`,
    );
  }
}

const entryPath = process.argv[1];
if (
  entryPath !== undefined &&
  pathToFileURL(path.resolve(entryPath)).href === import.meta.url
) {
  main();
}
