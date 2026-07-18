# chessboard-native

A controlled, rules-free React Native chessboard component.

> [!NOTE]
> The planned Phase 2 implementation packages and controlled-transition runtime
> through P3.4 are implemented. P3.5 published
> `@vibechess/chessboard-native@0.1.0-next.1` through npm trusted publishing
> after a clean dry run. The registry bytes, provenance, and clean Expo and bare
> React Native consumers passed verification; `next` resolves to that version
> while npm's mandatory initial `latest` remains `0.1.0-next.0`. The public
> component renders responsive, controlled positions with default or custom
> pieces, orientation, notation, native styles, controlled square and arrow
> annotations, revision-safe annotation operations, controlled selection
> styling, and one adjustable accessibility control. Its optional
> interaction surface supports board-piece drag, controlled
> touch/accessibility square activation, public spare-piece drag and accessible
> placement, and accessible move, removal, clearing, and cancellation without
> committing position or selection internally.
> `ChessboardProvider` supplies provider-scoped board identity, one shared
> transient overlay, and stale-safe external-drop measurement for single- and
> multi-board composition. Pure position-transition plans are deterministic and
> revision-correlated internally. The mounted runtime animates ordinary and
> special moves, preserves identity-safe visual continuity across interruption
> and geometry changes, and hands correlated pending targets to controlled
> commits without retaining a renderable shadow position.

## Direction

`chessboard-native` will provide the useful native behavior of
`react-chessboard` without copying its browser implementation or creating a
second source of truth.

The central contract is:

- Consumers own position, annotations, and optional selection state.
- The component may own transient gesture, measurement, focus, and animation
  state.
- The package does not contain chess rules, legal-move validation, application
  state, or product protocol code.

The initial compatibility target is `react-chessboard@5.10.0`, commit
`b74704a`. Android and iOS are the first-class platforms; React Native Web is
post-1.0 work.

## Repository status

