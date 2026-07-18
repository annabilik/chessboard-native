# Prerelease runbook

This runbook releases only the standalone
`@vibechess/chessboard-native` package from this repository. It must not read,
modify, build, or publish any VibeChess application or private codebase. A
release is sourced from `annabilik/chessboard-native`, and the package archive
must contain only the allowlisted open-source package files.

Do not infer current npm registry state from this document. npm versions are
immutable once accepted, even when a later workflow verification step fails.
Record publication and verification as separate release evidence.

## Release rules

- Publish prereleases only under the npm `next` dist-tag. The package manifest
  pins `publishConfig.tag` to `next` as a backstop, and the workflow still
  supplies `--tag next` explicitly. npm necessarily initializes `latest` when
  the first version of a new package is published, even with `--tag next`.
  Bootstrap verification requires that initial value to equal the first
  version; every later prerelease must preserve the exact pre-publish `latest`
  value.
- Release only a clean commit on `main` after its required CI checks pass.
- Use `.github/workflows/release.yml` through GitHub Actions. Do not publish a
  separately packed local archive.
- The workflow's `dry-run` mode is the default. Publishing requires explicitly
  selecting either `bootstrap-token` or `trusted-oidc` and supplying the exact
  `expected-version`.
- `verify-registry` verifies an already published immutable version. It skips
  the dry-run and publish jobs, requires an explicit `expected-latest`, and
  receives no npm token, protected environment, or OIDC write permission.
- Both publishing modes use the protected GitHub environment named `npm`.
- Never reuse a version. Every correction receives a new
  `0.1.0-next.N` version.

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

From the repository's **Actions** tab, run the **npm prerelease** workflow on
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

Dispatch the **npm prerelease** workflow on `main` with:

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
the verification code, dispatch **npm prerelease** on `main` with:

- `mode`: `verify-registry`
- `expected-version`: the exact immutable version already on npm
- `expected-latest`: the exact `latest` value independently observed for that
  release

Recovery mode prepares and inspects the package from `main`, compares its exact
SHA-256 digest with the registry tarball, checks the supplied `next` and
`latest` expectations and provenance, and repeats the clean Expo and bare React
Native consumer checks. It cannot publish: the job does not enter the protected
`npm` environment, request an OIDC token, or receive `NPM_TOKEN`.

For the accepted bootstrap release, supply `0.1.0-next.0` for both version
inputs. This records a green, credential-free verification of the bytes that
npm already accepted; it does not create a new version or move a dist-tag.

## Enable trusted publishing

After the bootstrap workflow and its registry checks succeed, open the package
settings on npm and configure a GitHub Actions trusted publisher with exactly:

| npm trusted-publisher field | Value               |
| --------------------------- | ------------------- |
| Organization or user        | `annabilik`         |
| Repository                  | `chessboard-native` |
| Workflow filename           | `release.yml`       |
| Environment name            | `npm`               |

Allow the publisher to perform `npm publish`. The package's `repository.url`
must remain exactly
`git+https://github.com/annabilik/chessboard-native.git`. See npm's
[trusted publishing documentation](https://docs.npmjs.com/trusted-publishers/)
for the settings and OIDC security model.

Prove the configuration before removing the recovery path. Prepare a new,
previously unpublished `0.1.0-next.N` version and dispatch `trusted-oidc` as
described below. That mode never injects `NPM_TOKEN`, even while the protected
environment still holds it. Confirm that publication, provenance, registry-byte
verification, and clean-consumer checks all succeed through OIDC.

Immediately after that proof succeeds:

1. Revoke the granular token on npm.
2. Delete `NPM_TOKEN` from the GitHub `npm` environment.
3. Confirm that no equivalent npm token exists as a repository or organization
   secret for this workflow.
4. Configure the package to require two-factor authentication and disallow
   token-based publishing, leaving trusted publishing as the automated path.

If OIDC authentication fails before npm accepts the new version, correct the
trusted-publisher fields and retry that version. Do not fall back to token mode.
The bootstrap token must not remain after a successful OIDC proof.

## Subsequent OIDC prereleases

For every later prerelease, prepare and merge a new Changesets version, run the
workflow in `dry-run`, and then dispatch it on `main` with:

- `mode`: `trusted-oidc`
- `expected-version`: the exact reviewed `0.1.0-next.N` manifest version

The protected `npm` environment provides approval policy, while GitHub's OIDC
identity authorizes npm. `trusted-oidc` must run without `NPM_TOKEN` or another
long-lived npm credential. The workflow publishes the one inspected archive
under `next`, then redownloads the immutable registry version and repeats the
artifact and clean-consumer installation checks. Do not proceed if GitHub asks
for a token instead of using trusted publishing.

## Post-release checks

After either publishing mode succeeds, verify the public registry state from a
credential-free shell:

```sh
npm view @vibechess/chessboard-native@next version
npm dist-tag ls @vibechess/chessboard-native
npm pack @vibechess/chessboard-native@0.1.0-next.N --ignore-scripts
```

Confirm all of the following:

- `@next` resolves to the exact workflow `expected-version`.
- for the bootstrap version, `latest` equals that first version; for every
  subsequent prerelease, `latest` remains equal to its recorded pre-publish
  value;
- the registry archive passes the workflow's artifact checks and clean Expo
  and bare React Native installs;
- npm displays repository, license, README, provenance, and public access as
  intended; and
- the GitHub workflow run, commit SHA, package version, and registry integrity
  are recorded together in the release evidence.

Do not update documentation to claim the package is published until these
checks pass.

## Bad prerelease or rollback

npm versions are immutable. Never try to overwrite a bad version, and avoid
unpublishing because consumers and lockfiles may already reference it.

1. Deprecate the affected version with an actionable reason:

   ```sh
   npm deprecate \
     @vibechess/chessboard-native@0.1.0-next.N \
     "Do not use: <reason>; upgrade to <replacement>"
   ```

2. If a known-good prerelease exists, point `next` back to it; otherwise remove
   the `next` tag until a correction is ready. Never move `latest`:

   ```sh
   npm dist-tag add @vibechess/chessboard-native@0.1.0-next.M next
   # Or, when no prerelease should be installable by tag:
   npm dist-tag rm @vibechess/chessboard-native next
   ```

3. Add a corrective changeset, produce a new `0.1.0-next.N` version, and repeat
   the complete dry-run and trusted-publishing workflow.

Use `npm unpublish` only for an exceptional legal or security incident after
checking npm policy and coordinating the response. Unpublishing is not a
normal rollback mechanism.
