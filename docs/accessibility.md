# Accessibility contract

`Chessboard` exposes one adjustable accessibility element for the whole board.
The 64-square alternative creates small, repetitive focus targets and makes it
hard to preserve context during controlled updates. Every rendered square,
piece, and notation label therefore remains decorative and hidden from
assistive technology.

The Phase 1 prototype established navigation, values, labels, announcements,
focus identity, and reduced motion. Phase 2 adds controlled source, target,
removal, cancellation, square activation, and selection-clearing actions
plus spare-source selection and placement. Phase 4 adds controlled arrow and
square annotation actions. None of these paths turns the cursor into semantic
selection or creates square-level accessibility targets. A public `SparePiece`
is its own accessible button; its visual renderer descendants remain
decorative.

`ChessboardProvider` is compositional coordination, not an accessibility
control. It contributes no focus target, while its shared drag overlay is
pointerless and hides all overlay artwork from the accessibility tree. Each
registered board keeps its own adjustable host and virtual cursor. Multiple
boards under one provider therefore remain independently focusable without
sharing cursor, semantic selection, pending, or announcement state. The
provider may retain one transient selected spare source only until placement or
cancellation. A standalone board's private provider is likewise invisible.

## Virtual cursor

The component owns one transient virtual cursor. It is presentation state, not
consumer-owned selection:

- A valid controlled `selection.selectedSquare` chooses the initial cursor.
- Otherwise the cursor starts at the visual top-left square.
- Increment and decrement traverse the board in visual row-major reading order.
- Directional actions move left, right, up, or down in visual coordinates.
- Movement clamps at an edge and never wraps.
- An orientation change keeps the canonical cursor square and only changes its
  visual index.
- Position and selection updates refresh the spoken value without moving a
  still-valid cursor.
- A dimension change preserves an in-range square. An out-of-range square falls
  back to a valid controlled selection, then to the new visual top-left square.

The cursor never updates `selection`, and a later selection prop does not pull a
valid cursor to a new square. This separation preserves the single source of
truth for semantic selection.

## Native control

The board host has the native `adjustable` role. Its value contains a zero-based
visual range and a text description such as:

```text
f3, white knight; possible destination
```

The default value describes the canonical square, standard or custom piece, and
controlled selected/destination/disabled flags. When move interaction is
enabled, `isPendingSource` and `isPendingTarget` identify the transient request
projection at the cursor. `accessibility.formatSquareValue` can replace the
complete text. An empty or whitespace-only formatter result falls back to the
complete default rather than removing the spoken value.

Increment and decrement provide reading-order navigation through native
standard actions. Android receives unlabeled standard-action entries so
TalkBack localizes them; on iOS the adjustable trait invokes them directly, so
they are omitted from the custom rotor menu. Four custom actions provide
directional navigation. Actions that cannot move at the current edge are
omitted, and disabled boards expose no actions. With `onSquareActivate`, the
current square exposes controlled activation. When `onMoveRequest` is also
present and accessible move input is permitted, a declared enabled destination
with a current enabled selected source routes only to that move callback; every
other enabled square routes only to `onSquareActivate`. When a controlled
selected square exists, a separate
clear-selection action emits an explicit activation intent. Neither action
changes the selection prop.

When `onMoveRequest` is present and accessible move input is permitted,
removing the piece on the current enabled square remains a direct accessibility
`MoveIntent` with `targetSquare: null`; it does not enter the square-activation
callback.

Without `onSquareActivate`, `onMoveRequest` preserves the transient move
fallback while accessible move input is permitted. An occupied cursor square
exposes source activation and removal. Activating a source stores only transient
interaction context; after moving the cursor, activation submits the target.
Removal submits the same intent with `targetSquare: null`, and cancellation
clears source targeting or active async work. A provider-selected spare takes
precedence over every board-local interaction action until placement or
cancellation. An already-pending move likewise keeps only its cancel action
ahead of a newly enabled annotation tool. Otherwise, a complete annotation gate
replaces ordinary move and square-activation actions while leaving cursor
navigation available.

`accessibility.formatActionLabel` formats directional and every available
interaction action, including `start-arrow`, `finish-arrow`,
`toggle-square-annotation`, and `cancel-annotation`. Labels must be non-empty
and unique on a board state because iOS uses the displayed label to resolve a
custom action. The component deterministically replaces an empty or duplicate
result with a unique English fallback.

The default board label includes the current orientation. A supplied
`accessibility.boardLabel` is a full, verbatim override so localized consumers
do not receive appended English. Include any desired orientation summary in the
override. `accessibility.boardHint` is also a full override.

