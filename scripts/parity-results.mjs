import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdir, readFile, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';

const contractTitlePattern =
  /^\[(PARITY-(?:EXPORT|OPTION|BEHAVIOR)-[A-Z0-9-]+)\](?:\s+|$)/;

function sha256(content) {
  return createHash('sha256').update(content).digest('hex');
}

function relativePosix(from, to) {
  return path.relative(from, to).split(path.sep).join('/');
}

function assertInside(root, filePath, label) {
  const relative = path.relative(path.resolve(root), path.resolve(filePath));
  if (
    relative === '' ||
    relative === '..' ||
    relative.startsWith(`..${path.sep}`) ||
    path.isAbsolute(relative)
  ) {
    throw new Error(`${label} must be inside ${root}: ${filePath}`);
  }
  return relative.split(path.sep).join('/');
}

export function currentGitCommit(repositoryRoot) {
  const result = spawnSync('git', ['rev-parse', 'HEAD'], {
    cwd: repositoryRoot,
    encoding: 'utf8',
  });

  if (result.error) {
    throw result.error;
  }
  if (result.status !== 0) {
    throw new Error(
      `Cannot resolve current Git commit: ${result.stderr.trim()}`,
    );
  }

  const commit = result.stdout.trim();
  if (!/^[a-f0-9]{40}$/.test(commit)) {
    throw new Error(`Git returned an invalid commit: ${commit}`);
  }
  return commit;
}

export function deriveJestParityResults(rawResult, repositoryRoot) {
  if (!rawResult || !Array.isArray(rawResult.testResults)) {
    throw new Error('Jest evidence has no testResults array');
  }
  if (rawResult.success !== true) {
    throw new Error('Jest evidence does not represent a successful test run');
  }

  const results = [];
  for (const testFile of rawResult.testResults) {
    if (!testFile || !Array.isArray(testFile.assertionResults)) {
      throw new Error(
        'Jest evidence contains a suite without assertionResults',
      );
    }

    const source = assertInside(
      repositoryRoot,
      testFile.name,
      'Jest test source',
    );

    for (const assertion of testFile.assertionResults) {
      const title = assertion.title;
      if (typeof title !== 'string') {
        throw new Error(`Jest assertion in ${source} has no title`);
      }

      const match = title.match(contractTitlePattern);
      if (!match) {
        if (title.includes('PARITY-')) {
          throw new Error(
            `Parity test title must begin with [PARITY-...]: ${title}`,
          );
        }
        continue;
      }

      const status =
        assertion.status === 'passed'
          ? 'passed'
          : assertion.status === 'failed'
            ? 'failed'
            : assertion.status === 'pending' ||
                assertion.status === 'disabled' ||
                assertion.status === 'todo'
              ? 'skipped'
              : undefined;
      if (!status) {
        throw new Error(
          `Unsupported Jest status ${assertion.status} for ${match[1]}`,
        );
      }

      results.push({
        id: match[1],
        name:
          assertion.fullName ||
          [...(assertion.ancestorTitles ?? []), title].join(' '),
        source,
        status,
      });
    }
  }

  return results.sort(
    (left, right) =>
      left.id.localeCompare(right.id) ||
      left.source.localeCompare(right.source) ||
      left.name.localeCompare(right.name),
  );
}

export async function writeJestParityResultShard({
  command,
  outputPath,
  rawResultPath,
  repositoryRoot,
}) {
  const rawContent = await readFile(rawResultPath);
  let rawResult;
  try {
    rawResult = JSON.parse(rawContent.toString('utf8'));
  } catch (error) {
    throw new Error(`Cannot parse Jest evidence ${rawResultPath}`, {
      cause: error,
    });
  }

  const results = deriveJestParityResults(rawResult, repositoryRoot);
  for (const result of results) {
    let sourceStat;
    try {
      sourceStat = await stat(path.join(repositoryRoot, result.source));
    } catch (error) {
      throw new Error(
        `Collected parity source is not a file: ${result.source}`,
        { cause: error },
      );
    }
    if (!sourceStat.isFile()) {
      throw new Error(
        `Collected parity source is not a file: ${result.source}`,
      );
    }
  }

  const outputDirectory = path.dirname(outputPath);
  const evidencePath = assertInside(
    outputDirectory,
    rawResultPath,
    'Jest evidence',
  );
  const shard = {
    $schema: relativePosix(
      outputDirectory,
      path.join(repositoryRoot, 'fixtures/parity/results.schema.json'),
    ),
    schemaVersion: 1,
    runner: 'jest',
    commit: currentGitCommit(repositoryRoot),
    command,
    evidence: {
      format: 'jest-json-v29',
      path: evidencePath,
      sha256: sha256(rawContent),
    },
    results,
  };

  await mkdir(outputDirectory, { recursive: true });
  await writeFile(outputPath, `${JSON.stringify(shard, null, 2)}\n`);
  return shard;
}
