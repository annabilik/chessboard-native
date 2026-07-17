# Changesets

Changesets describe user-visible package changes and drive versioning and
changelog generation.

Run `pnpm changeset` and follow the prompts when a pull request changes a public
package. Infrastructure-only and documentation-only changes do not need a
changeset unless they alter published behavior.

The private example and native harness are intentionally excluded from version
updates. While prerelease mode is active, `pnpm changeset version` advances the
public package's `next` version and changelog. It does not publish; maintainers
must use the guarded procedure in [`docs/releasing.md`](../docs/releasing.md).
