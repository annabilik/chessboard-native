# Migrating from `react-chessboard`

This guide targets exactly `react-chessboard@5.10.0`, tag `v5.10.0`,
commit `b74704af988396d3da32a8c1627d95341e1e0061`. It does not promise
compatibility with another upstream version. The
[exhaustive parity ledger](./parity/react-chessboard-5.10.md) records the
source-backed disposition of every pinned export, option, and reviewed
behavior.

`chessboard-native` is a native adaptation, not a drop-in replacement. It uses
React Native views, Gesture Handler, Reanimated, and React Native SVG rather
than the DOM, CSS, and dnd-kit. Position, annotations, and optional selection
remain controlled by the application.

> [!IMPORTANT]
> This guide describes the source prepared as `0.1.0-next.2`, which includes
> the `react-chessboard-compat` entry point. npm `0.1.0-next.1` predates that
> export, and merging the prepared version does not publish it. Check the exact
> installed version, release notes, and package exports before importing the
> compatibility subpath from npm.

## Choose a migration path

Use the compatibility entry point for an incremental migration when the
application:

- already passes one `options` object;
- uses plain position and arrow values;
- can replace CSS values and browser callbacks with native equivalents; and
- can keep move validation synchronous.

Use the primary entry point when the application needs any of the following:

- revisioned position, annotation, or selection state;
- asynchronous or cancellable move decisions;
- exact move-to-commit correlation with `committedIntentId`;
- stable annotation IDs, square annotations, or revision-safe operations;
- controlled selection or accessibility customization;
- multiple coordinated boards or targeted spare pieces; or
- explicit transition hints and transient cancellation.

Both paths reduce to the same controlled native board. The compatibility
adapter does not retain a shadow position or arrow collection.

## Install the native peers

The current support contract is Expo SDK 57 or bare React Native 0.86 with
React Native's New Architecture. Install the package with every required peer:

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