```tsx
<Chessboard
  accessibility={{
    boardLabel: 'Analysis board, white orientation',
    boardHint: 'Swipe up or down to move through squares.',
    formatSquareValue: ({ square, piece, isDestination }) =>
      `${square}, ${piece?.pieceType ?? 'empty'}${
        isDestination ? ', candidate destination' : ''
      }`,
  }}
  boardId="analysis"
  position={{ e4: { pieceType: 'wP' } }}
/>
```

## Controlled square activation

`onSquareActivate` is the opt-in boundary for both same-square touch and
accessibility activation. Its immutable `SquareActivationIntent` describes the
current square and piece, selected source, destination flag, input, action, and
base position and selection revisions. The callback is a notification only;
its return value is ignored, and the consumer must publish any resulting
selection update.

Ordinary activation has one exclusive outcome. Touch routes a declared enabled
destination to `onMoveRequest` whenever that callback is active and the enabled
selected source still contains a current controlled piece. Accessibility uses
the same route only while accessible move input is permitted. Otherwise the
board emits one activation and no move request. An explicit `clear-selection`
action always asks the consumer to clear the controlled selection, including
when the selected square itself is disabled.

Callback references become visible only after their render commits. A touch
gesture captures the selection revision at start, and both touch and
accessibility paths recheck the current normalized position and selection
before routing. Abandoned renders, stale selections, and late gesture events
therefore cannot invoke an obsolete callback or mutate semantic state.

## Accessible move requests

Accessible move input defaults on when `onMoveRequest` is present. Set
`interactionPermissions.drag` to `false` for an accessibility-only board.
Setting `interactionPermissions.accessibility` to `false` also disables drag;
the package refuses to expose a drag-only action. With `onSquareActivate`,
controlled activation remains available, but destination activation emits a
square intent instead of entering the disabled accessible move route. Touch
destination routing is unaffected. Without `onSquareActivate`, `onMoveRequest`
retains source-target activation as transient accessibility state only while
the gate is enabled. Every resulting move path emits `MoveIntent`, invokes the
same callback, uses the same decision and controlled-commit timeouts, and waits
for the consumer's next `position` prop. While a physical drag is active, the
adjustable control temporarily suppresses activation and move actions so two
input paths cannot submit overlapping work.

The virtual cursor and captured source are transient. They never modify
`selection`, infer a legal destination, or move a piece. A revisioned consumer
confirms an accepted request with a newer position revision and the matching
`committedIntentId`. Position, orientation, dimension, permission, or unmount
changes cancel obsolete work; late callback and timer results are inert.

Terminal committed, rejected, cancelled, and timed-out outcomes use one
reducer-correlated announcement. `accessibility.formatMoveOutcome` can return a
localized replacement, return `null` to suppress it, or fall back to the
built-in English message when it returns empty text or throws.

## Accessible spare placement

`SparePiece` has the native button role. Activating it selects a detached,
provider-scoped source and announces that selection. The source must name an
explicit `targetBoardId`; only the matching registered board exposes **Place
selected spare** and **Cancel spare selection**. Boards with another ID keep
their ordinary action set. Selecting a second spare replaces the first.

Placement uses the matching board's current virtual-cursor square and emits the
same controlled request lifecycle as other moves:

- `source` is `{ kind: 'spare', spareId }` rather than a fake square.
- `piece` is the detached spare payload.
- `input` is `accessibility`.
- `boardId` and `basePositionRevision` come from the target board at emission.

The place action appears only while the target has a current `onMoveRequest`,
accessible move input is permitted, no move lifecycle is pending, and the
cursor square is enabled. The cancel action remains available if a callback or
permission disappears, so a selected source cannot trap the user. A successful
request submission clears the transient selection; callback acceptance still
does not commit a position. The consumer must publish the next controlled
position, and a rejection leaves that position unchanged.

Starting a physical drag from that selected source, explicit cancellation,
selecting another source, source identity change, disablement or unmount,
target unmount, and provider deactivation also clear the selection. These
values never enter `ChessboardProps.selection`.
`accessibility.formatActionLabel` receives `place-spare` and `cancel-spare` with
the spare piece in its action context, so consumers can localize both labels.

## Accessible annotation actions

Annotation actions use the same measured, board-scoped runtime as touch. They
are enabled only when the board is ready and measured, has a current annotation
domain and non-null `annotationTool`, and has a committed
`onAnnotationOperation` callback. An empty controlled collection is a valid
domain. Removing any part of that gate cancels an armed action and removes the
annotation actions.

With an arrow tool, **Start arrow** captures the current cursor square and
shows the same transient border draft used by explicit touch input. Cursor
navigation remains available. On a different square, **Finish arrow** emits one
immutable toggle; on the source square only **Cancel annotation** is offered.
Cancellation clears the transient source and emits nothing. With a square
tool, **Toggle square annotation** emits one toggle for the current cursor
square immediately.

