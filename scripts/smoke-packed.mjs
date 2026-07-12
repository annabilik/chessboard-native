import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import {
  appendFile,
  chmod,
  cp,
  lstat,
  mkdir,
  readFile,
  readdir,
  realpath,
  stat,
  writeFile,
} from 'node:fs/promises';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const packageName = '@vibechess/chessboard-native';
const repositoryRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '..',
);
const npmCommand = process.platform === 'win32' ? 'npm.cmd' : 'npm';
const consumers = {
  expo: {
    entries: ['app', 'app.json', 'package.json', 'src', 'tsconfig.json'],
    source: path.join(repositoryRoot, 'apps/example'),
  },
  native: {
    entries: [
      '.bundle',
      '.watchmanconfig',
      'App.tsx',
      'Gemfile',
      'Gemfile.lock',
      'android',
      'app.json',
      'babel.config.js',
      'index.js',
      'ios',
      'metro.config.js',
      'package.json',
      'scripts',
      'tsconfig.json',
    ],
    source: path.join(repositoryRoot, 'apps/native-harness'),
  },
};
const excludedPathSegments = new Set([
  '.cxx',
  '.expo',
  '.gradle',
  '.idea',
  '.kotlin',
  'DerivedData',
  'Pods',
  'build',
  'coverage',
  'dist',
  'node_modules',
  'vendor',
  'xcuserdata',
]);

function parseArguments(args) {
  const parsed = {};

  for (let index = 0; index < args.length; index += 2) {
    const option = args[index];
    const value = args[index + 1];

    if (!option?.startsWith('--') || value === undefined) {
      throw new Error(
        'Usage: node scripts/smoke-packed.mjs --consumer <expo|native> --archive <package.tgz> --destination <directory>',
      );
    }

    parsed[option.slice(2)] = value;
  }

  if (
    !['expo', 'native'].includes(parsed.consumer) ||
    !parsed.archive ||
    !parsed.destination ||
    Object.keys(parsed).some(
      (option) => !['archive', 'consumer', 'destination'].includes(option),
    )
  ) {
    throw new Error(
      'Usage: node scripts/smoke-packed.mjs --consumer <expo|native> --archive <package.tgz> --destination <directory>',
    );
  }

  return parsed;
}

function isWithin(parent, candidate) {
  const relative = path.relative(parent, candidate);

  return (
    relative === '' ||
    (relative !== '..' &&
      !relative.startsWith(`..${path.sep}`) &&
      !path.isAbsolute(relative))
  );
}

function shouldCopy(sourceRoot, sourcePath) {
  const relative = path.relative(sourceRoot, sourcePath);
  const segments = relative.split(path.sep);

  return (
    !segments.some((segment) => excludedPathSegments.has(segment)) &&
    !segments.some((segment) => segment.endsWith('.xcworkspace')) &&
    ![
      '.DS_Store',
      '.xcode.env.local',
      'Podfile.lock',
      'local.properties',
      'npm-shrinkwrap.json',
      'package-lock.json',
      'pnpm-lock.yaml',
      'yarn.lock',
    ].includes(path.basename(sourcePath))
  );
}

function run(command, args, cwd) {
  const result = spawnSync(command, args, {
    cwd,
    env: {
      ...process.env,
      CI: process.env.CI ?? '1',
      npm_config_userconfig: path.join(cwd, '.npmrc'),
    },
    stdio: 'inherit',
  });

  if (result.error) {
    throw result.error;
  }

  if (result.status !== 0) {
    throw new Error(
      `${command} ${args.join(' ')} exited with ${result.status}`,
    );
  }
}

function loadNpmSemver() {
  const result = spawnSync(npmCommand, ['root', '--global'], {
    encoding: 'utf8',
    env: process.env,
  });

  if (result.error) {
    throw result.error;
  }

  if (result.status !== 0) {
    throw new Error(`Could not locate npm's bundled semver implementation`);
  }

  const globalModules = result.stdout.trim();
  const requireFromNpm = createRequire(
    path.join(globalModules, 'npm', 'package.json'),
  );

  return requireFromNpm('semver');
}

async function assertMissing(target, label) {
  try {
    await lstat(target);
  } catch (error) {
    if (error.code === 'ENOENT') {
      return;
    }

    throw error;
  }

  throw new Error(`${label} must not already exist: ${target}`);
}

async function assertNoSymbolicLinks(root) {
  const entries = await readdir(root, { withFileTypes: true });

  for (const entry of entries) {
    const entryPath = path.join(root, entry.name);

    if (entry.isSymbolicLink()) {
      throw new Error(`Packed package contains a symbolic link: ${entryPath}`);
    }

    if (entry.isDirectory()) {
      await assertNoSymbolicLinks(entryPath);
    }
  }
}

async function rewriteManifest(destination, archive) {
  const manifestPath = path.join(destination, 'package.json');
  const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));

  if (manifest.dependencies?.[packageName] !== 'workspace:*') {
    throw new Error(
      `${packageName} must be a workspace:* dependency in the source consumer`,
    );
  }

  manifest.dependencies[packageName] = `file:${archive.replaceAll('\\', '/')}`;

  for (const dependencyGroup of [
    'dependencies',
    'devDependencies',
    'optionalDependencies',
    'peerDependencies',
  ]) {
    const dependencies = manifest[dependencyGroup] ?? {};
    const workspaceDependency = Object.entries(dependencies).find(
      ([, specifier]) =>
        typeof specifier === 'string' && specifier.startsWith('workspace:'),
    );

    if (workspaceDependency) {
      throw new Error(
        `Packed consumer still has a workspace dependency: ${workspaceDependency[0]}`,
      );
    }
  }

  await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
  await writeFile(
    path.join(destination, '.npmrc'),
    [
      'audit=false',
      'engine-strict=true',
      'fund=false',
      'install-links=true',
      // Expo Router has an optional React Server Components peer that npm
      // currently tries to auto-install at an incompatible React patch. Keep
      // peer auto-installation off and verify this package's peers directly.
      'legacy-peer-deps=true',
      'omit=peer',
      'package-lock=false',
      '',
    ].join('\n'),
  );

  return manifest;
}

