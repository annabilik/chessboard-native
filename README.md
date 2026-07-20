# chessboard-native

<!-- markdownlint-disable MD013 -->

A controlled, rules-free React Native chessboard for Android and iOS.

`@vibechess/chessboard-native` targets the useful surface of pinned
`react-chessboard@5.10.0` with native gestures, rendering, accessibility, and
explicit browser-only exclusions. Consumers own position, annotations, and
optional selection; the component never creates a second semantic source of
truth.

> [!WARNING]
> The package is in prerelease. This source tree is prepared as
> `0.1.0-next.2` and includes the `react-chessboard-compat` entry point. Merging
> a version commit does not publish it, so npm's moving `next` tag can still
> resolve an older prerelease. Verify the installed version and exports, then
> pin an exact `0.1.0-next.N` version after evaluation.

## Highlights

- Responsive standard and rectangular boards with either orientation.
- Strict 8×8 FEN or sparse object positions with an open piece vocabulary.
- Controlled moves, selection, square/arrow annotations, and transitions.
- Native drag, tap, spare-piece, annotation, and adjustable-control input.
- Declarative themes, styles, custom pieces, and visual-only square renderers.
- Multiple-board coordination without provider-owned chess state.
- A `react-chessboard-compat` entry point for incremental migration.
- ESM package exports verified in clean Expo and bare React Native consumers.

The library does not contain chess rules, legal-move validation, application
state, clocks, engines, networking, or product protocol code.

## Install

Install the prerelease and its required peers on the supported lines:

```sh
npm install \
  @vibechess/chessboard-native@next \
  react@19.2.x \
  react-native@0.86.x \
  react-native-gesture-handler@2.32.x \
  react-native-reanimated@4.5.x \
  react-native-svg@15.15.x \
  react-native-worklets@0.10.x
```

Mount the app beneath `GestureHandlerRootView`, configure Reanimated/Worklets
for the host app, and give the board a constrained parent width. See the
[package guide](packages/chessboard-native/README.md) for Expo and bare React
Native setup.

## Quick start

```tsx
import { Chessboard } from '@vibechess/chessboard-native';

export function AnalysisBoard() {
  return (
    <Chessboard
      boardId="analysis"
      position="rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR"
    />
  );
}
```

For an interactive store, use a revisioned position. Recheck the request's base
revision inside a functional update before publishing the next position:

```tsx
import { useState } from 'react';
import {
  Chessboard,
  type ControlledPosition,
  type OnMoveRequest,
} from '@vibechess/chessboard-native';

const initialPosition: ControlledPosition = {
  revision: 0,
  value: { e2: { id: 'white-pawn', pieceType: 'wP' } },
};

export function InteractiveBoard() {
  const [position, setPosition] = useState<ControlledPosition>(initialPosition);

  const onMoveRequest: OnMoveRequest = async (intent, { signal }) => {
    const accepted = await validateMove(intent, signal);
    if (!accepted || signal.aborted) {
      return { status: 'rejected', reason: 'illegal or stale' };
    }

    setPosition((current) =>
      current.revision === intent.basePositionRevision
        ? {
            committedIntentId: intent.intentId,
            revision: current.revision + 1,
            value: applyMove(current.value, intent),
          }
        : current,
    );
    return { status: 'accepted' };
  };

  return (
    <Chessboard
      boardId="analysis"
      onMoveRequest={onMoveRequest}
      position={position}
    />
  );
}
```

Returning `accepted` permits pending presentation only. The board does not
apply the move; the consumer's next `position` prop is the commit.

## Choose an API surface

| Surface                   | Choose it when                                                                                                                                                                             |
| ------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Primary root API          | You want revision correlation, asynchronous decisions, stable annotation IDs, square annotations, selection, accessibility customization, transitions, providers, or targeted spare pieces |
| `react-chessboard-compat` | You are migrating a `react-chessboard@5.10.0` options object and accept native values and controlled semantics                                                                             |
| `pieces`                  | You only need the bundled geometric `defaultPieceRenderers` value; renderer types remain on the root API                                                                                   |

