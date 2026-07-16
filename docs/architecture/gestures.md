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
verification session while `measureInWindow` completes. `SparePiece` keeps its
provider overlay visible while that session is pending. Fresh window
coordinates are translated into the target's local measured coordinate system
and use the same
half-open, orientation-aware hit test as an on-board gesture. An out-of-bounds
point resolves to `targetSquare: null`; an invalid or failed measurement
cancels.

A release resolves only while the target still has the same mount token and
geometry epoch, the provider's controlled `geometryRevision` is unchanged, and
the release remains the active provider interaction. Target unmount/remount,
layout, dimensions, orientation, explicit geometry invalidation, or a newer
drag therefore makes late measurement work inert. Position changes alone do
not make geometry stale: the destination board's current position revision is
read through a commit-current adapter only after measurement succeeds. A
successful verification is a one-shot capability: the registry consumes it
atomically before the target board's current callback, permissions,
`canDragPiece`, position revision, and move runtime create an ordinary
`MoveIntent`. It cannot be replayed or redirected to another board. A spare
drag deliberately captures no target revision at gesture start; its
`basePositionRevision` is the target's current committed revision at emission.

The provider has one overlay lease and projects it once after its children as a
transient absolute, pointerless sibling. The host measures its own window
origin and subtracts that origin from the active pointer's window coordinates,
so board and spare sources share one coordinate-correct overlay without
wrapping or reflowing provider children. The provider-level sibling escapes a
clipping palette child. It is not a native window portal, so an ancestor that
clips the entire provider scope can still crop it.

`geometryRevision`, target layout, dimensions, orientation, target unmount, a
second valid gesture, and a second-finger cancel invalidate their implemented
correlation boundaries. Callback and permission changes are rechecked before a
request can emit. Leaving the interactive React Native AppState cancels active
provider dragging, release verification, transient spare selection, and every
registered board interaction. Returning to `active` starts no replacement
gesture and cannot make a queued native terminal signal current again.

Board and spare recognizers use the native pan activation threshold to arbitrate
with an ordinary ancestor `ScrollView`. An empty, non-draggable, or otherwise
denied board source fails before drag activation, leaving scrolling available.
An enabled spare or current allowed board source can activate after the
threshold and owns the rest of that native gesture cycle. Arbitration never
implies automatic scrolling: the package does not discover or programmatically
move arbitrary ancestor scroll views.

Accessible spare placement uses the same provider routing without measurement.
Activating a `SparePiece` publishes one detached transient source selection;
only its named target board exposes place and cancel actions. Placement reads
the target's current accessibility permission, callback, revision, and cursor
square at activation, then submits the ordinary move runtime. Cancellation,
replacement, successful submission, source or target unmount, and provider
deactivation clear the transient selection. It is neither semantic board
selection nor proof that the consumer accepted a move.

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
across all registered boards and external sources. The provider projects that
lease once as a pointerless, accessibility-hidden absolute sibling; a board
source ghost stays board-local. `SparePiece` uses its own one-pointer pan
recognizer, crosses to JS only for activation/release/cancellation, and leaves
the shared presentation active through fresh drop verification. Replacing or
cancelling the active epoch removes the prior overlay without retaining a
position snapshot. Pending decision and commit phases are reducer presentation
only; public pressed/dragging/pending style options remain later work.
Controlled destination, selected, and disabled square styles are already
derived directly from the current selection prop.

P2.7 keeps continuous native pan updates out of JavaScript and adds explicit
evidence at each observable boundary. Component instrumentation counts board
commits, custom renderer calls, semantic callback entries, geometry
invalidation, and provider-overlay host structure. The packed Android and iOS
harnesses exercise long board drags, parent scrolling, lifecycle cancellation,
and post-cancellation reuse. The example gallery supplies the manual clipped
palette and geometry-invalidation lab. Per-frame pointer movement changes shared
values and animated transforms, not React state or consumer callbacks.

## Consequences

Provider coordination enables external sources without sharing game state.
Release-time measurement may briefly delay a drop, but it prevents stale bounds
from resolving an incorrect square. P2.6 adds the public source, one-shot
verified request boundary, current target callback/revision lookup, nullable
off-board drag target, and transient accessible place/cancel flow. P2.7 closes
the immediate native hardening slice with parent-ScrollView arbitration,
AppState and geometry cancellation, a provider-level clipping boundary, and
render/callback instrumentation. Provider and multi-board contracts cover
registration ownership, shared-overlay exclusivity, release verification, and
stale callbacks without sharing semantic board state. Controlled square or
spare activation adds no second semantic store: component, model, and native
tests keep exclusive routing, current-snapshot payloads, stale selection
rejection, and post-cancellation reuse deterministic.

This decision owns invariants `CBN-INV-003`, `CBN-INV-004`, `CBN-INV-007`,
`CBN-INV-008`, `CBN-INV-009`, `CBN-INV-012`, `CBN-INV-014`,
`CBN-INV-015`, and `CBN-INV-018`.