Every emitted operation has `input: 'accessibility'`, the exact current base
annotation revision, current matching IDs, and a stable candidate annotation
ID. The callback result is ignored. The draft may disappear after a terminal
action, but a persistent arrow or square appears or disappears only when the
consumer applies the operation and publishes a later `annotations` prop. Touch
and accessibility share one transient annotation session, so either input can
finish a source started by the other without creating a second annotation
store.

Annotation mode is exclusive with ordinary accessible move and square actions.
A provider-selected spare has higher precedence, and an already-pending move
continues to expose cancellation before annotation input can begin. These
rules prevent one native action from requesting two semantic outcomes.

## Correlated announcements

Consumers may request an announcement with
`accessibility.announcement = { id, message }`. Both strings must contain
non-whitespace content. An ID is spoken once per mounted board, including under
React Strict Mode effect replay. Changing the message without changing the ID
does not speak again. Supplying a new ID allows the same text to be queued again
on iOS; Android uses its native announcement path. Unmounting starts a new board
lifetime.

React Native 0.86 does not emit Android adjustable-value feedback when a text
value is present, and custom actions bypass its standard scroll feedback path.
The component therefore announces the committed cursor value explicitly on
Android after a successful cursor action. iOS uses native adjustable and custom
action feedback. The manual platform pass remains authoritative for both.

## Reduced motion

`reduceMotion` defaults to `system`:

- `system` subscribes to the operating-system preference.
- `always` always disables motion.
- `never` explicitly permits motion.

System mode starts in the safe reduced state until the native query resolves.
A newer native change event wins over an older query, stale events after
cleanup are ignored, and re-entering system mode starts safely reduced again.
Explicit modes do not subscribe to the native preference.

The policy is centralized for transition, lift, snapback, press, and annotation
animation paths. Ordinary and special controlled-position moves, captures,
additions, removals, ambiguity fades, coordinated second actors, and
type-changing crossfades settle directly to the current prop when motion is
reduced. Enabling reduced motion during an active transition cancels and settles
that epoch; disabling it again does not replay the already-settled revision.
Callback and timeout semantics never depend on reduced motion.

## Manual TalkBack and VoiceOver pass

Run the Expo gallery and test **Accessibility prototype** first, then repeat the
interaction-specific steps on **Controlled move requests** and **Provider
coordination**, followed by **Spare pieces**, **Controlled annotation
gestures**, and **Interaction hardening**. Test Android and iOS separately:

1. Enable TalkBack or VoiceOver and focus the board.
2. Confirm the board is one focus target and visual squares are not separate
   targets.
3. Confirm the label, orientation, role, current square, piece, and controlled
   flags are understandable.
4. Increment and decrement repeatedly, including across a row and at both ends.
5. Invoke every available directional action, including at all four edges.
6. Schedule an orientation change in the gallery, return focus to the board
   before it fires, then confirm focus remains on the same host and the
   canonical cursor square stays unchanged.
7. Repeat the delayed test for controlled position and reduced-motion changes.
   Confirm the value refreshes without moving the cursor.
8. Trigger the same announcement text twice with new IDs. Confirm it speaks
   twice and does not double-speak either ID.
9. Cycle through `system`, `always`, and `never` with delayed changes; confirm
   the board remains the same focus target and cursor state is preserved.
10. On the accessibility prototype, confirm there is no activation, move,
    removal, or annotation action because it has no matching callback boundary
    and no complete annotation tool/collection/handler gate.
11. On the controlled-selection route, activate an ordinary occupied or empty
    square. Confirm exactly one activation callback occurs and the visual
    selection changes only after the example publishes its next selection prop.
12. With a selected source on that route, activate a declared destination.
    Confirm exactly one move request and no square-activation callback occur,
    then confirm the position and selection change only through controlled prop
    updates.
13. Select a square and invoke clear selection. Confirm one
    `clear-selection` activation occurs and the consumer's next selection prop
    removes the selected styling.
14. On the controlled move-request route, which omits `onSquareActivate`,
    activate an occupied source, navigate to a target, and activate again.
    Confirm the transient fallback emits one request and the board remains one
    focus target while the controlled position updates.
15. Repeat the fallback with removal and cancellation. Confirm removal sends a
    null target, cancellation does not update position, and neither action
    creates a square accessibility element.
16. On the provider-coordination route, move between the two boards. Confirm
    each board is one distinct adjustable target, each retains its own cursor
    and value, and the provider and shared drag overlay never become focus
    targets.
