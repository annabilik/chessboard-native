import { spawnSync } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import Ajv from 'ajv';

const repositoryRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '..',
);
const defaultChecklistPath = path.join(
  repositoryRoot,
  'fixtures/accessibility/manual-checks.json',
);
const defaultEvidencePath = path.join(
  repositoryRoot,
  'docs/release-evidence/accessibility-0.1.0-next.2.json',
);
const defaultSchemaPath = path.join(
  repositoryRoot,
  'fixtures/accessibility/physical-results.schema.json',
);
const defaultEvidenceSummaryPath = path.join(
  repositoryRoot,
  'docs/release-evidence/accessibility-0.1.0-next.2.md',
);
const documentationPath = path.join(repositoryRoot, 'docs/accessibility.md');
const supportMatrixPath = path.join(repositoryRoot, 'docs/support-matrix.md');
const galleryCatalogPath = path.join(
  repositoryRoot,
  'apps/example/src/gallery-routes.ts',
);
const canonicalCheckIds = Object.freeze(
  Array.from(
    { length: 26 },
    (_, index) => `A11Y-${String(index + 1).padStart(2, '0')}`,
  ),
);
const expectedAssistiveTechnology = Object.freeze({
  android: 'TalkBack',
  ios: 'VoiceOver',
});
const canonicalPackageIdentity = Object.freeze({
  archiveSha256:
    '69546ea3fd9fc2a89ac4053be21a1d57e537c0ecbe27c5ea7bac02df07412916',
  publicationRun:
    'https://github.com/annabilik/chessboard-native/actions/runs/29760766252',
  sourceCommit: 'addc0cb8a7e4d6f4302e25e21c124766279ca82b',
  version: '0.1.0-next.2',
});
const physicalValidationFixturePaths = Object.freeze([
  'apps/example',
  'docs/accessibility.md',
  'docs/physical-accessibility-validation.md',
  'fixtures/accessibility/manual-checks.json',
  'fixtures/accessibility/physical-results.schema.json',
  'scripts/check-accessibility-evidence.mjs',
  'scripts/smoke-packed.mjs',
]);

function usage() {
  return [
    'Usage: node scripts/check-accessibility-evidence.mjs [options]',
    '  --evidence <results.json>',
    '  --complete',
    '  --expected-version <version>',
    '  --expected-source-commit <sha>',
    '  --expected-archive-sha256 <sha256>',
    '  --expected-publication-run <url>',
  ].join('\n');
}

function parseArguments(argumentsList) {
  const options = {
    complete: false,
    evidencePath: defaultEvidencePath,
  };
  const seen = new Set();

  for (let index = 0; index < argumentsList.length; index += 1) {
    const option = argumentsList[index];
    if (option === '--complete') {
      if (seen.has(option)) throw new Error(usage());
      seen.add(option);
      options.complete = true;
      continue;
    }

    const value = argumentsList[index + 1];
    if (
      ![
        '--evidence',
        '--expected-version',
        '--expected-source-commit',
        '--expected-archive-sha256',
        '--expected-publication-run',
      ].includes(option) ||
      value === undefined ||
      value.startsWith('--') ||
      seen.has(option)
    ) {
      throw new Error(usage());
    }
    seen.add(option);
    index += 1;

    switch (option) {
      case '--evidence':
        options.evidencePath = path.resolve(process.cwd(), value);
        break;
      case '--expected-version':
        options.expectedVersion = value;
        break;
      case '--expected-source-commit':
        options.expectedSourceCommit = value;
        break;
      case '--expected-archive-sha256':
        options.expectedArchiveSha256 = value;
        break;
      case '--expected-publication-run':
        options.expectedPublicationRun = value;
        break;
    }
  }

  return options;
}

async function readJson(filePath) {
  let source;
  try {
    source = await readFile(filePath, 'utf8');
  } catch (error) {
    throw new Error(`Cannot read ${filePath}: ${error.message}`, {
      cause: error,
    });
  }

  try {
    return JSON.parse(source);
  } catch (error) {
    throw new Error(`Cannot parse ${filePath}: ${error.message}`, {
      cause: error,
    });
  }
}

function sameValues(left, right) {
  return (
    left.length === right.length &&
    left.every((value, index) => value === right[index])
  );
}

function duplicateValues(values) {
  const seen = new Set();
  const duplicates = new Set();
  for (const value of values) {
    if (seen.has(value)) duplicates.add(value);
    seen.add(value);
  }
  return [...duplicates].sort();
}

