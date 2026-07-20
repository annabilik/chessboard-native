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
17 or newer. Native CI is temporarily disabled; setting the repository Actions
variable `RUN_NATIVE_CI=true` restores both native Release builds and audits.
The always-on clean-consumer job installs the single inspected npm archive into
Expo and bare consumers outside the checkout. The opt-in jobs add native
compilation and audits against those exact bytes; workspace-linked builds are
development conveniences, not package-release evidence.

Automated native audits supplement the manual TalkBack and VoiceOver checklist
in `docs/accessibility.md`; they do not validate speech, rotor or action-menu
discoverability, announcements, or live assistive-technology focus behavior.

## Parity ledger changes

Do not edit the pinned `fixtures/parity/upstream-b74704a` source or licenses.
The machine-readable `fixtures/parity/react-chessboard-5.10.json` file is the
only authored parity source; regenerate its rendered document with
`pnpm parity:update`.

Implementation status is forward-only: `planned` may move to `in-progress` or
`implemented`, and `in-progress` may move to `implemented`. The frozen ledger
keeps every disposition implemented—including `redesign` and `drop`—and each
row must have one collected passing result matching its unique `contractTestId`;
placing the ID in source text does not count. Result shards follow
`fixtures/parity/results.schema.json` and are supplied with repeated
`--results <path>` arguments. Contract tests put the ID at the start of an
executed Jest title, for example `[PARITY-OPTION-POSITION] ...`; the CI runner
collects raw output and creates the commit-bound shard. Do not author or commit
result shards. Required CI runs the complete gate. It also compares pull
requests with their base manifest and rejects removed rows, status regressions,
and changes to an implemented row's disposition, native mapping, or contract
ID.

## Public API snapshot changes

The reviewed public declaration snapshots cover the package root, the `pieces`
subpath, and the `react-chessboard-compat` subpath under
`packages/chessboard-native/etc`. The package export map and its resolver fields
are part of the same public contract. Deep imports below `src` or `lib` are not
public API.

With the public API frozen, treat any declaration, public subpath,
export condition, or resolver-target change as intentional API work. Add the
lowest authoritative tests, update the human-readable API documentation, and
add a Changeset when the published package behavior changes. Run
`pnpm api:update` only after reviewing the generated declaration diff; never
update a report merely to make `pnpm api:check` pass.

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

Release preparation and publication are separate reviewed operations. Merging a
pull request never publishes the package; maintainers follow
[`docs/releasing.md`](./docs/releasing.md) and start with the workflow's default
dry-run mode.

By contributing, you agree that your contribution is licensed under the MIT
License in this repository.
