# Accessibility prototype

`Chessboard` exposes one adjustable accessibility element for the whole board.
The 64-square alternative creates small, repetitive focus targets and makes it
hard to preserve context during controlled updates. Every rendered square,
piece, and notation label therefore remains decorative and hidden from
assistive technology.

This Phase 1 prototype is intentionally narrower than the final interaction
surface. It validates navigation, values, labels, announcements, focus
identity, and reduced motion before move gestures or callbacks are added.

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
controlled selected/destination/disabled flags. The public formatter context
reserves pending source and target fields for later interaction phases; both are
always false in this prototype. `accessibility.formatSquareValue` can replace
the complete text. An empty or whitespace-only formatter result falls back to
the complete default rather than removing the spoken value.

Increment and decrement provide reading-order navigation through native
standard actions. Android receives unlabeled standard-action entries so
TalkBack localizes them; on iOS the adjustable trait invokes them directly, so
they are omitted from the custom rotor menu. Four custom actions provide
directional navigation. Actions that cannot move at the current edge are
omitted, and disabled boards expose no actions. Move activation, selection
clearing, removal, spare placement, and annotation actions are reserved public
names but are not exposed by this prototype; their semantic intent APIs land in
later phases.

`accessibility.formatActionLabel` currently formats directional actions. Labels
must be non-empty and unique on a board state because iOS uses the displayed
label to resolve a custom action. The component deterministically replaces an
empty or duplicate result with a unique English fallback.

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

The policy is centralized now for later transition, lift, snapback, press, and
annotation animation paths. This prototype does not add an animation merely to
demonstrate the policy. Semantic callbacks and timeout budgets will never depend
on reduced motion.

## Manual TalkBack and VoiceOver pass

Run the Expo gallery and open **Accessibility prototype**. Test Android and iOS
separately:

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
10. Confirm there is no activation, move, removal, or annotation action in this
    Phase 1 prototype.

The automated component and native contracts do not replace this
assistive-technology pass.

## Automated native audits

The checked-in bare React Native harness provides deterministic native audits
for the static accessibility projection:

- Android runs Espresso Accessibility Test Framework checks from the full
  screen root, verifies that exactly one board host exposes the adjustable
  range and expected navigation actions, exercises all six actions, and checks
  that the visual layers hide their descendants.
- iOS locates exactly one aggregated board element, verifies its current value
  and enabled state, checks that it has no accessible descendants, and runs
  `XCUIApplication.performAccessibilityAudit()` without broad suppressions.

Both targets use a Release fixture with embedded JavaScript. CI installs the
single inspected npm archive into a fresh copy of the harness before running
the audits, so workspace source resolution cannot make them pass. Run them
locally with:

```sh
pnpm native:android:accessibility
pnpm native:ios:accessibility
```

The Android command expects a running device or emulator. CI uses the
Gradle-managed API 35 target through
`pnpm native:android:accessibility:managed`. The iOS command requires Xcode and
an available iPhone simulator running iOS 17 or newer.

These audits catch native hierarchy, trait, label, value, range, action, hit
region, contrast, and similar static regressions. They cannot establish spoken
output or pronunciation, TalkBack gesture behavior, VoiceOver rotor/action
discoverability, announcement delivery, or focus retention during live
controlled updates. The physical-device checklist above remains authoritative
for those behaviors.
