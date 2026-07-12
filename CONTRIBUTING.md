# Contributing

Thanks for helping build `chessboard-native`.

The project is intentionally controlled and rules-free: consumers own the
position and annotations, while the library owns only transient presentation
and interaction state. Changes that introduce a second canonical board state
or a bundled chess rules engine are out of scope.

## Development setup

Prerequisites:

- Node.js 24.15.0
- pnpm 11.11.0 through Corepack or an equivalent pinned installation

Changes to the bare native harness additionally require JDK 17 and the Android
SDK for Android builds, or macOS with Xcode, Ruby, Bundler, and CocoaPods for
iOS builds.

```sh
corepack enable
pnpm install --frozen-lockfile
pnpm verify
```

Use the repository's pinned versions. Do not commit dependency changes without
the resulting `pnpm-lock.yaml` update.

`pnpm verify` is the portable pull-request gate. When changing the native
harness, also run the applicable platform build:

```sh
pnpm native:android:release
pnpm native:android:accessibility
pnpm native:ios:gems
pnpm native:ios:pods
pnpm native:ios:release
pnpm native:ios:accessibility
```

The Android accessibility command needs a running device or emulator. The iOS
accessibility command selects an available iPhone simulator and requires iOS
17 or newer. CI runs both native Release builds and audits even when only one
platform can be exercised on a contributor's development machine. Those
required jobs install the single inspected npm archive into consumers outside
the checkout; workspace-linked builds are development conveniences, not
package-release evidence.

Automated native audits supplement the manual TalkBack and VoiceOver checklist
in `docs/accessibility.md`; they do not validate speech, rotor or action-menu
discoverability, announcements, or live assistive-technology focus behavior.

## Parity ledger changes

Do not edit the pinned `fixtures/parity/upstream-b74704a` source or licenses.
The machine-readable `fixtures/parity/react-chessboard-5.10.json` file is the
only authored parity source; regenerate its rendered document with
`pnpm parity:update`.

Implementation status is forward-only: `planned` may move to `in-progress` or
`implemented`, and `in-progress` may move to `implemented`. An implemented
`keep`/`adapt` row must have one collected passing result matching its unique
`contractTestId`; placing the ID in source text does not count. Result shards follow
`fixtures/parity/results.schema.json` and are supplied with repeated
`--results <path>` arguments. Contract tests put the ID at the start of an
executed Jest title, for example `[PARITY-OPTION-POSITION] ...`; the CI runner
collects raw output and creates the commit-bound shard. Do not author or commit
result shards. CI compares pull requests with their base manifest and rejects
removed rows, status regressions, and changes to an implemented row's
disposition, native mapping, or contract ID.

## Pull requests

- Keep each pull request focused and explain user-visible behavior.
- Add tests at the lowest authoritative layer when implementation code exists.
- Update documentation with public API or behavior changes.
- Run `pnpm verify` before requesting review.
- Do not include proprietary VibeChess code or artwork.
- Do not vendor third-party source or assets without their license and
  attribution.

Run `pnpm changeset` for changes to a published package that require a release
note or semantic-version update. Infrastructure-only and documentation-only
changes normally do not need one.

By contributing, you agree that your contribution is licensed under the MIT
License in this repository.
