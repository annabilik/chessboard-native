# ADR: Gesture and provider coordination

Status: accepted

Date: 2026-07-12

## Context

Native piece movement must work within a board, from an external spare palette,
across multiple boards, and inside scrolling layouts without allowing gesture
state to become game state.

## Decision

Boards use board-level coordinate hit testing rather than one gesture handler
per visual square. Pan-frame updates stay on the UI thread in Reanimated shared
values and transforms. Gesture code emits reducer events; a separate effect
executor invokes callbacks, timers, aborts, and announcements only after
checking the active epoch.

`ChessboardProvider` owns one transient gesture coordinator, tokenized board
layout registry, shared drag overlay, and at most one active drag. It owns no
position, annotations, or semantic board selection. A standalone `Chessboard`
creates a private provider only when no provider exists; a board under an
explicit provider reuses the nearest provider.

Every board ID is required, non-empty, unique within its nearest provider, and
stable for the mount lifetime. Duplicate or changed IDs take the typed board
error path and never create a conflicting registration. Registration and
cleanup also carry an opaque mount token, so a rejected duplicate or late
cleanup cannot update or unregister the accepted board. Nested providers form
independent identity scopes. All shared state is routed by board ID and mount
token.

The registry retains measured geometry, cached window bounds, native
measurement capability, and commit-safe accessors required to route transient
work. It never retains a position, annotation collection, semantic selection,
or a renderable fallback snapshot. Abandoned renders never register. Strict
Mode effect replay unregisters and re-registers token-safely without leaving a
stale reservation because boards publish and remove entries only at committed
lifecycle boundaries. Registration reserves identity separately from drop
availability: a board becomes a target only after publishing a current positive
projected layout, and becomes unavailable again whenever that layout is absent.
Suspense and Offscreen effect deactivations clear transient registry work
without permanently poisoning the preserved provider runtime.

An external spare names exactly one target board. Cached window bounds are
hover hints only. On release the provider always requests a fresh measurement:
it resolves synchronously where supported or enters an epoch-correlated
verification session while `measureInWindow` completes. A future external
source can keep its provider overlay visible while that session is pending.
Fresh window coordinates are translated into the target's local measured
coordinate system and use the same
half-open, orientation-aware hit test as an on-board gesture. An out-of-bounds
point resolves to `targetSquare: null`; an invalid or failed measurement
cancels.

A release resolves only while the target still has the same mount token and
geometry epoch, the provider's controlled `geometryRevision` is unchanged, and
the release remains the active provider interaction. Target unmount/remount,
layout, dimensions, orientation, explicit geometry invalidation, or a newer
drag therefore makes late measurement work inert. Position changes alone do
not make geometry stale: the destination board's current position revision is
read through a commit-current adapter only after measurement succeeds. P2.5
installs this private resolution boundary; `SparePiece` consumes it in P2.6 and
performs the final current-handler lookup.

Once a drag activates it is exclusive with registered ancestor ScrollViews.
The package does not programmatically auto-scroll an arbitrary ancestor.
Layout changes, geometry invalidation, orientation or dimension changes,
permission changes, unmount, a second valid gesture, a second-finger cancel,
and the accessibility cancel action invalidate the active epoch and all timers
and signals. Late work is inert.

Long-press pan, two-finger pan, and explicit two-activation annotation input all
produce the same revisioned annotation operations. Every drag path also has a
tap, keyboard, or accessibility alternative using the same semantic intent.

## Move-request lifecycle, gesture adapter, and executor

The internal interaction reducer models `idle`, tap or drag targeting,
`deciding`, and `awaiting-commit` phases. Direct keyboard and accessibility
intents use the same decision path. Each reducer instance is scoped to one
stable board ID. Its detached immutable state contains correlation metadata and
transient presentation data only; it never contains a position snapshot,
annotation collection, selection, callback, timer, or abort controller.

Submitting a target schedules an epoch-correlated callback and decision
timeout. Acceptance only advances to `awaiting-commit`; it does not commit a
move. A newer controlled position revision records a commit only when its
`committedIntentId` matches the active intent. A newer revision with no or a
mismatched ID is an unrelated authoritative update: it invalidates the intent
without reporting a commit. The plain controlled tier therefore cannot express
commit correlation or acceptance announcements. The same or a lower revision
is never treated as a commit. A matching newer commit that arrives before the
decision resolves still wins, clears the request, and makes the late decision
inert.