17. On the spare-pieces route, activate one palette button, focus the named
    board, move its cursor, and choose place. Confirm the board emits one spare
    move request and changes only after the example publishes a controlled
    position update.
18. Select a different spare and choose cancel. Confirm the palette selection
    clears, the board position does not change, and an unrelated board never
    exposes either spare action.
19. On the controlled-annotation route with the arrow tool, choose **Start
    arrow**, navigate to a different square, and choose **Finish arrow**.
    Confirm one `toggle/accessibility` operation is logged and the persistent
    arrow appears only after the example publishes the next annotation prop.
20. Start another arrow and choose **Cancel annotation**. Confirm no operation
    is logged and no persistent annotation is added. Repeat on the source
    square and confirm **Finish arrow** is not offered there.
21. Select the square tool and choose **Toggle square annotation** twice on the
    same cursor square. Confirm the consumer-owned collection adds and then
    removes the square through two revisioned operations while the board stays
    one focus target.
22. While annotation mode is enabled, confirm ordinary activation, removal,
    and source/target move actions are absent.
23. On the interaction-hardening route, confirm the clipped source palette and
    provider overlay add no focus target. Select the spare, background and
    resume the app, then confirm the transient selection is gone and the board
    remains one adjustable control.
24. Repeat after starting a board or spare drag. Confirm no overlay remains
    focused or visible after resume and the next non-drag accessible placement
    still emits exactly one controlled request.

The automated component and native contracts do not replace this
assistive-technology pass. In particular, XCUITest can audit the static iOS
annotation surface but cannot reliably invoke named custom actions as VoiceOver
would. The physical VoiceOver steps above are therefore the authoritative iOS
action-discoverability and execution check.

## Automated native audits

The checked-in bare React Native harness provides a deterministic native audit
for the interaction-enabled projection; component tests separately retain the
read-only contract:

- Android runs Espresso Accessibility Test Framework checks from the full
  screen root, verifies that exactly one board host exposes the adjustable
  range and expected navigation/move actions, exercises them, and checks that
  the gesture plane and visual layers hide their descendants. Packed arrow and
  square fixtures additionally invoke the named annotation actions and verify
  controlled revisions, payload input, and add/remove results.
- iOS locates exactly one aggregated board element, verifies its current value
  and enabled state in the enabled path, checks that it has no accessible
  descendants, and runs `XCUIApplication.performAccessibilityAudit()` without
  broad suppressions. Its packed annotation fixture also captures the initial
  one-host visual surface; named custom-action execution remains a physical
  VoiceOver check.
- Android and iOS launch a separate packed interaction fixture inside a native
  `ScrollView`. A drag from the controlled piece stays with the board and emits
  one rejected request, while an empty-square swipe moves the parent without a
  callback; the controlled revision remains unchanged.
- The lifecycle scenarios background and resume the interaction fixture, then
  verify that obsolete work cannot commit. Android interrupts an active pointer
  stream and proves the next gesture remains usable; iOS backgrounds pending
  callback work and verifies its abort signal.
- Component coverage separately verifies that a provider-selected spare and an
  already-pending move retain action precedence when an annotation tool becomes
  available.

Both targets use a Release fixture with embedded JavaScript. CI installs the
single inspected npm archive into a fresh copy of the harness before running
the audits, so workspace source resolution cannot make them pass. Run them
locally with:

```sh
pnpm native:android:accessibility
pnpm native:ios:accessibility
```

The Android command expects a running device or emulator. CI cold-boots a
pinned, snapshot-disabled API 35 `aosp_atd` emulator and runs that connected
Release audit. `pnpm native:android:accessibility:managed` remains available as
a locally provisioned Gradle-managed alternative. The iOS command requires
Xcode and an available iPhone simulator running iOS 17 or newer.

The P2.6 component suite covers the spare button, decorative visual subtree,
selection, place/cancel action exposure, and controlled move payload. P2.7 adds
packed-package native interaction scenarios for board-drag versus
parent-ScrollView ownership, exactly-once callbacks, AppState cancellation, and
post-cancellation reuse. Component tests cover provider overlay structure,
target geometry, unmount, and stale-signal handling; the Expo
interaction-hardening route is the manual clipped-palette and geometry lab.
Manual TalkBack and VoiceOver validation remains a release gate for
assistive-technology behavior that deterministic automation cannot prove.

These audits catch native hierarchy, trait, label, value, range, action, hit
region, contrast, and similar static regressions. They cannot establish spoken
output or pronunciation, TalkBack gesture behavior, VoiceOver rotor/action
discoverability, announcement delivery, or focus retention during live
controlled updates. The physical-device checklist above remains authoritative
for those behaviors.
