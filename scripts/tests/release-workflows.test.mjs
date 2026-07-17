import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const repositoryRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../..',
);
const releaseWorkflow = await readFile(
  path.join(repositoryRoot, '.github/workflows/release.yml'),
  'utf8',
);
const ciWorkflow = await readFile(
  path.join(repositoryRoot, '.github/workflows/ci.yml'),
  'utf8',
);

function jobBlock(workflow, jobName) {
  const marker = `  ${jobName}:\n`;
  const start = workflow.indexOf(marker);
  assert.notEqual(start, -1, `Missing ${jobName} job`);

  const rest = workflow.slice(start + marker.length);
  const nextJob = /\n {2}[a-z][a-z0-9-]*:\n/u.exec(rest);
  return workflow.slice(
    start,
    nextJob ? start + marker.length + nextJob.index : workflow.length,
  );
}

test('keeps prerelease publication manual, main-only, and dry-run first', () => {
  assert.match(releaseWorkflow, /^on:\n {2}workflow_dispatch:/mu);
  assert.doesNotMatch(
    releaseWorkflow,
    /^ {2}(?:push|pull_request|schedule):/mu,
  );
  assert.match(releaseWorkflow, /default: dry-run/u);
  assert.match(
    releaseWorkflow,
    /options:\n {10}- dry-run\n {10}- bootstrap-token\n {10}- trusted-oidc/u,
  );
  assert.match(releaseWorkflow, /RELEASE_REF.*github\.ref/u);
  assert.match(releaseWorkflow, /refs\/heads\/main/u);
});

test('publishes only the exact inspected archive under next', () => {
  const prepare = jobBlock(releaseWorkflow, 'prepare');
  const dryRun = jobBlock(releaseWorkflow, 'dry-run');
  const publish = jobBlock(releaseWorkflow, 'publish');

  assert.match(prepare, /inspect-package\.mjs --output "\$RELEASE_ARCHIVE"/u);
  assert.match(prepare, /--consumer expo/u);
  assert.match(prepare, /--consumer native/u);
  assert.match(prepare, /sha256sum "\$RELEASE_ARCHIVE"/u);
  assert.match(
    dryRun,
    /npm publish "\$ARCHIVE" --dry-run --access public --tag next/u,
  );
  assert.doesNotMatch(dryRun, /^ {4}if:/mu);
  assert.match(publish, /environment: npm/u);
  assert.match(publish, /^ {6}- dry-run$/mu);
  assert.match(publish, /id-token: write/u);
  assert.equal(
    publish.match(
      /npm publish "\$ARCHIVE" --access public --tag next --provenance/gu,
    )?.length,
    2,
  );
  assert.match(publish, /secrets\.NPM_TOKEN/u);
  assert.match(publish, /npm view "\$PACKAGE_NAME@next" version/u);
  assert.doesNotMatch(publish, /npm view "\$PACKAGE_NAME" dist-tags/u);
  assert.doesNotMatch(publish, /changeset publish|npm publish packages\//u);
  assert.doesNotMatch(
    releaseWorkflow,
    /gradlew|xcodebuild|expo prebuild|run-android|run-ios|pod install/u,
  );
});

test('requires lightweight clean consumers while native compilation stays opt-in', () => {
  const baseline = jobBlock(ciWorkflow, 'baseline');
  const cleanConsumers = jobBlock(ciWorkflow, 'packed-consumers');
  const nativeExpo = jobBlock(ciWorkflow, 'packed-expo');
  const nativeAndroid = jobBlock(ciWorkflow, 'packed-bare-android');
  const nativeIos = jobBlock(ciWorkflow, 'packed-bare-ios');
  const gate = jobBlock(ciWorkflow, 'ci-gate');

  assert.match(baseline, /pnpm release:check/u);
  assert.doesNotMatch(cleanConsumers, /^ {4}if:/mu);
  assert.match(cleanConsumers, /--consumer expo/u);
  assert.match(cleanConsumers, /--consumer native/u);
  assert.equal(cleanConsumers.match(/npm run typecheck/gu)?.length, 2);
  assert.match(cleanConsumers, /npm run export:native/u);
  assert.doesNotMatch(
    cleanConsumers,
    /gradlew|xcodebuild|expo prebuild|run-android|run-ios|pod install/u,
  );

  for (const nativeJob of [nativeExpo, nativeAndroid, nativeIos]) {
    assert.match(nativeJob, /if:.*RUN_NATIVE_CI == 'true'/u);
  }

  assert.match(gate, /^ {6}- packed-consumers$/mu);
  assert.match(gate, /PACKED_CONSUMERS_RESULT/u);
});
