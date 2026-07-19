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

Board and spare recognizers use `ChessboardProps.gesture.activationDistance` to
arbitrate with an ordinary ancestor `ScrollView`. The value is measured in
native points, defaults to four, and must be finite and non-negative. The named
board publishes the same current value to spares targeting it. On the shared
board plane it also supplies same-square tap travel tolerance and two-finger
annotation-pan activation distance. Changing it replaces current recognizer
configuration and makes an obsolete native terminal signal inert.

An empty, non-draggable, or otherwise denied board source fails before drag
activation, leaving scrolling available. An enabled spare or current allowed
board source can activate after the threshold and owns the rest of that native
gesture cycle. Arbitration never implies automatic scrolling: the package does
not discover or programmatically move arbitrary ancestor scroll views.

Accessible spare placement uses the same provider routing without measurement.
Activating a `SparePiece` publishes one detached transient source selection;
only its named target board exposes place and cancel actions. Placement reads
the target's current accessibility permission, callback, revision, and cursor
square at activation, then submits the ordinary move runtime. Cancellation,
replacement, successful submission, source or target unmount, and provider
deactivation clear the transient selection. It is neither semantic board
selection nor proof that the consumer accepted a move.

Explicit activation, long-press pan, two-finger pan, and the adjustable board's
annotation actions are input adapters over one annotation reducer and operation
emitter. P4.1 establishes that commit-current emitter and the independent
board-press/position-change policy paths. P4.4 connects the touch paths, and
P4.5 connects accessibility without creating another operation or annotation
store. Keyboard annotation input remains future work.

`annotationTool` is the controlled annotation mode. Input is enabled only for a
ready measured board with a current annotation domain, a non-null valid tool,
and a committed `onAnnotationOperation` callback. The explicit arrow path uses
one tap to arm a visible transient border at the source and a second tap on a
different square to finish. Tapping the source again cancels. The explicit
square path finishes on one tap. Long-press and two-finger pans draw an arrow
from source to terminal target; a square tool applies to the terminal square.
An arrow ending on its source or outside the board emits nothing.

All three touch paths emit the same immutable `toggle` request with
`input: "touch"`. The request carries the exact current annotation revision and
only matching IDs observed at that revision; its generated annotation ID is
used only if the consumer applies an add. The callback result is ignored.
Persistent rendering changes only after a later controlled `annotations` prop
arrives.

Annotation recognizers compose on the existing accessibility-hidden board
plane as
`Gesture.Race(longPressPan, twoFingerPan, Gesture.Exclusive(movePan, tap))`.
The long-press pan requires exactly one pointer and activates after 500
milliseconds; quick movement still lets the ordinary piece pan or ancestor
scroll win. The two-finger pan requires exactly two pointers, uses the same
four-point movement threshold as the other board pans, and averages touches on
Android so both platforms hit-test the pointer centroid consistently. A second
pointer fails the one-pointer move and tap candidates before that path can own
the cycle. A consumed annotation activation does not also request board-press
clearing, square activation, or a move. Continuous coordinates and hit testing
remain in worklet/shared-value state; only activation, distinct target-square
changes, and terminal or cancellation boundaries cross to JavaScript.

One annotation session is correlated by board ID, gesture/session token,
annotation and position revisions, board geometry epoch, and provider geometry
and lifecycle revisions. Position, annotation, dimensions, orientation, layout,
provider lifecycle, tool semantics, callback removal, replacement gesture, and
unmount cancel it. A stale draft is synchronously suppressed, and late native
signals are inert. Callback replacements become visible only after commit; an
abandoned render cannot install a handler.

Accessibility uses that same measured session rather than a parallel state
machine. With an arrow tool, `start-arrow` arms the cursor square, navigation
retains the correlated border draft, `finish-arrow` on a different square emits
one toggle, and `cancel-annotation` clears the draft without emission. With a
square tool, `toggle-square-annotation` emits immediately at the cursor. These
operations use `input: "accessibility"` and the same exact-revision matching-ID
logic as touch. Either touch or accessibility may finish a source started by
the other.

While the annotation gate is complete, its actions replace ordinary accessible
move and square activation so one action cannot request two outcomes. A
provider-selected spare remains the first action owner, and an already-pending
move retains its cancel action before a newly enabled annotation tool. Removing
the tool, collection, handler, measurement, or any correlation input cancels
the shared transient session.

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

The same correlation can affect presentation without changing those semantics.
For a matching newer revision with a non-null target, a handoff is eligible only
when its exact revision pair and intent source, piece, and target resolve to one
current transition actor. The board then crossfades the pending target into the
canonical actor instead of replaying the move from its source. A missing or
mismatched `committedIntentId`, an actor mismatch, or a null off-board target
uses ordinary controlled-transition behavior. The handoff is visual-only and
cannot keep the interaction lifecycle or a position snapshot alive.

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

