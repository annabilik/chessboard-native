# Release runbook

This runbook releases both stable versions and prereleases of the standalone
`@vibechess/chessboard-native` package from this repository. It must not read,
modify, build, or publish any VibeChess application or private codebase. A
release is sourced from `annabilik/chessboard-native`, and the package archive
must contain only the allowlisted open-source package files.

Do not infer current npm registry state from this document. npm versions are
immutable once accepted, even when a later workflow verification step fails.
Record publication and verification as separate release evidence.

## Release channels

The manifest version selects the channel, and every tool derives the dist-tag
from it rather than hardcoding one:

<!-- markdownlint-disable MD013 -->

| Version shape  | Channel    | npm dist-tag | `latest` after publishing                |
| -------------- | ---------- | ------------ | ---------------------------------------- |
| `X.Y.Z-next.N` | prerelease | `next`       | preserved at its exact pre-publish value |
| `X.Y.Z`        | stable     | `latest`     | moves to the published version           |

<!-- markdownlint-enable MD013 -->

`scripts/check-prerelease.mjs` requires `publishConfig.tag` to match the
channel, the workflow computes `npm-tag` from the archive version, and
`scripts/check-release-tags.mjs` derives the expected `latest` from it.

A stable release publishes under `latest` only. Trusted publishing authorizes
`npm publish` and not `npm dist-tag`, so `next` keeps pointing at the most
recent prerelease and can resolve _older_ than `latest` between cycles; that is
expected. Publishing runs snapshot `next` immediately before publication and
require that exact value to remain unchanged. Move it deliberately with
`npm dist-tag add` if a release should also claim `next`.

## Release rules

- Publish prereleases only under the npm `next` dist-tag, and stable versions
  only under `latest`. npm necessarily initializes `latest` when the first
  version of a new package is published, even with `--tag next`. Bootstrap
  verification requires that initial value to equal the first version; every
  later **prerelease** must preserve the exact pre-publish `latest` value,
  while a **stable** release is the one operation that legitimately moves it.
- Release only a clean commit on `main` after its required CI checks pass.
- Use `.github/workflows/release.yml` through GitHub Actions. Do not publish a
  separately packed local archive.
- The workflow's `dry-run` mode is the default. Publishing requires explicitly
  selecting either `bootstrap-token` or `trusted-oidc` and supplying the exact
  `expected-version`.
- `verify-registry` verifies an already published immutable version. It skips
  the dry-run and publish jobs, requires an explicit `expected-latest`, and
  receives no npm token, protected environment, or OIDC write permission. For
  a stable-only package, the optional `next` dist-tag may be absent.
- Both publishing modes use the protected GitHub environment named `npm`.
- Never reuse a version. Every correction receives a new version.

## Prepare a stable release with Changesets

A stable version leaves Changesets prerelease mode and consumes the
accumulated changesets:

```sh
pnpm install --frozen-lockfile
pnpm changeset status
pnpm changeset pre exit
pnpm changeset version
pnpm install
```

`pre exit` removes `.changeset/pre.json`. Then set `publishConfig.tag` to
`latest` in `packages/chessboard-native/package.json`, because
`pnpm release:check` requires the tag to match the channel the version selects.
Review the resulting version and changelog, commit the manifest, lockfile,
changelog, and Changesets state in a pull request, and run `pnpm verify` before
merging. Everything after this point — dry run, publish, post-release
verification — is identical for both channels; only the dist-tag differs.

To return to prereleases afterwards, run `pnpm changeset pre enter next` and
set `publishConfig.tag` back to `next`.

## Prepare a prerelease with Changesets

Start from a clean, up-to-date `main` checkout. Review the pending changesets,
then enter Changesets prerelease mode if the repository is not already in it:

```sh
pnpm install --frozen-lockfile
pnpm changeset status
pnpm changeset pre enter next
pnpm changeset version
pnpm install
```