> [!IMPORTANT]
> The prepared `0.1.0-next.2` package exports this compatibility entry point;
> npm `0.1.0-next.1` does not. After installing `@next`, confirm the resolved
> package is `0.1.0-next.2` or a later version that retains the export before
> using the import below.

```tsx
import { Chessboard } from '@vibechess/chessboard-native/react-chessboard-compat';

<Chessboard options={{ id: 'analysis', position, arrows }} />;
```

The compatibility adapter keeps familiar names, not browser primitives or
upstream shadow state. Read the migration guide before treating it as a
replacement.

## Documentation

- [Documentation index](docs/README.md)
- [API reference](docs/api-reference.md)
- [Migration from `react-chessboard`](docs/migrating-from-react-chessboard.md)
- [Comparison with `react-chessboard@5.10.0`](docs/comparison.md)
- [Support and validation matrix](docs/support-matrix.md)
- [Pinned parity ledger](docs/parity/react-chessboard-5.10.md)
- [Accessibility contract](docs/accessibility.md)
- [Architecture decisions](docs/architecture/invariants.md)
- [Prerelease runbook](docs/releasing.md)

## Support boundary

The current supported host boundary is Expo SDK 57 or bare React Native 0.86
with React 19.2 and the New Architecture. Android and iOS are the target
platforms. CommonJS, the legacy architecture, and React Native Web are not
supported contracts.

Automated tests and packed-consumer builds are not the same as physical-device
certification. Consult the [support matrix](docs/support-matrix.md) for exact
evidence and the remaining TalkBack, VoiceOver, performance, visual, and device
coverage gates.

## Gallery

The Expo gallery contains categorized labs for controlled state, moves,
selection, providers, spares, annotations, transitions, customization,
accessibility, compatibility, and interaction hardening.

```sh
corepack enable
pnpm install --frozen-lockfile
pnpm example:start
```

Gallery source lives in [`apps/example`](apps/example/app/index.tsx). The bare
React Native harness in [`apps/native-harness`](apps/native-harness/README.md)
supplies package-resolution, native-build, and deterministic interaction/
accessibility fixtures.

## Development

The repository pins Node.js 24.15.0 and pnpm 11.11.0.

```sh
corepack enable
pnpm install --frozen-lockfile
pnpm verify
```

Important commands:

| Command               | Purpose                                                                                    |
| --------------------- | ------------------------------------------------------------------------------------------ |
| `pnpm check`          | Formatting, lint, docs, types, Jest, tooling, and parity evidence                          |
| `pnpm verify`         | Complete pull-request gate, including build, API, package, release, and Expo export checks |
| `pnpm api:check`      | Compare declarations with all three checked-in API reports                                 |
| `pnpm package:check`  | Inspect one packed archive with Publint and Are The Types Wrong                            |
| `pnpm parity:verify`  | Rebuild executable parity evidence and validate the ledger                                 |
| `pnpm example:export` | Export Android and iOS Expo gallery bundles                                                |

See [CONTRIBUTING.md](CONTRIBUTING.md) for local workflow and pull-request
requirements. Security reports follow [SECURITY.md](SECURITY.md).

## Parity and release status

The compatibility target is frozen to `react-chessboard@5.10.0`, commit
`b74704af988396d3da32a8c1627d95341e1e0061`. Its reviewed source fixture and
licensing are kept under
[`fixtures/parity/upstream-b74704a`](fixtures/parity/upstream-b74704a/PROVENANCE.md)
for offline evidence; they are never included in the npm archive.

The machine-readable ledger covers all 39 root exports, 42 options, and 50
reviewed behaviors. Required parity validation runs the complete gate: all 131
rows must be marked implemented, with exactly one passing executable contract
for every contract ID. That total includes ten negative contracts that lock
intentional browser-only exclusions. This closes the pinned native parity
target; it does not claim a drop-in browser replacement, React Native Web
support, or production readiness.

Merging does not publish. A manual protected workflow builds and inspects one
archive, performs a registry-safe dry run by default, and publishes through npm
trusted OIDC only when explicitly requested.

## License

Project code is available under the [MIT License](LICENSE). Third-party
material retains its own attribution in [NOTICE.md](NOTICE.md) and
[THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).