The same tap recognizer can track a native press independently of semantic tap
activation. `onSquarePressIn` and `onSquarePressOut` alone therefore mount the
single hidden plane while keeping `tapEnabled` false. An accepted start captures
one canonical square and detached current-position context. Exact board,
recognizer token, position revision, geometry epoch, and provider revisions
correlate its terminal. Native release, outside/failure, pan or annotation
takeover, and mounted semantic or geometry invalidation finish it once;
duplicate and stale terminals are inert, while unmount invokes no consumer
code. Press-out is delivered before same-gesture activation or drag-start.
Callback identity is deliberately absent from the detector key: only committed
handler refs receive observations, replacement does not recreate the gesture,
and removing a handler cannot leak a stale callback.

Supplying `onSquareActivate` or `onPiecePress` opts into controlled same-square
touch and accessibility activation; only the square callback covers empty
squares. One exclusive router handles ordinary activation. When
`onMoveRequest` also exists, a selected enabled source still contains a current
controlled piece, and the enabled target is a declared destination, touch emits
only a `MoveIntent`. Accessibility does the same while
`interactionPermissions.accessibility` permits move input; with that gate off,
it continues through ordinary activation. Otherwise, an occupied current square
emits only `onPiecePress` when that callback exists; remaining enabled
activations emit only an immutable `SquareActivationIntent` when
`onSquareActivate` exists. Piece activation therefore never bubbles into a
second square callback. The accessibility surface also emits an explicit
`clear-selection` activation; only a new consumer selection prop can clear the
rendered selection.

Callback references become active only after their render commits. The tap's
captured selection revision and the current normalized position and selection
are rechecked immediately before routing, so callbacks from abandoned renders
and stale taps are inert. `onPiecePress` receives a detached frozen board-source
context at this terminal boundary. Activating a public `SparePiece` both retains
its existing provider-scoped accessible selection behavior and asks its named
board's commit-current `onPiecePress` observer with a spare-source context.

Without either `onSquareActivate` or `onPiecePress`, the ordinary same-square
tap recognizer and controlled activation action are disabled. Supplying
`onMoveRequest` alone retains the existing accessible transient source, target,
removal, and cancellation flow. Those actions use the same request executor as
drag and never write consumer selection.

Board-piece drag also defaults on when the callback exists. The synchronous
`canDragPiece` gate is evaluated against the current controlled piece and
revision before activation; exceptions and non-true results deny the drag.
`interactionPermissions.drag: false` leaves the accessible path available.
Setting `interactionPermissions.accessibility: false` disables both paths, so a
consumer cannot configure a drag-only board. It does not disable controlled
square activation or touch destination routing. `onMoveRequest` enables the
move pan path, while `onSquareActivate` or `onPiecePress` enables the ordinary
tap path. A usable annotation tool and operation callback enable the annotation
paths independently. With none of those input boundaries, the component
renders no native hit plane and constructs no recognizer.

`onPieceDragStart` is observation, not a drag gate. After permissions and
`canDragPiece` admit a source and its pan actually activates, the owning board
receives exactly one detached frozen `PieceInteractionContext`. A board source
uses its canonical square; a targeted spare uses its stable spare ID and the
target board's current revision. Denied or pre-activation-cancelled input emits
nothing. Callback exceptions are isolated, no return value is consulted, and
release still enters only the correlated `onMoveRequest` path.

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
recognizer, crosses to JS for activation, canonical hover-square boundaries,
release, and cancellation, and leaves the shared presentation active through
fresh drop verification. Continuous pointer frames remain on the UI thread.
Replacing or cancelling the active epoch removes the prior overlay without
retaining a position snapshot. Pending decision and commit phases are reducer
presentation only. Public drag-overlay and source-ghost styles now resolve from
the named target board; pressed and pending remain renderer state rather than
separate style slots. Controlled destination, selected, and disabled square
styles remain derived directly from the current selection prop, while current
hover supplies the visual-only drop-target slot.

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
The controlled-annotation operation path follows the same boundary: callback
refs become active only after commit, callback results are ignored, and a
consumer applies the delta against its latest store envelope. Policy emissions
remain distinct from long-press, two-finger, and explicit touch recognition;
exclusive routing prevents one annotation activation from also requesting a
policy clear. Accessible annotation actions and physical native validation
remain the next annotation slice.

This decision owns invariants `CBN-INV-003`, `CBN-INV-004`, `CBN-INV-007`,
`CBN-INV-008`, `CBN-INV-009`, `CBN-INV-012`, `CBN-INV-014`,
`CBN-INV-015`, and `CBN-INV-018`.