When `.changeset/pre.json` already records `next` prerelease mode, do not run
`pre enter` again. Add changesets for new package changes and run
`pnpm changeset version`; Changesets advances the prerelease suffix.

Review the resulting package version and changelog. It must be exactly one
unpublished `0.1.0-next.N` version. Review and commit all intentional manifest,
lockfile, changelog, and Changesets state changes in a pull request. Run the
portable release gate before merging:

```sh
pnpm verify
```

After the release-preparation pull request is merged, copy the exact version
from `packages/chessboard-native/package.json`. That value is the workflow's
required `expected-version`; do not infer it from the most recent npm tag.

## Dry run

From the repository's **Actions** tab, run the **npm release** workflow on
`main`:

1. Leave `mode` at its default, `dry-run`.
2. Enter the exact manifest value for `expected-version`.
3. Confirm the workflow builds and inspects one npm archive, installs that same
   archive into clean Expo and bare React Native consumers, and completes npm's
   publish dry run.

`dry-run` does not publish, create a dist-tag, or require npm credentials. Stop
if the requested version, archive metadata, clean-consumer install, or package
inspection disagrees with the reviewed release commit.

Selecting a publishing mode does not bypass this gate: that workflow run repeats
the same dry-run job, and the protected publish job cannot start unless it
succeeds.

## First-publish bootstrap

npm trusted publishing is configured on an existing package's npm settings
page. The first public package version therefore uses a one-time token, after
which all token credentials are removed.

Before the bootstrap:

1. Confirm that the npm account or organization owning the `@vibechess` scope
   permits the release operator to publish a new public package. Verify its
   email, enable two-factor authentication, and retain its recovery codes.
2. Create or verify a protected GitHub environment named `npm`. Require a
   reviewer for deployment if repository policy supports it, and restrict
   deployments to `main`.
3. On npm, create a short-lived granular access token with **Packages and
   scopes: Read and write** for the `@vibechess` scope and **Bypass 2FA** enabled
   for this non-interactive bootstrap. Use the shortest practical expiration;
   do not grant unrelated organization permissions, and do not store it locally
   or at repository scope.
4. Add it as the `NPM_TOKEN` secret on the protected `npm` environment.
5. Complete a successful `dry-run` for the same commit and
   `expected-version`.

Dispatch the **npm release** workflow on `main` with:

- `mode`: `bootstrap-token`
- `expected-version`: the exact reviewed `0.1.0-next.N` manifest version

The workflow must publish the already inspected archive explicitly as a public
scoped package under `next`; its effective command is equivalent to:

```sh
npm publish /path/to/inspected-chessboard-native.tgz --access public --tag next
```

The workflow must not repack after inspection. After publication, it downloads
that exact version from the npm registry, verifies the registry artifact, and
installs the downloaded artifact into clean Expo and bare React Native
consumers. Treat a failed post-publish verification as a failed release even
though npm has accepted the immutable version. For the first package version,
the verifier also requires npm's automatically initialized `latest` tag to
equal that version; this is the sole prerelease exception to preserving an
older `latest` value.