function galleryRouteNames(source) {
  return new Set(
    [...source.matchAll(/\bname:\s*['"]([a-z0-9-]+)['"]/g)].map(
      (match) => match[1],
    ),
  );
}

export function validateChecklist({
  checklist,
  documentation,
  galleryCatalog,
}) {
  if (checklist?.schemaVersion !== 1 || !Array.isArray(checklist.checks)) {
    throw new Error('manual checklist must use schemaVersion 1 with checks');
  }

  const checkIds = checklist.checks.map((check) => check?.id);
  if (!sameValues(checkIds, canonicalCheckIds)) {
    throw new Error(
      `manual checklist IDs must be exactly ${canonicalCheckIds.join(', ')}`,
    );
  }

  const routes = galleryRouteNames(galleryCatalog);
  let previousDocumentationIndex = -1;
  for (const check of checklist.checks) {
    if (
      typeof check.title !== 'string' ||
      check.title.trim().length === 0 ||
      !Array.isArray(check.routes) ||
      check.routes.length === 0
    ) {
      throw new Error(`${check.id} must have a title and at least one route`);
    }
    for (const route of check.routes) {
      if (!routes.has(route)) {
        throw new Error(
          `${check.id} references unknown gallery route ${route}`,
        );
      }
    }

    const firstIndex = documentation.indexOf(check.id);
    if (
      firstIndex === -1 ||
      documentation.indexOf(check.id, firstIndex + check.id.length) !== -1
    ) {
      throw new Error(
        `${check.id} must appear exactly once in docs/accessibility.md`,
      );
    }
    if (firstIndex <= previousDocumentationIndex) {
      throw new Error('manual checklist IDs must remain in canonical order');
    }
    previousDocumentationIndex = firstIndex;
  }

  return checklist.checks;
}

function formatSchemaErrors(errors = []) {
  return errors
    .map(
      (error) =>
        `${error.instancePath || '/'} ${error.message ?? 'is invalid'}`,
    )
    .join('; ');
}

export function validateEvidenceSchema(evidence, schema) {
  const ajv = new Ajv({ allErrors: true, strict: true });
  const validate = ajv.compile(schema);
  if (!validate(evidence)) {
    throw new Error(
      `physical accessibility evidence violates its schema: ${formatSchemaErrors(validate.errors)}`,
    );
  }
}

function requireCompletedString(value, fieldName) {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new Error(`${fieldName} must be recorded at the complete gate`);
  }
}

export function validateAccessibilityEvidence({
  checklist,
  evidence,
  complete = false,
  expectedVersion,
  expectedSourceCommit,
  expectedArchiveSha256,
  expectedPublicationRun,
}) {
  const expectedIds = checklist.checks.map((check) => check.id);
  const packageIdentity = evidence.package;

  for (const [expected, actual, label] of [
    [expectedVersion, packageIdentity.version, 'version'],
    [expectedSourceCommit, packageIdentity.sourceCommit, 'source commit'],
    [expectedArchiveSha256, packageIdentity.archiveSha256, 'archive SHA-256'],
    [expectedPublicationRun, packageIdentity.publicationRun, 'publication run'],
  ]) {
    if (expected !== undefined && actual !== expected) {
      throw new Error(`${label} is ${actual}, expected ${expected}`);
    }
  }

  const platforms = evidence.sessions.map((session) => session.platform);
  const platformDuplicates = duplicateValues(platforms);
  if (
    platformDuplicates.length > 0 ||
    !sameValues([...platforms].sort(), ['android', 'ios'])
  ) {
    throw new Error(
      'evidence must contain exactly one Android and one iOS session',
    );
  }

  let pendingResults = 0;
  let hasObservations = false;
  for (const session of evidence.sessions) {
    if (
      session.assistiveTechnology !==
      expectedAssistiveTechnology[session.platform]
    ) {
      throw new Error(
        `${session.platform} must use ${expectedAssistiveTechnology[session.platform]}`,
      );
    }

    const resultIds = session.results.map((result) => result.id);
    if (!sameValues(resultIds, expectedIds)) {
      throw new Error(
        `${session.platform} results must contain every manual check exactly once in canonical order`,
      );
    }

    for (const result of session.results) {
      if (result.status !== 'passed') pendingResults += 1;
      if (
        ['failed', 'blocked'].includes(result.status) &&
        (typeof result.notes !== 'string' || result.notes.trim().length === 0)
      ) {
        throw new Error(
          `${session.platform} ${result.id} ${result.status} result requires notes`,
        );
      }
    }

    const sessionHasObservations = session.results.some(
      (result) => result.status !== 'not-run',
    );
    hasObservations ||= sessionHasObservations;
    if (!complete && !sessionHasObservations) continue;

    requireCompletedString(session.tester, `${session.platform} tester`);
    requireCompletedString(
      session.observedAt,
      `${session.platform} observedAt`,
    );
    requireCompletedString(session.locale, `${session.platform} locale`);
    for (const [fieldName, value] of Object.entries(session.device)) {
      requireCompletedString(value, `${session.platform} device.${fieldName}`);
    }
    for (const [fieldName, value] of Object.entries(session.runtime)) {
      requireCompletedString(value, `${session.platform} runtime.${fieldName}`);
    }
    if (session.evidence.length === 0) {
      throw new Error(
        `${session.platform} must reference at least one recording or review artifact`,
      );
    }

    if (!complete) continue;

    const incomplete = session.results.filter(
      (result) => result.status !== 'passed',
    );
    if (incomplete.length > 0) {
      throw new Error(
        `${session.platform} has incomplete checks: ${incomplete.map((result) => `${result.id}=${result.status}`).join(', ')}`,
      );
    }
  }

  if (complete || hasObservations) {
    requireCompletedString(evidence.galleryCommit, 'galleryCommit');
  }

  return Object.freeze({
    checkCount: expectedIds.length,
    hasObservations,
    pendingResults,
    sessionCount: evidence.sessions.length,
  });
}

export function validateEvidenceDocumentation({
  evidenceSummary,
  supportMatrix,
  evidence,
}) {
  const complete = evidence.sessions.every((session) =>
    session.results.every((result) => result.status === 'passed'),
  );
  const hasObservations = evidence.sessions.some((session) =>
    session.results.some((result) => result.status !== 'not-run'),
  );
  const summaryStatus = complete
    ? '- Status: complete physical validation'
    : '- Status: pending physical validation';

  if (!evidenceSummary.includes(summaryStatus)) {
    throw new Error(
      `accessibility evidence summary must declare: ${summaryStatus}`,
    );
  }

  const galleryCommitLine = hasObservations
    ? `- Gallery fixture commit: \`${evidence.galleryCommit}\``
    : '- Gallery fixture commit: pending';
  if (!evidenceSummary.includes(galleryCommitLine)) {
    throw new Error(
      `accessibility evidence summary must declare: ${galleryCommitLine}`,
    );
  }
  if (
    complete &&
    /No physical result is claimed yet|Until both rows pass|screen-reader gate remains open/i.test(
      evidenceSummary,
    )
  ) {
    throw new Error(
      'completed accessibility evidence summary must not retain pending narrative',
    );
  }

  for (const session of evidence.sessions) {
    const platform = session.platform === 'android' ? 'Android' : 'iOS';
    const assistiveTechnology = session.assistiveTechnology;
    const sessionHasObservations = session.results.some(
      (result) => result.status !== 'not-run',
    );
    const statuses = session.results.map((result) => result.status);
    const platformStatus = statuses.every((status) => status === 'passed')
      ? 'Passed'
      : statuses.includes('failed')
        ? 'Failed'
        : statuses.includes('blocked')
          ? 'Blocked'
          : sessionHasObservations
            ? 'In progress'
            : 'Pending';
    const matrixStatus =
      platformStatus === 'Passed' ? 'Complete' : 'Manual pending';
    const summaryRow = new RegExp(
      `^\\|\\s*${platform}\\s*\\|\\s*${assistiveTechnology}\\s*\\|\\s*${platformStatus}\\s*\\|\\s*([^|]+?)\\s*\\|\\s*([^|]+?)\\s*\\|$`,
      'm',
    ).exec(evidenceSummary);
    if (summaryRow === null) {
      throw new Error(
        `${platform} evidence summary row must be ${platformStatus}`,
      );
    }

    const deviceCell = summaryRow[1].trim();
    const evidenceCell = summaryRow[2].trim();
    if (sessionHasObservations) {
      for (const value of [
        session.device.manufacturer,
        session.device.model,
        session.device.osVersion,
      ]) {
        if (!deviceCell.includes(value)) {
          throw new Error(
            `${platform} evidence summary device must include ${value}`,
          );
        }
      }
      for (const evidenceReference of session.evidence) {
        if (!evidenceCell.includes(evidenceReference)) {
          throw new Error(
            `${platform} evidence summary must link ${evidenceReference}`,
          );
        }
      }
    } else if (deviceCell !== '—' || evidenceCell !== '—') {
      throw new Error(
        `${platform} pending summary must leave device and evidence unset`,
      );
    }

    const matrixRow = new RegExp(
      `^\\|\\s*Physical ${assistiveTechnology}\\s*\\|\\s*${matrixStatus}\\s*\\|([^\n]+)$`,
      'm',
    ).exec(supportMatrix);
    if (matrixRow === null) {
      throw new Error(
        `Physical ${assistiveTechnology} support row must be ${matrixStatus}`,
      );
    }
    if (
      matrixStatus === 'Complete' &&
      /\b(?:awaits?|pending|remains?)\b/i.test(matrixRow[1])
    ) {
      throw new Error(
        `Physical ${assistiveTechnology} completed support row must not retain pending wording`,
      );
    }
  }
}

function runGit(argumentsList, { allowFailure = false } = {}) {
  const result = spawnSync('git', argumentsList, {
    cwd: repositoryRoot,
    encoding: 'utf8',
  });
  if (result.error) throw result.error;
  if (!allowFailure && result.status !== 0) {
    throw new Error(
      `git ${argumentsList.join(' ')} failed: ${result.stderr.trim()}`,
    );
  }
  return result;
}

export function validateGalleryBinding({
  galleryCommit,
  commitExists,
  isAncestor,
  changedPaths,
}) {
  if (!commitExists) {
    throw new Error(
      `galleryCommit does not identify a Git commit: ${galleryCommit}`,
    );
  }
  if (!isAncestor) {
    throw new Error(
      `galleryCommit is not an ancestor of HEAD: ${galleryCommit}`,
    );
  }
  if (changedPaths.length > 0) {
    throw new Error(
      `physical validation fixtures differ from galleryCommit ${galleryCommit}: ${changedPaths.join(', ')}`,
    );
  }
}

function validateRepositoryGalleryBinding(galleryCommit) {
  const commitResult = runGit(['cat-file', '-e', `${galleryCommit}^{commit}`], {
    allowFailure: true,
  });
  const commitExists = commitResult.status === 0;
  const isAncestor =
    commitExists &&
    runGit(['merge-base', '--is-ancestor', galleryCommit, 'HEAD'], {
      allowFailure: true,
    }).status === 0;
  let changedPaths = [];

  if (commitExists) {
    const tracked = runGit([
      'diff',
      '--name-only',
      galleryCommit,
      '--',
      ...physicalValidationFixturePaths,
    ]).stdout;
    const untracked = runGit([
      'ls-files',
      '--others',
      '--exclude-standard',
      '--',
      ...physicalValidationFixturePaths,
    ]).stdout;
    changedPaths = [...new Set(`${tracked}\n${untracked}`.split('\n'))]
      .map((value) => value.trim())
      .filter(Boolean)
      .sort();
  }

  validateGalleryBinding({
    galleryCommit,
    commitExists,
    isAncestor,
    changedPaths,
  });
}

export async function checkRepositoryAccessibilityEvidence(options = {}) {
  const [
    checklist,
    evidence,
    schema,
    documentation,
    galleryCatalog,
    evidenceSummary,
    supportMatrix,
  ] = await Promise.all([
    readJson(defaultChecklistPath),
    readJson(options.evidencePath ?? defaultEvidencePath),
    readJson(defaultSchemaPath),
    readFile(documentationPath, 'utf8'),
    readFile(galleryCatalogPath, 'utf8'),
    readFile(defaultEvidenceSummaryPath, 'utf8'),
    readFile(supportMatrixPath, 'utf8'),
  ]);

  validateChecklist({ checklist, documentation, galleryCatalog });
  validateEvidenceSchema(evidence, schema);
  const result = validateAccessibilityEvidence({
    checklist,
    evidence,
    complete: options.complete,
    expectedVersion:
      options.expectedVersion ?? canonicalPackageIdentity.version,
    expectedSourceCommit:
      options.expectedSourceCommit ?? canonicalPackageIdentity.sourceCommit,
    expectedArchiveSha256:
      options.expectedArchiveSha256 ?? canonicalPackageIdentity.archiveSha256,
    expectedPublicationRun:
      options.expectedPublicationRun ?? canonicalPackageIdentity.publicationRun,
  });
  validateEvidenceDocumentation({
    evidenceSummary,
    supportMatrix,
    evidence,
  });
  if (options.complete || result.hasObservations) {
    validateRepositoryGalleryBinding(evidence.galleryCommit);
  }
  return result;
}

const invokedPath = process.argv[1]
  ? pathToFileURL(path.resolve(process.argv[1])).href
  : '';

if (import.meta.url === invokedPath) {
  try {
    const options = parseArguments(process.argv.slice(2));
    const result = await checkRepositoryAccessibilityEvidence(options);
    const status =
      options.complete || result.pendingResults === 0
        ? 'complete'
        : 'structurally valid';
    process.stdout.write(
      `Physical accessibility evidence ${status}: ${String(result.checkCount)} checks × ${String(result.sessionCount)} platforms; ${String(result.pendingResults)} results not passed.\n`,
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    process.stderr.write(`Accessibility evidence check failed: ${message}\n`);
    process.exitCode = 1;
  }
}