Mount the application below `GestureHandlerRootView`. Bare React Native
applications must also configure the Worklets Babel plugin last and install
iOS pods. See the
[package setup instructions](../packages/chessboard-native/README.md#required-app-setup)
and the [support matrix](./support-matrix.md) before migrating component code.

## Path A: keep the options object temporarily

The browser import:

```tsx
import { Chessboard } from 'react-chessboard';

<Chessboard
  options={{
    id: 'analysis',
    position,
    arrows,
    boardOrientation: 'white',
    onPieceDrop: handlePieceDrop,
    onArrowsChange: handleArrowsChange,
  }}
/>;
```

becomes the native compatibility import:

```tsx
import {
  Chessboard,
  type ReactChessboardArrow,
} from '@vibechess/chessboard-native/react-chessboard-compat';

<Chessboard
  options={{
    id: 'analysis',
    position,
    arrows,
    boardOrientation: 'white',
    onPieceDrop: ({ piece, sourceSquare, targetSquare }) => {
      if (piece.isSparePiece || targetSquare === null) {
        return false;
      }

      setPosition((current) => {
        const next = { ...current };
        delete next[sourceSquare];
        next[targetSquare] = { pieceType: piece.pieceType };
        return next;
      });
      return true;
    },
    onArrowsChange: ({ arrows: nextArrows }) => {
      setArrows(nextArrows);
    },
  }}
/>;
```

The familiar names are an adapter boundary, not browser emulation:

- style options accept React Native `StyleProp` values, not CSS;
- piece and square renderers use the native visual-only contracts;
- square press callbacks receive native data, not `React.MouseEvent`;
- pointer hover, right-click, ancestor auto-scroll, and DOM helpers do not
  exist; and
- the board remains rules-free.

### Position is still controlled

`options.position` is the only persistent position. Returning `true` from
`onPieceDrop` accepts the request presentation, but it does not move a piece.
The application must calculate and publish the next `options.position`.
Returning `false`, throwing, or returning a non-`true` value rejects the
request.

The compatibility callback is synchronous. Use the primary `onMoveRequest`
API for a promise, an `AbortSignal`, decision and commit timeouts, or exact
commit correlation.

Without `onPieceDrop`, move input is read-only. Supplying `allowDragging:
false` with a drop callback disables drag but preserves the accessible
non-drag move path.

### Arrows are still controlled

`options.arrows` is the only persistent arrow collection. `onArrowsChange`
receives one detached candidate for the complete next array. Drawing or clearing
becomes visible only after the application publishes that array back through
`options.arrows`.

The adapter does not:

- mutate the supplied array;
- keep a second persistent arrow list;
- fire `onArrowsChange` merely because the board mounted; or
- enable drawing and clear policies when `onArrowsChange` is absent.

Use the primary annotation API for stable IDs, square annotations, explicit
tools, independent clear policies, revisioned deltas, and stale-safe reduction.

### Defaults that matter

- An 8 by 8 compatibility board defaults to the standard starting position.
- A nonstandard board defaults to an empty position unless `position` is
  supplied.
- `animationDurationInMs` defaults to 300.
- `showAnimations: false` maps to always-reduced motion. `true` or omission
  follows the operating-system preference; it does not force animation.
- `dragActivationDistance` defaults to one native point in the compatibility
  adapter. The primary API's `gesture.activationDistance` defaults to four.
- `allowDragOffBoard` defaults to `true` and changes overlay presentation, not
  whether an off-board release reports a null target.

## Path B: adopt the primary controlled API

The primary component accepts direct props. For an interactive store, use a
revisioned `ControlledPosition` and publish a newer revision after accepting a
move:

```tsx
import {
  Chessboard,
  type ControlledPosition,
  type OnMoveRequest,
} from '@vibechess/chessboard-native';
import { useState } from 'react';

export function PrimaryControlledBoard() {
  const [position, setPosition] = useState<ControlledPosition>({
    revision: 0,
    value: { e2: { id: 'white-pawn', pieceType: 'wP' } },
  });

  const onMoveRequest: OnMoveRequest = async (intent, { signal }) => {
    const accepted = await validateMoveInApplicationState(intent, signal);
    if (!accepted || signal.aborted) {
      return { status: 'rejected' };
    }

    setPosition((current) => {
      if (current.revision !== intent.basePositionRevision) {
        return current;
      }
      return {
        committedIntentId: intent.intentId,
        revision: current.revision + 1,
        value: applyMoveInApplicationState(current.value, intent),
      };
    });
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

Acceptance controls only transient pending or snapback presentation. It never
commits position. A newer plain position remains authoritative, but only a
newer revisioned position carrying the matching `committedIntentId` confirms
the local request.

Read [Plain and revisioned API tiers](./architecture/api-tiers.md) before
moving a live store to revisioned values. A mounted semantic domain cannot
switch between plain and revisioned tiers.

## Option and concept crosswalk

This is a migration-oriented summary. The
[ledger](./parity/react-chessboard-5.10.md) remains authoritative for all 131
individual rows.

<!-- markdownlint-disable MD013 -->

| Upstream 5.10 concept                           | Compatibility entry point                             | Primary entry point                                    | Migration note                                                                                            |
| ----------------------------------------------- | ----------------------------------------------------- | ------------------------------------------------------ | --------------------------------------------------------------------------------------------------------- |
| `options`                                       | `options`                                             | direct `Chessboard` props                              | Prefer the primary surface after the incremental migration.                                               |
| `id`                                            | `id`                                                  | required `boardId`                                     | Keep the ID stable for the mounted lifetime and unique in its provider.                                   |
| `position`                                      | `position`                                            | `position`                                             | Both are controlled. The primary value may be plain or revisioned.                                        |
| `boardOrientation`                              | `boardOrientation`                                    | `orientation`                                          | Orientation changes projection, never canonical square IDs.                                               |
| `chessboardRows` and `chessboardColumns`        | same names                                            | `dimensions`                                           | FEN is 8 by 8 only; variants use sparse object positions.                                                 |
| `pieces`                                        | `pieces` with native renderer types                   | `pieceRenderers`                                       | The map is a whole replacement; spread the defaults for partial customization.                            |
| board, square, notation, drag, and ghost styles | same option names with native styles                  | `theme`, `styles`, and `squareStyles`                  | CSS layout and DOM properties are not portable; constrain board size with its parent.                     |
| `squareRenderer`                                | native visual-only `squareRenderer`                   | `renderSquare`                                         | Renderers receive no event or accessibility handlers.                                                     |
| `showNotation`                                  | `showNotation`                                        | `showNotation`                                         | Notation follows visual bottom and left edges in either orientation.                                      |
| `animationDurationInMs`                         | `animationDurationInMs`                               | `transitionDurationMs`                                 | The primary API also exposes `reduceMotion`.                                                              |
| `showAnimations`                                | `showAnimations`                                      | `reduceMotion`                                         | The native policy is `system`, `always`, or `never`.                                                      |
| `allowDragging`                                 | `allowDragging`                                       | `onMoveRequest` plus `interactionPermissions`          | No move callback means read-only. Accessible input cannot be left behind a drag-only path.                |
| `allowDragOffBoard`                             | `allowDragOffBoard`                                   | `gesture.allowDragOffBoard`                            | This clamps only the active visual overlay when false.                                                    |
| `dragActivationDistance`                        | `dragActivationDistance`                              | `gesture.activationDistance`                           | Values are native points. Compatibility and primary defaults differ.                                      |
| `canDragPiece`                                  | `canDragPiece` with native payload                    | `canDragPiece`                                         | It is a synchronous current-snapshot drag gate, not a move decision.                                      |
| `onPieceDrop`                                   | synchronous Boolean `onPieceDrop`                     | cancellable `onMoveRequest`                            | Neither callback commits position; the primary callback may be asynchronous.                              |
| `onPieceClick`                                  | native-payload `onPieceClick`                         | `onPiecePress`                                         | It is observational and does not enable or approve moves.                                                 |
| `onPieceDrag`                                   | native-payload `onPieceDrag`                          | `onPieceDragStart`                                     | Native emits once after activation, never once per pointer frame.                                         |
| `onSquareClick`                                 | native-payload `onSquareClick`                        | `onSquareActivate`                                     | The callback requests a controlled change; its return value is ignored.                                   |
| `onSquareMouseDown` and `onSquareMouseUp`       | native press-in and press-out callbacks               | `onSquarePressIn` and `onSquarePressOut`               | No DOM or native event object is exposed.                                                                 |
| `arrows`                                        | controlled upstream-shaped arrow array                | `annotations`                                          | Primary annotations have stable IDs and may be arrows or square marks.                                    |
| `arrowOptions`                                  | native `AnnotationStyle`                              | `annotationStyle`                                      | The object is a whole-value replacement.                                                                  |
| `allowDrawingArrows`                            | gates native arrow input when `onArrowsChange` exists | `annotationTool` plus `onAnnotationOperation`          | Primary input emits operations; it never stores a collection.                                             |
| `clearArrowsOnClick`                            | proposed next array through `onArrowsChange`          | `annotationPolicies.clearOnBoardPress`                 | Only the application can publish the clear.                                                               |
| `clearArrowsOnPositionChange`                   | proposed next array through `onArrowsChange`          | `annotationPolicies.clearOnPositionChange`             | The native policy is independent of board-press clearing.                                                 |
| `onArrowsChange`                                | complete candidate array                              | `onAnnotationOperation` and `applyAnnotationOperation` | The primary delta carries a base revision for stale-safe application.                                     |
| provider and spare-piece composition            | no expanded compatibility contract                    | `ChessboardProvider` and `SparePiece`                  | Each spare explicitly targets one named board; the provider owns no semantic state.                       |
| selection                                       | unavailable                                           | `selection` and `onSquareActivate`                     | Selection is optional consumer-owned presentation.                                                        |
| accessibility customization                     | unavailable                                           | `accessibility` and `interactionPermissions`           | The board is one adjustable control; physical assistive-technology checks are still pending release work. |

<!-- markdownlint-enable MD013 -->

## Complete browser-only exclusions

These are all ten `drop` rows in the pinned ledger. Their status is
`implemented`: executable negative contracts lock each exclusion or portable
replacement boundary. Implemented here means the reviewed drop decision is
enforced; it does not mean the browser feature exists on Android or iOS.

<!-- markdownlint-disable MD013 -->

| Ledger row                                                                                                                           | Upstream surface or behavior                                    | Native 1.0 treatment                                                                                                                  |
| ------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| [`export.use-chessboard-context`](./parity/react-chessboard-5.10.md#export-use-chessboard-context)                                   | `useChessboardContext` exposes a browser-internal context       | Not exported. Keep application state in the application and use public props and callbacks.                                           |
| [`export.is-touch-end-within-square`](./parity/react-chessboard-5.10.md#export-is-touch-end-within-square)                           | `isTouchEndWithinSquare` uses DOM lookup and `React.TouchEvent` | Not exported. Native hit testing stays inside the measured board input surface.                                                       |
| [`option.allow-auto-scroll`](./parity/react-chessboard-5.10.md#option-allow-auto-scroll)                                             | `allowAutoScroll`                                               | Typed as `never` and rejected when supplied. Native gestures arbitrate with an ancestor `ScrollView` but never discover or scroll it. |
| [`option.on-mouse-out-square`](./parity/react-chessboard-5.10.md#option-on-mouse-out-square)                                         | `onMouseOutSquare`                                              | Typed as `never` and rejected when supplied. There is no portable touch hover lifecycle.                                              |
| [`option.on-mouse-over-square`](./parity/react-chessboard-5.10.md#option-on-mouse-over-square)                                       | `onMouseOverSquare`                                             | Typed as `never` and rejected when supplied. Renderer state may show native press or drag-over presentation without hover callbacks.  |
| [`option.on-square-right-click`](./parity/react-chessboard-5.10.md#option-on-square-right-click)                                     | `onSquareRightClick`                                            | Typed as `never` and rejected when supplied. Use explicit annotation mode, long press, two-finger input, or accessibility actions.    |
| [`behavior.b19-automatic-scroll-during-drag`](./parity/react-chessboard-5.10.md#behavior-b19-automatic-scroll-during-drag)           | automatic ancestor scrolling during drag                        | Not implemented. If the application moves an ancestor programmatically, update provider `geometryRevision`.                           |
| [`behavior.b29-hover-in-and-out-transitions`](./parity/react-chessboard-5.10.md#behavior-b29-hover-in-and-out-transitions)           | browser hover enter and leave ordering                          | Not implemented on Android or iOS. React Native Web compatibility is post-1.0 work.                                                   |
| [`behavior.b31-context-menu-right-click-ordering`](./parity/react-chessboard-5.10.md#behavior-b31-context-menu-right-click-ordering) | context-menu prevention, bubbling, and right-click ordering     | Not implemented. Native annotation input has its own exclusive gesture routing.                                                       |
| [`behavior.b36-modifier-color-precedence`](./parity/react-chessboard-5.10.md#behavior-b36-modifier-color-precedence)                 | Shift/Control combinations choose arrow colors                  | Not implemented. The application supplies an explicit portable `annotationTool.color`.                                                |

<!-- markdownlint-enable MD013 -->

## Move application rules out of the board

Neither migration path supplies a chess engine. The application remains
responsible for:

- legal move validation and turn state;
- promotion choice and resulting piece type;
- premove queues;
- check, mate, draw, and game result state; and
- constructing the next controlled position.

Promotion and premove UI should live in application state. A revisioned primary
store can use `transition.promotion`, `transition.rookMove`, or
`transition.capturedSquare` as exact presentation hints, but those hints never
authorize a move or change the position.

## Validate the migrated screen

Before removing the web component:

1. Confirm the screen is wrapped by `GestureHandlerRootView`.
2. Verify every required peer matches the supported line.
3. Test both orientations and every configured board dimension.
4. Confirm a callback alone never changes position, arrows, annotations, or
   selection.
5. Test accepted, rejected, timed-out, cancelled, and stale move requests.
6. Test the board inside the application's actual `ScrollView` and clipping
   hierarchy.
7. Replace CSS assumptions, DOM event fields, hover, and right-click flows.
8. Run with reduced motion enabled.
9. Follow the [manual TalkBack and VoiceOver checklist](./accessibility.md).
10. Pin the exact prerelease evaluated by the application; do not rely on a
    moving `next` tag.

The physical assistive-technology pass, broad compatibility matrix, performance
budgets, publication, and release-candidate burn-in remain separate release
work.
