import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import {
  checkRepositoryAccessibilityEvidence,
  validateAccessibilityEvidence,
  validateChecklist,
  validateEvidenceDocumentation,
  validateEvidenceSchema,
  validateGalleryBinding,
} from '../check-accessibility-evidence.mjs';

const repositoryRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../..',
);

async function readJson(relativePath) {
  return JSON.parse(
    await readFile(path.join(repositoryRoot, relativePath), 'utf8'),
  );
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

const [
  checklist,
  evidence,
  schema,
  documentation,
  galleryCatalog,
  evidenceSummary,
  supportMatrix,
] = await Promise.all([
  readJson('fixtures/accessibility/manual-checks.json'),
  readJson('docs/release-evidence/accessibility-0.1.0-next.2.json'),
  readJson('fixtures/accessibility/physical-results.schema.json'),
  readFile(path.join(repositoryRoot, 'docs/accessibility.md'), 'utf8'),
  readFile(
    path.join(repositoryRoot, 'apps/example/src/gallery-routes.ts'),
    'utf8',
  ),
  readFile(
    path.join(
      repositoryRoot,
      'docs/release-evidence/accessibility-0.1.0-next.2.md',
    ),
    'utf8',
  ),
  readFile(path.join(repositoryRoot, 'docs/support-matrix.md'), 'utf8'),
]);

function completeEvidence() {
  const completed = clone(evidence);
  completed.galleryCommit = 'b'.repeat(40);
  for (const session of completed.sessions) {
    session.tester = '@release-observer';
    session.observedAt = '2026-07-20T19:00:00+03:00';
    session.locale = 'en-US';
    session.device = {
      kind: 'physical',
      manufacturer: session.platform === 'android' ? 'Google' : 'Apple',
      model:
        session.platform === 'android'
          ? 'Pixel test device'
          : 'iPhone test device',
      osVersion: session.platform === 'android' ? 'Android 16' : 'iOS 19',
      architecture: 'arm64',
      assistiveTechnologyVersion:
        session.platform === 'android'
          ? 'TalkBack test version'
          : 'VoiceOver system version',
    };
    session.runtime = {
      expoGoVersion: 'test version',
      reactNativeVersion: '0.86.0',
    };
    session.evidence = [
      `https://github.com/annabilik/chessboard-native/issues/${session.platform === 'android' ? '44' : '45'}`,
    ];
    for (const result of session.results) {
      result.status = 'passed';
    }
  }
  return completed;
}

function completedDocumentation(completed) {
  let summary = evidenceSummary
    .replace(
      '- Status: pending physical validation',
      '- Status: complete physical validation',
    )
    .replace(
      '- Gallery fixture commit: pending',
      `- Gallery fixture commit: \`${completed.galleryCommit}\``,
    )
    .replace(
      /No physical result is claimed yet\.[\s\S]+?automated\s+audits alone\./,
      'Both physical sessions passed. The machine record and linked artifacts contain the reviewed observations.',
    );
  let matrix = supportMatrix;

  for (const session of completed.sessions) {
    const platform = session.platform === 'android' ? 'Android' : 'iOS';
    const device = `${session.device.manufacturer} ${session.device.model}; ${session.device.osVersion}`;
    const references = session.evidence
      .map((reference) => `[artifact](${reference})`)
      .join('<br>');
    summary = summary.replace(
      new RegExp(`^\\|\\s*${platform}\\s*\\|[^\n]+$`, 'm'),
      `| ${platform} | ${session.assistiveTechnology} | Passed | ${device} | ${references} |`,
    );
    matrix = matrix.replace(
      new RegExp(
        `^\\|\\s*Physical ${session.assistiveTechnology}\\s*\\|[^\n]+$`,
        'm',
      ),
      `| Physical ${session.assistiveTechnology} | Complete | Completed exact-package physical validation; see the recorded evidence. |`,
    );
  }

  return { evidenceSummary: summary, supportMatrix: matrix };
}

test('accepts the canonical checklist and exact pending evidence structure', async () => {
  assert.equal(
    validateChecklist({ checklist, documentation, galleryCatalog }).length,
    26,
  );
  validateEvidenceSchema(evidence, schema);
  assert.deepEqual(validateAccessibilityEvidence({ checklist, evidence }), {
    checkCount: 26,
    hasObservations: false,
    pendingResults: 52,
    sessionCount: 2,
  });
  assert.deepEqual(await checkRepositoryAccessibilityEvidence(), {
    checkCount: 26,
    hasObservations: false,
    pendingResults: 52,
    sessionCount: 2,
  });
});

test('accepts complete evidence tied to the expected package archive', () => {
  const completed = completeEvidence();
  validateEvidenceSchema(completed, schema);

  assert.deepEqual(
    validateAccessibilityEvidence({
      checklist,
      evidence: completed,
      complete: true,
      expectedVersion: evidence.package.version,
      expectedSourceCommit: evidence.package.sourceCommit,
      expectedArchiveSha256: evidence.package.archiveSha256,
      expectedPublicationRun: evidence.package.publicationRun,
    }),
    {
      checkCount: 26,
      hasObservations: true,
      pendingResults: 0,
      sessionCount: 2,
    },
  );
});

test('automatically rejects apparent pass results without completion evidence', () => {
  const apparentPass = clone(evidence);
  for (const session of apparentPass.sessions) {
    for (const result of session.results) result.status = 'passed';
  }

  assert.throws(
    () =>
      validateAccessibilityEvidence({
        checklist,
        evidence: apparentPass,
      }),
    /android tester must be recorded/,
  );
});

test('rejects missing, duplicate, reordered, and unknown checklist IDs', () => {
  const duplicate = clone(evidence);
  duplicate.sessions[0].results[1].id = duplicate.sessions[0].results[0].id;
  assert.throws(
    () => validateAccessibilityEvidence({ checklist, evidence: duplicate }),
    /every manual check exactly once in canonical order/,
  );

  const reordered = clone(evidence);
  reordered.sessions[1].results.reverse();
  assert.throws(
    () => validateAccessibilityEvidence({ checklist, evidence: reordered }),
    /every manual check exactly once in canonical order/,
  );

  const unknownRoute = clone(checklist);
  unknownRoute.checks[0].routes = ['missing-route'];
  assert.throws(
    () =>
      validateChecklist({
        checklist: unknownRoute,
        documentation,
        galleryCatalog,
      }),
    /unknown gallery route missing-route/,
  );
});

test('requires notes for failed or blocked observations', () => {
  for (const status of ['failed', 'blocked']) {
    const result = clone(evidence);
    result.sessions[0].results[0].status = status;
    assert.throws(
      () => validateAccessibilityEvidence({ checklist, evidence: result }),
      new RegExp(`android A11Y-01 ${status} result requires notes`),
    );
  }
});

test('rejects incomplete sessions at the complete gate', () => {
  assert.throws(
    () =>
      validateAccessibilityEvidence({
        checklist,
        evidence,
        complete: true,
      }),
    /android tester must be recorded/,
  );

  const pending = completeEvidence();
  pending.sessions[1].results[25].status = 'not-run';
  assert.throws(
    () =>
      validateAccessibilityEvidence({
        checklist,
        evidence: pending,
        complete: true,
      }),
    /ios has incomplete checks: A11Y-26=not-run/,
  );
});

test('rejects platform, schema, and exact-package mismatches', () => {
  const wrongAssistiveTechnology = clone(evidence);
  wrongAssistiveTechnology.sessions[0].assistiveTechnology = 'VoiceOver';
  assert.throws(
    () => validateEvidenceSchema(wrongAssistiveTechnology, schema),
    /must be equal to constant/,
  );

  const duplicatePlatform = clone(evidence);
  duplicatePlatform.sessions[1].platform = 'android';
  duplicatePlatform.sessions[1].assistiveTechnology = 'TalkBack';
  assert.throws(
    () =>
      validateAccessibilityEvidence({
        checklist,
        evidence: duplicatePlatform,
      }),
    /exactly one Android and one iOS session/,
  );

  assert.throws(
    () =>
      validateAccessibilityEvidence({
        checklist,
        evidence,
        expectedVersion: '0.1.0-next.999',
      }),
    /version is 0\.1\.0-next\.2, expected 0\.1\.0-next\.999/,
  );

  for (const [field, option, label] of [
    ['sourceCommit', 'expectedSourceCommit', 'source commit'],
    ['archiveSha256', 'expectedArchiveSha256', 'archive SHA-256'],
    ['publicationRun', 'expectedPublicationRun', 'publication run'],
  ]) {
    const mismatch = clone(evidence);
    mismatch.package[field] =
      field === 'publicationRun'
        ? 'https://github.com/annabilik/chessboard-native/actions/runs/1'
        : field === 'sourceCommit'
          ? 'c'.repeat(40)
          : 'd'.repeat(64);
    assert.throws(
      () =>
        validateAccessibilityEvidence({
          checklist,
          evidence: mismatch,
          [option]: evidence.package[field],
        }),
      new RegExp(`${label} is`),
    );
  }
});

test('requires physical devices and durable HTTPS evidence references', () => {
  const simulator = completeEvidence();
  simulator.sessions[0].device.kind = 'simulator';
  assert.throws(
    () => validateEvidenceSchema(simulator, schema),
    /must be equal to constant/,
  );

  for (const reference of [' ', 'x', 'http://example.com/result']) {
    const invalid = completeEvidence();
    invalid.sessions[0].evidence = [reference];
    assert.throws(
      () => validateEvidenceSchema(invalid, schema),
      /must match pattern/,
    );
  }
});

test('keeps derived Markdown status aligned with evidence state', () => {
  validateEvidenceDocumentation({
    evidenceSummary,
    supportMatrix,
    evidence,
  });
  assert.throws(
    () =>
      validateEvidenceDocumentation({
        evidenceSummary: evidenceSummary.replace(
          'pending physical validation',
          'complete physical validation',
        ),
        supportMatrix,
        evidence,
      }),
    /must declare: - Status: pending physical validation/,
  );
  const incorrectPlatformStatus = evidenceSummary.replace(
    '| Android  | TalkBack             | Pending |',
    '| Android  | TalkBack             | Passed  |',
  );
  assert.throws(
    () =>
      validateEvidenceDocumentation({
        evidenceSummary: incorrectPlatformStatus,
        supportMatrix,
        evidence,
      }),
    /Android evidence summary row must be Pending/,
  );
});

test('requires completed human-readable commit, device, and artifact details', () => {
  const completed = completeEvidence();
  const completedDocs = completedDocumentation(completed);
  validateEvidenceDocumentation({ ...completedDocs, evidence: completed });

  assert.throws(
    () =>
      validateEvidenceDocumentation({
        ...completedDocs,
        evidenceSummary: `${completedDocs.evidenceSummary}\nNo physical result is claimed yet.`,
        evidence: completed,
      }),
    /must not retain pending narrative/,
  );

  assert.throws(
    () =>
      validateEvidenceDocumentation({
        evidenceSummary: evidenceSummary.replace(
          '- Status: pending physical validation',
          '- Status: complete physical validation',
        ),
        supportMatrix,
        evidence: completed,
      }),
    /Gallery fixture commit/,
  );

  const staleSupport = supportMatrix
    .replace(
      /^\|\s*Physical TalkBack\s*\|\s*Manual pending\s*\|/m,
      '| Physical TalkBack | Complete |',
    )
    .replace(
      /^\|\s*Physical VoiceOver\s*\|\s*Manual pending\s*\|/m,
      '| Physical VoiceOver | Complete |',
    );
  assert.throws(
    () =>
      validateEvidenceDocumentation({
        evidenceSummary: completedDocs.evidenceSummary,
        supportMatrix: staleSupport,
        evidence: completed,
      }),
    /completed support row must not retain pending wording/,
  );
});

test('rejects nonexistent or changed gallery fixture bindings', () => {
  assert.throws(
    () =>
      validateGalleryBinding({
        galleryCommit: 'b'.repeat(40),
        commitExists: false,
        isAncestor: false,
        changedPaths: [],
      }),
    /does not identify a Git commit/,
  );
  assert.throws(
    () =>
      validateGalleryBinding({
        galleryCommit: 'b'.repeat(40),
        commitExists: true,
        isAncestor: true,
        changedPaths: ['apps/example/app/spare-pieces.tsx'],
      }),
    /physical validation fixtures differ/,
  );
  assert.throws(
    () =>
      validateGalleryBinding({
        galleryCommit: 'b'.repeat(40),
        commitExists: true,
        isAncestor: false,
        changedPaths: [],
      }),
    /not an ancestor of HEAD/,
  );
});