async function verifyInstallation(destination, consumerManifest, repository) {
  const nodeModules = await realpath(path.join(destination, 'node_modules'));
  const installedPackagePath = path.join(
    destination,
    'node_modules',
    ...packageName.split('/'),
  );
  const installedPackageStats = await lstat(installedPackagePath);

  if (installedPackageStats.isSymbolicLink()) {
    throw new Error(
      `Packed package resolved through a symbolic link: ${installedPackagePath}`,
    );
  }

  const installedPackage = await realpath(installedPackagePath);

  if (!isWithin(nodeModules, installedPackage)) {
    throw new Error(
      `Packed package resolved outside consumer node_modules: ${installedPackage}`,
    );
  }

  if (isWithin(repository, installedPackage)) {
    throw new Error(
      `Packed package leaked back into the source repository: ${installedPackage}`,
    );
  }

  const installedManifest = JSON.parse(
    await readFile(path.join(installedPackage, 'package.json'), 'utf8'),
  );

  if (installedManifest.name !== packageName) {
    throw new Error(
      `Installed unexpected package identity: ${installedManifest.name}@${installedManifest.version}`,
    );
  }

  const consumerDependencies = {
    ...consumerManifest.dependencies,
    ...consumerManifest.devDependencies,
  };
  const packagePeers = Object.keys(installedManifest.peerDependencies ?? {});
  const installedPeers = [];
  const semver = loadNpmSemver();

  for (const peer of packagePeers) {
    const peerIsOptional =
      installedManifest.peerDependenciesMeta?.[peer]?.optional === true;

    if (!consumerDependencies[peer]) {
      if (peerIsOptional) {
        continue;
      }

      throw new Error(`Packed consumer does not declare package peer: ${peer}`);
    }

    const peerPath = path.join(destination, 'node_modules', ...peer.split('/'));
    const peerManifest = JSON.parse(
      await readFile(path.join(peerPath, 'package.json'), 'utf8'),
    );
    const peerRange = installedManifest.peerDependencies[peer];

    if (!semver.satisfies(peerManifest.version, peerRange)) {
      throw new Error(
        `Packed consumer installs ${peer}@${peerManifest.version}, which does not satisfy ${peerRange}`,
      );
    }

    installedPeers.push(peer);
  }

  await assertNoSymbolicLinks(installedPackage);
  run(
    npmCommand,
    ['ls', packageName, ...installedPeers, '--depth=0'],
    destination,
  );

  return installedPackage;
}

const options = parseArguments(process.argv.slice(2));
const consumer = consumers[options.consumer];
const archivePath = path.resolve(options.archive);
const destinationPath = path.resolve(options.destination);
const archiveStats = await stat(archivePath);

if (!archiveStats.isFile() || path.extname(archivePath) !== '.tgz') {
  throw new Error(`Archive must be an existing .tgz file: ${archivePath}`);
}

await assertMissing(destinationPath, 'Destination');

const destinationParent = await realpath(path.dirname(destinationPath));
const canonicalDestination = path.join(
  destinationParent,
  path.basename(destinationPath),
);
const canonicalRepository = await realpath(repositoryRoot);

if (isWithin(canonicalRepository, canonicalDestination)) {
  throw new Error(
    `Destination must be outside the source repository: ${canonicalDestination}`,
  );
}

await mkdir(canonicalDestination);

for (const entry of consumer.entries) {
  const sourcePath = path.join(consumer.source, entry);

  await cp(sourcePath, path.join(canonicalDestination, entry), {
    filter: (candidate) => shouldCopy(consumer.source, candidate),
    recursive: true,
  });
}

if (options.consumer === 'native') {
  await chmod(path.join(canonicalDestination, 'android/gradlew'), 0o755);
}

const consumerManifest = await rewriteManifest(
  canonicalDestination,
  archivePath,
);
const archiveDigest = createHash('sha256')
  .update(await readFile(archivePath))
  .digest('hex');

run(
  npmCommand,
  [
    'install',
    '--install-links=true',
    '--legacy-peer-deps=true',
    '--omit=peer',
    '--audit=false',
    '--fund=false',
    '--package-lock=false',
  ],
  canonicalDestination,
);

await assertMissing(
  path.join(canonicalDestination, 'package-lock.json'),
  'Generated lockfile',
);

const installedPackage = await verifyInstallation(
  canonicalDestination,
  consumerManifest,
  canonicalRepository,
);

process.stdout.write(
  `Prepared packed ${options.consumer} consumer: ${canonicalDestination}\n`,
);
process.stdout.write(`Archive SHA-256: ${archiveDigest}\n`);
process.stdout.write(`Installed package: ${installedPackage}\n`);

if (process.env.GITHUB_OUTPUT) {
  await appendFile(
    process.env.GITHUB_OUTPUT,
    `consumer-directory=${canonicalDestination}\narchive-sha256=${archiveDigest}\n`,
  );
}