The repository baseline, package shell, test foundation, bare React Native 0.86
harness, packed-artifact build gates, and pinned upstream parity inventory are
in place. The bootstrap prerelease `0.1.0-next.0` initialized npm's mandatory
first-package `latest` tag, and a credential-free recovery run verified its
accepted immutable bytes without publishing again. A fresh dry run and the
subsequent `0.1.0-next.1` release proved trusted publishing, verified provenance
and exact registry bytes, and installed successfully in clean Expo and bare
React Native consumers. `next` now resolves to `0.1.0-next.1`; `latest` remains
`0.1.0-next.0`. The one-time bootstrap token and its GitHub environment secret
have been retired, and no merge publishes automatically. The root package
exports the controlled public contracts plus pure,
validated dimension, coordinate, logical-grid, strict 8x8 FEN, and measured
square-center utilities. Object-position normalization and board-local hit
testing complete the pure P1.1 layer. The public P1.2 component boundary now
normalizes plain and revisioned position, annotation, and optional selection
props into detached current snapshots. It derives plain revisions, enforces
revision ordering and mounted tier stability, applies domain-isolated recovery,
and reports production errors once after commit without retaining renderable
semantic state. Concurrent and Strict Mode tests cover abandoned renders and
report replay. The full `a1` through `z99` coordinate space and both
orientations are covered by property tests. `Chessboard` now measures its
width, derives a rectangular board height from rows and columns, and renders
gap-free square backgrounds, oriented edge notation, and the latest normalized
controlled position. The package includes an original interim geometric set
for the twelve standard chess pieces, also available from the focused `/pieces`
export; a supplied `pieceRenderers` map replaces that set as a whole and
supports any open `pieceType`. Theme, instance, and canonical per-square styles
use one documented precedence chain. Consumers set an explicit width by
constraining the parent. The P1.5 accessibility prototype adds an
orientation-aware virtual cursor, native adjustable/directional navigation,
current controlled square values, correlated announcements, and the centralized
reduced-motion policy without owning semantic selection or moves. P1.6 renders
only the latest controlled annotation collection in pointerless SVG planes:
square fills/circles/dots/borders default below pieces, while marker-free
straight and knight arrows default above pieces. Both orientations, rectangular
boards, per-arrow width/opacity, same-target shortening, and whole-value
`annotationStyle` configuration use deterministic 2048-wide geometry.
P4.1 adds immutable annotation-operation callbacks, independent board-press and
position-change clear policies, and a public pure reducer that applies stale
deltas against the latest consumer envelope without removing concurrent IDs.
P4.3 composes at most one revision- and geometry-correlated transient draft
without adding it to the persistent annotation collection. P4.4 connects that
draft and operation boundary to three touch paths selected by a non-null
`annotationTool`: explicit tap activation, long-press pan, and two-finger pan.
They request one revision-correlated toggle and never edit the controlled
collection; stale semantic, geometry, provider, and gesture correlations fail
closed. Annotation input is exclusive with board-press clearing and ordinary
square activation for the consumed touch. Keyboard and accessibility annotation
actions plus physical native and visual validation remain P4.5 work.
Controlled destination, selected, and disabled square paint now follows
canonical `squareStyles` without changing hit geometry. Custom square renderers
remain later work.
Phase 2 has a pure interaction reducer, board-level RNGH adapter,
mounted move-request executor, an accessible non-drag path, and controlled
square activation.
Supplying `onSquareActivate` opts into same-square touch and accessibility
activation. When `onMoveRequest` is also supplied, an allowed destination with
a current controlled source routes touch exclusively through it; accessibility
uses that move route while its move permission is enabled. Every other
activation emits one immutable `SquareActivationIntent`, including explicit
accessible selection clearing.
Worklet hit testing and per-frame pointer updates stay in shared values; board
identity, recognizer token, geometry epoch, position revision, selection
revision, interaction epoch, and intent ID guard asynchronous boundaries.
Committed callback refs and current-snapshot rechecks make abandoned renders
and stale taps inert. Callback results never change semantic state. Consumers
must publish the next controlled selection or position, using a newer position
revision and matching `committedIntentId` when move correlation is required.
Without `onSquareActivate`, no same-square tap recognizer is enabled;
`onMoveRequest` retains its accessible transient source-target fallback.
Annotation touch input can independently mount that same hidden plane when its
tool, collection, and callback gate is complete. With none of those input
boundaries, the component mounts no native gesture hit plane and remains
read-only. Boards register by a required, mount-stable `boardId` in their nearest
`ChessboardProvider`; standalone boards create a private provider.
Provider identity is token-safe across duplicates, remounts, Strict Mode, and
abandoned renders. Public `SparePiece` sources require an explicit provider and
name exactly one `targetBoardId`. Drag release remeasures that current target;
accessible activation selects one transient provider-scoped spare for placement
from the matching board control. Both paths emit an ordinary `MoveIntent` with
`source: { kind: 'spare', spareId }` against the target board's current
controlled revision. They never edit a position or semantic selection. The
provider projects one pointerless overlay after its children and keeps it
visible through asynchronous release verification. This provider-level host
escapes clipping inside a source palette without introducing semantic state.
P2.7 also adds deterministic parent-ScrollView arbitration, AppState and
geometry cancellation, native interaction stress coverage, and bounded
render/callback evidence. It does not programmatically auto-scroll an ancestor.
The P3.1 pure transition layer snapshots warning-only `BoardTransition` hints
from the current revisioned position, matches stable piece IDs before
conservative anonymous type/geometry inference, degrades candidate ties to
deterministic exits and enters, and produces detached epoch/revision-correlated
plans. P3.2 mounts those detached operations in one board-local Reanimated
clock: current target actors translate or fade in, removed/captured actors fade
out underneath them, reduced motion and zero duration snap, and newer props or
geometry changes cancel stale work. P3.3 consumes explicit capture, promotion,
and second-actor hints: castling actors share one clock, off-target captures
fade the exact reserved victim, and type-changing artwork crossfades along one
path without shadow state. P3.4 keeps every semantic plan on its exact adjacent
revision pair while sampling only active actor points and opacity for smooth
A-B-C interruption, then runs the new segment for the configured full duration.
Geometry and orientation changes rebase each actor's normalized visual point
into the new projection for the original segment's remaining time, reduced
motion snaps without later replay, and an exactly correlated pending target
crossfades into its controlled actor.

