import { spawnSync } from 'node:child_process';
import { mkdtemp, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repositoryRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '..',
);
const packageRoot = path.join(repositoryRoot, 'packages/chessboard-native');
const npmCommand = process.platform === 'win32' ? 'npm.cmd' : 'npm';
const pnpmCommand = process.platform === 'win32' ? 'pnpm.cmd' : 'pnpm';
const temporaryDirectory = await mkdtemp(
  path.join(tmpdir(), 'chessboard-native-package-'),
);

function run(command, args, cwd = repositoryRoot) {
  const result = spawnSync(command, args, {
    cwd,
    env: process.env,
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

try {
  run(
    npmCommand,
    ['pack', '--ignore-scripts', '--pack-destination', temporaryDirectory],
    packageRoot,
  );

  const archives = (await readdir(temporaryDirectory)).filter((file) =>
    file.endsWith('.tgz'),
  );

  if (archives.length !== 1) {
    throw new Error(`Expected one package archive, found ${archives.length}`);
  }

  const archive = path.join(temporaryDirectory, archives[0]);

  run(pnpmCommand, ['exec', 'publint', archive, '--strict']);
  run(pnpmCommand, [
    'exec',
    'attw',
    archive,
    '--profile',
    'esm-only',
    '--no-definitely-typed',
  ]);
} finally {
  await rm(temporaryDirectory, { force: true, recursive: true });
}