Every asynchronous result carries the interaction epoch and intent ID. Effects
also carry the reducer revision that produced them. The mounted runtime rejects
queued stale work and keys timer and abort resources by the effect's board ID,
epoch, intent ID, and timeout stage, so stale cleanup can release only its own
resources. It invokes `onMoveRequest` once with an abort signal, maps thrown or
rejected work through the correlated decision path, and independently enforces
the decision and controlled-commit budgets. Position, dimensions, orientation,
geometry, permissions, request replacement, explicit cancellation, and unmount
invalidate active work. Epoch and intent allocation fail closed rather than
emit unsafe correlation IDs.

P2.2 adds one private board-level RNGH plane and a render-agnostic adapter over
that reducer. The plane composes exclusive tap and pan recognizers. Measured
visual square order is captured as primitive geometry, so orientation-correct
point-to-square hit testing can run in a worklet without parsing coordinates or
reading React state. Pan-frame pointer and target updates write only Reanimated
shared values. Only activation, release, cancellation, and a recognized
same-square tap cross the JS boundary.

The adapter correlates every boundary with board ID, the native recognizer's
handler token, position revision, and geometry epoch. A tap also captures the
selection revision at gesture start. It reads controlled position and selection
only at a boundary, then retains correlation and transient targeting only. A
terminal drag first returns an inert candidate with no intent ID and invalidates
gesture targeting. The mounted runtime rechecks current board, geometry,
position, selection, callbacks, and permissions before assigning an intent ID
or emitting. Geometry, position, or selection changes make a stale candidate
fail closed, while a late foreign handler token cannot cancel newer work. No
gesture, callback, or executor effect can mutate position or selection.

Supplying `onSquareActivate` opts into controlled same-square touch and
accessibility activation, including empty squares. One exclusive router handles
ordinary activation. When `onMoveRequest` also exists, a selected enabled source
still contains a current controlled piece, and the enabled target is a declared
destination, touch emits only a `MoveIntent`. Accessibility does the same while
`interactionPermissions.accessibility` permits move input; with that gate off,
it emits the square activation instead. Every other enabled activation emits
only an immutable `SquareActivationIntent`. The accessibility surface also
emits an explicit `clear-selection` activation; only a new consumer selection
prop can clear the rendered selection.

Callback references become active only after their render commits. The tap's
captured selection revision and the current normalized position and selection
are rechecked immediately before routing, so callbacks from abandoned renders
and stale taps are inert.

Without `onSquareActivate`, the tap recognizer and controlled activation action
are disabled. Supplying `onMoveRequest` alone retains the existing accessible
transient source, target, removal, and cancellation flow. Those actions use the
same request executor as drag and never write consumer selection.

Board-piece drag also defaults on when the callback exists. The synchronous
`canDragPiece` gate is evaluated against the current controlled piece and
revision before activation; exceptions and non-true results deny the drag.
`interactionPermissions.drag: false` leaves the accessible path available.
Setting `interactionPermissions.accessibility: false` disables both paths, so a
consumer cannot configure a drag-only board. It does not disable controlled
square activation or touch destination routing. `onMoveRequest` enables the pan
path, while `onSquareActivate` enables the tap path. With neither callback, the
component renders no native hit plane and constructs no recognizer.

Each native gesture cycle receives a board-local monotonic token rather than
reusing RNGH's recognizer handler tag. Start and terminal signals therefore
correlate within one cycle, and delayed terminal work cannot settle a newer
cycle. Tap also fails explicitly when a second pointer appears.

The board drag plane remains an accessibility-hidden descendant of the stable
board control. Its active drag publishes shared pointer values and visual
source data to the nearest provider, which grants exactly one overlay lease
across all registered boards. The owning board host renders that lease as a
pointerless, accessibility-hidden overlay; the source ghost also stays
board-local. Replacing or cancelling the active epoch removes the prior overlay
without retaining a position snapshot. Pending decision and commit phases are
reducer presentation only; public pressed/dragging/pending style options,
ScrollView arbitration, and native frame-performance evidence remain later
integration work. Controlled destination, selected, and disabled square styles
are already derived directly from the current selection prop.

## Consequences

Provider coordination enables external sources without sharing game state.
Release-time measurement may briefly delay a drop, but it prevents stale bounds
from resolving an incorrect square. Provider and multi-board contracts cover
registration ownership, shared-overlay exclusivity, release verification, and
stale native callbacks before the public external source is added. Native
ScrollView arbitration, full lifecycle automation, and frame-performance
evidence remain mandatory later layers. Controlled square activation adds no
second semantic store: its component and model tests must keep exclusive
destination routing, accessible clearing, current-snapshot payloads, and stale
selection rejection deterministic.

This decision owns invariants `CBN-INV-003`, `CBN-INV-004`, `CBN-INV-007`,
`CBN-INV-008`, `CBN-INV-009`, `CBN-INV-012`, `CBN-INV-014`,
`CBN-INV-015`, and `CBN-INV-018`.