The accepted architecture decisions and all 20 reserved invariant contracts
are indexed in
[`docs/architecture/invariants.md`](./docs/architecture/invariants.md).
The pure-core semantics are documented in
[`docs/architecture/coordinates-and-fen.md`](./docs/architecture/coordinates-and-fen.md).
Controlled tier and error semantics are documented in
[`docs/architecture/api-tiers.md`](./docs/architecture/api-tiers.md).
Move-request correlation, permissions, and cancellation are documented in
[`docs/architecture/gestures.md`](./docs/architecture/gestures.md).
Native composition and style precedence are documented in
[`docs/architecture/rendering-layers.md`](./docs/architecture/rendering-layers.md).
Controlled transition planning and presentation are documented in
[`docs/architecture/transitions.md`](./docs/architecture/transitions.md).
The accessibility control and manual TalkBack/VoiceOver pass are documented in
[`docs/accessibility.md`](./docs/accessibility.md).
The checked-in bare harness also runs deterministic Espresso and XCUITest
accessibility and interaction audits against the exact packed package used by
native CI. The Expo gallery includes a controlled-transition lab for special
moves, interruption, geometry/orientation rebase, reduced motion, and correlated
pending commits, plus an interaction-hardening lab with a
standard vertical `ScrollView`, an intentionally clipped spare palette,
geometry and unmount controls, and app-owned render/callback counters.

## Development

The toolchain is pinned to Node.js 24.15.0 and pnpm 11.11.0.

```sh
corepack enable
pnpm install --frozen-lockfile
pnpm verify
```

Root commands:

<!-- markdownlint-disable MD013 -->

| Command                              | Purpose                                       |
| ------------------------------------ | --------------------------------------------- |
| `pnpm build`                         | Build package ESM and declarations            |
| `pnpm test`                          | Run the package Jest suite                    |
| `pnpm api:check`                     | Compare built declarations with the API lock  |
| `pnpm api:update`                    | Update the API lock after review              |
| `pnpm package:check`                 | Inspect one archive with Publint and ATTW     |
| `pnpm parity:verify`                 | Typecheck, test, and validate parity evidence |
| `pnpm parity:check --results <path>` | Validate supplied parity evidence             |
| `pnpm parity:update`                 | Regenerate the rendered parity document       |
| `pnpm parity:complete`               | Run the eventual 1.0 parity-closure gate      |
| `pnpm release:check`                 | Validate prerelease package metadata          |
| `pnpm format`                        | Format supported repository files             |
| `pnpm format:check`                  | Verify formatting without writing             |
| `pnpm lint`                          | Run code and Markdown linting                 |
| `pnpm typecheck`                     | Run strict source and test type checks        |
| `pnpm check`                         | Run static checks and tests                   |
| `pnpm verify`                        | Run the complete pull-request gate locally    |
| `pnpm changeset`                     | Create a package release note                 |
| `pnpm example:start`                 | Start the Expo gallery                        |
| `pnpm example:export`                | Export Android and iOS gallery bundles        |
| `pnpm native:start`                  | Start Metro for the bare native harness       |
| `pnpm native:android`                | Run the native Android harness                |
| `pnpm native:android:accessibility`  | Audit on a connected Android device           |
| `pnpm native:ios`                    | Run the native iOS harness                    |
| `pnpm native:ios:accessibility`      | Audit on an available iPhone simulator        |

<!-- markdownlint-enable MD013 -->

Native release gates are platform-specific:

```sh
pnpm native:android:release
pnpm native:android:accessibility
pnpm native:ios:gems
pnpm native:ios:pods
pnpm native:ios:release
pnpm native:ios:accessibility
```

The iOS commands require macOS with Xcode, Ruby, Bundler, and CocoaPods.
The Android accessibility command requires a running device or emulator. When
native CI is enabled, it cold-boots a pinned, snapshot-disabled API 35
`aosp_atd` emulator and runs the connected Release audit.
`pnpm native:android:accessibility:managed` remains available as a locally
provisioned Gradle-managed alternative. `pnpm verify` remains portable and does
not invoke either native toolchain. The native CI jobs are temporarily disabled;
set the repository Actions variable `RUN_NATIVE_CI=true` to restore the Expo,
Android, and iOS Release jobs and their accessibility audits.