The bootstrap publication on July 18, 2026, was accepted as
`@vibechess/chessboard-native@0.1.0-next.0` with provenance. Both `next` and
npm's mandatory initial `latest` resolve to that version. Workflow run
[`29650521219`](https://github.com/annabilik/chessboard-native/actions/runs/29650521219)
then failed only because the old verifier incorrectly rejected the mandatory
initial `latest` tag; it must never be rerun in a publishing mode.

## Recover post-publish verification

When npm accepted a version but a later workflow check failed, never rerun the
publishing mode and never attempt to reuse the version. After correcting only
the verification code, dispatch **npm release** on `main` with:

- `mode`: `verify-registry`
- `expected-version`: the exact immutable version already on npm
- `expected-latest`: the exact `latest` value independently observed for that
  release

Recovery mode prepares and inspects the package from `main`, compares its exact
SHA-256 digest with the registry tarball, checks the observed `next` value and
the supplied `latest` expectation and provenance, and repeats the clean Expo
and bare React Native consumer checks. It cannot publish: the job does not
enter the protected `npm` environment, request an OIDC token, or receive
`NPM_TOKEN`.

For the accepted bootstrap release, supply `0.1.0-next.0` for both version
inputs. This records a green, credential-free verification of the bytes that
npm already accepted; it does not create a new version or move a dist-tag.

Recovery workflow run
[`29653184776`](https://github.com/annabilik/chessboard-native/actions/runs/29653184776)
completed successfully on July 18, 2026. It verified the exact registry bytes,
`next` and `latest`, provenance, and clean Expo and bare React Native consumers
without executing either publishing job.

## Enable trusted publishing

After the bootstrap workflow and its registry checks succeed, open the package
settings on npm and configure a GitHub Actions trusted publisher with exactly:

| npm trusted-publisher field | Value               |
| --------------------------- | ------------------- |
| Organization or user        | `annabilik`         |
| Repository                  | `chessboard-native` |
| Workflow filename           | `release.yml`       |
| Environment name            | `npm`               |
| Allowed action              | `npm publish`       |

Allow the publisher to perform `npm publish`. The package's `repository.url`
must remain exactly
`git+https://github.com/annabilik/chessboard-native.git`. See npm's
[trusted publishing documentation](https://docs.npmjs.com/trusted-publishers/)
for the settings and OIDC security model.

The trusted publisher was configured after the successful recovery run. Its
proof release was the prepared `0.1.0-next.1` version through `trusted-oidc`.
That mode never injects `NPM_TOKEN`; publication, provenance, registry-byte
verification, and clean-consumer checks must all succeed through OIDC.

The first trusted-publishing attempt, workflow run
[`29655350415`](https://github.com/annabilik/chessboard-native/actions/runs/29655350415),
stopped before `npm publish` because a shared `actions/setup-node` registry
configuration generated token-authentication environment state. The corrective
workflow configures `registry-url` only for `bootstrap-token`; `trusted-oidc`
uses a separate Node.js setup and fails closed if `NODE_AUTH_TOKEN`, `NPM_TOKEN`,
or `NPM_CONFIG_USERCONFIG` is present. npm did not accept `0.1.0-next.1` during
that failed run.

Fresh dry-run workflow run
[`29656864085`](https://github.com/annabilik/chessboard-native/actions/runs/29656864085)
then completed successfully on corrected `main` commit
`8d3c419f9e2fc9ad29034649c9929252fe2a0c0a`. Trusted-publishing workflow run
[`29657036632`](https://github.com/annabilik/chessboard-native/actions/runs/29657036632)
published `@vibechess/chessboard-native@0.1.0-next.1` from that same commit. The
bootstrap setup and token-publish steps were skipped. The workflow verified the
exact registry tarball digest, confirmed npm exposed a Sigstore/SLSA provenance
URL with predicate-type metadata, and verified clean Expo and bare React
Native consumers. The registry attestation identifies the repository, workflow,
branch, commit, and run. `next` moved to `0.1.0-next.1`; `latest` correctly
remained on the bootstrap version `0.1.0-next.0`.

After that proof, the one-time granular token was revoked on npm and
`NPM_TOKEN` was deleted from the protected GitHub `npm` environment. Repository
and environment secret scopes contain no replacement npm token. Trusted
publishing is now the automated release path; do not recreate or fall back to a
long-lived publish token when OIDC needs correction.

## Subsequent OIDC releases

For every later release on either channel, prepare and merge a new Changesets
version, run the workflow in `dry-run`, and then dispatch it on `main` with:

- `mode`: `trusted-oidc`
- `expected-version`: the exact reviewed manifest version

The protected `npm` environment provides approval policy, while GitHub's OIDC
identity authorizes npm. `trusted-oidc` must run without `NPM_TOKEN` or another
long-lived npm credential. The workflow publishes the one inspected archive
under the version-derived tag: `latest` for a stable version or `next` for a
prerelease. It then redownloads the immutable registry version and repeats the
artifact and clean-consumer installation checks. A stable publish must preserve
the exact pre-publish `next` value; a prerelease must preserve the exact
pre-publish `latest` value. Do not proceed if GitHub asks for a token instead
of using trusted publishing.

### 0.1.0-next.2 publication record

Protected workflow run
[`29760766252`](https://github.com/annabilik/chessboard-native/actions/runs/29760766252)
published `@vibechess/chessboard-native@0.1.0-next.2` through trusted OIDC on
July 20, 2026 from reviewed `main` commit
`addc0cb8a7e4d6f4302e25e21c124766279ca82b`. All four jobs passed: preparation,
npm dry run, publication, and registry verification.

The independently downloaded registry archive contains 431 entries and has
SHA-256
`69546ea3fd9fc2a89ac4053be21a1d57e537c0ecbe27c5ea7bac02df07412916`,
exactly matching the inspected workflow archive. Its SLSA provenance binds the
package to this repository, `.github/workflows/release.yml`, `main`, the source
commit above, and the workflow invocation. Registry-installed Expo Android and
iOS exports, Expo type checking, and bare React Native type checking passed.
The `next` tag moved to `0.1.0-next.2`; `latest` intentionally remained on the
bootstrap version `0.1.0-next.0`.

## Post-release checks

After either publishing mode succeeds, verify the public registry state from a
credential-free shell:

```sh
npm view @vibechess/chessboard-native@0.1.0 version
npm view @vibechess/chessboard-native@latest version
npm view @vibechess/chessboard-native@next version
npm dist-tag ls @vibechess/chessboard-native
npm pack @vibechess/chessboard-native@0.1.0 --ignore-scripts
```

Replace `0.1.0` in the exact-version commands with the workflow's reviewed
`expected-version` when checking another release.

Confirm all of the following:

- the exact version resolves to the workflow `expected-version`;
- the selected channel tag resolves to that version: `latest` for stable or
  `next` for prerelease;
- the other channel tag remains at its recorded pre-publish value: `next` for
  stable or `latest` for prerelease;
- for a first-package bootstrap, npm's mandatory `latest` initialization
  matches the published version;
- the registry archive passes the workflow's artifact checks and clean Expo
  and bare React Native installs;
- npm displays repository, license, README, provenance, and public access as
  intended; and
- the GitHub workflow run, commit SHA, package version, and registry integrity
  are recorded together in the release evidence.

Do not update documentation to claim the package is published until these
checks pass.

## Bad release or rollback

npm versions are immutable. Never try to overwrite a bad version, and avoid
unpublishing because consumers and lockfiles may already reference it.

1. Deprecate the affected version with an actionable reason:

   ```sh
   affected_version=0.1.0
   npm deprecate \
     "@vibechess/chessboard-native@$affected_version" \
     "Do not use: <reason>; upgrade to <replacement>"
   ```

   Replace the example value with the exact affected stable or prerelease
   version.

2. If a known-good prerelease exists, point `next` back to it; otherwise remove
   the `next` tag until a correction is ready. Never move `latest` backwards to
   recover a prerelease; a bad stable release is corrected by publishing a new
   stable version that claims `latest`:

   ```sh
   npm dist-tag add @vibechess/chessboard-native@0.1.0-next.M next
   # Or, when no prerelease should be installable by tag:
   npm dist-tag rm @vibechess/chessboard-native next
   ```

3. Add a corrective changeset, produce a new stable or prerelease version as
   appropriate, and repeat the complete dry-run and trusted-publishing
   workflow.

Use `npm unpublish` only for an exceptional legal or security incident after
checking npm policy and coordinating the response. Unpublishing is not a
normal rollback mechanism.