## Packed artifact gate

CI always builds and inspects one npm archive, installs those exact bytes into
fresh Expo and bare React Native consumers outside the checkout, type-checks
both consumers, and exports both Expo production bundles. The smoke runner
rejects workspace dependencies, source-repository resolution, package
symlinks, and missing declared peers. When native CI is enabled, the same
archive additionally gates an Expo Android Release assembly plus bare Android
and iOS Release builds after a clean CocoaPods install.

To prepare either isolated consumer locally:

```sh
smoke_root="$(mktemp -d)"
pnpm build
node scripts/inspect-package.mjs \
  --output "$smoke_root/chessboard-native.tgz"
node scripts/smoke-packed.mjs \
  --consumer expo \
  --archive "$smoke_root/chessboard-native.tgz" \
  --destination "$smoke_root/expo"
```

Use `--consumer native` with a different fresh destination for the bare
harness. The workspace-linked commands remain useful for development, but do
not replace the packed package gate.

`pnpm api:check` expects a fresh `pnpm build`. Use `pnpm api:update` only when
an intentional public declaration change has been reviewed.

## Prerelease process

Merging does not publish. The manual release workflow accepts an expected
version, defaults to a registry-safe dry run, and publishes only the single
inspected archive under npm's `next` dist-tag. The initial publish needs a
short-lived bootstrap credential because trusted publishing can only be
configured after the npm package exists; subsequent publishes use GitHub OIDC.
The bootstrap version and its recovery verification passed. The subsequent
`0.1.0-next.1` proof succeeded through trusted OIDC, and the bootstrap token and
GitHub secret were removed. Every later prerelease receives a new Changesets
version, completes a fresh dry run, and publishes only through trusted OIDC.

See [`docs/releasing.md`](./docs/releasing.md) for the protected-environment,
bootstrap, trusted-publisher, verification, and recovery procedure.

## Upstream parity

The compatibility target is frozen to `react-chessboard@5.10.0`, commit
`b74704af988396d3da32a8c1627d95341e1e0061`. Its byte-identical 16-file,
2,753-line source tree and complete licensing are kept under
[`fixtures/parity/upstream-b74704a`](./fixtures/parity/upstream-b74704a/PROVENANCE.md)
for offline, line-addressable review. The fixture is reference-only and the
package inspection gate rejects any source or Cburnett artwork leaking into the
npm archive.

The [machine-readable ledger](./fixtures/parity/react-chessboard-5.10.json) is
the source of truth; its [rendered view](./docs/parity/react-chessboard-5.10.md)
tracks all 39 root exports, 42 options, and 50 reviewed observable behaviors.
The checker derives exports, defaults, callback/style facets, and nested default
members directly from the vendored TypeScript AST. It also verifies fixture
hashes, unique dispositions and contract IDs, forward-only status transitions,
source references, and generated documentation.

Rows begin as `planned`. Future implementation PRs move them through
`in-progress` to `implemented` and supply normalized, executed contract-result
shards matching
[`results.schema.json`](./fixtures/parity/results.schema.json). The checker
never searches source text for a test ID. CI generates each shard from raw Jest
runner output, binds it to the checked-out commit and evidence hash, and rejects
tracked or hand-edited normalization. Normal CI permits reserved IDs for
unfinished work but requires every implemented row to resolve to exactly one
passing execution when its disposition is `keep` or `adapt`;
`pnpm parity:complete --results <path>` additionally requires every keep/adapt
row to be implemented and all 131 contract IDs to be passing.

See [CONTRIBUTING.md](./CONTRIBUTING.md) before opening a pull request. Report
security issues according to [SECURITY.md](./SECURITY.md).

## License

New project code is available under the [MIT License](./LICENSE). Third-party
material must retain its own license and attribution; see
[NOTICE.md](./NOTICE.md) and [THIRD_PARTY_NOTICES.md](./THIRD_PARTY_NOTICES.md).
