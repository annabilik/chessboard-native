# Native harness

Private bare React Native 0.86 consumer for native build and test gates. The
Android and iOS projects are checked in deliberately; Expo CNG does not own or
regenerate them.

The harness imports `@vibechess/chessboard-native` and its public `/pieces`
subpath through the workspace exports. Its default deterministic accessibility
fixture renders a white knight on selected `d4`, white orientation, reduced
motion, and an explicit board label and hint. The board remains
touch-noninteractive; its outer host is one adjustable accessibility control
and its visual descendants are decorative.

The Android instrumentation target inspects the native adjustable node,
exercises its six navigation actions, and runs Espresso Accessibility Test
Framework checks from the screen root. The iOS UI target verifies the
aggregated board element and runs `XCUIApplication.performAccessibilityAudit()`.
Both targets also launch an interaction fixture through native initial props.
That fixture places the controlled board inside a standard React Native
`ScrollView`, with a `SparePiece` inside an `overflow: hidden` palette. It
checks empty-square scrolling, board-piece and spare-piece capture,
exactly-once rejection callbacks with an unchanged position revision, and
background/resume cancellation. Android interrupts an active pointer stream;
iOS confirms that backgrounding aborts pending interaction work. Both targets
use Release builds so JavaScript is embedded and headless tests do not depend
on Metro.

CI also copies this harness to a fresh directory outside the repository,
replaces `workspace:*` with the inspected npm archive, performs a clean npm
install, and builds the packed consumer. Metro watches the package source only
for workspace development; a packed install uses normal standalone resolution.

From the repository root:

```sh
pnpm native:start
pnpm native:android
pnpm native:android:release
pnpm native:android:accessibility
pnpm native:android:accessibility:managed
pnpm native:android:drag:gate
pnpm native:android:drag:terminal-handoff:gate
pnpm native:android:position-transition:interrupt:gate
pnpm native:android:position-transition:interrupt:200ms:gate
pnpm native:android:position-transition:whole-unmount:gate
pnpm native:ios:gems
pnpm native:ios:pods
pnpm native:ios
pnpm native:ios:release
pnpm native:ios:accessibility
```

`native:android:accessibility` uses a running device or emulator.
`native:android:accessibility:managed` provisions the checked-in API 35
Gradle-managed device and needs hardware virtualization. The iOS audit selects
an available iPhone simulator, preferring one that is already booted; set
`IOS_SIMULATOR_UDID` to require a particular available simulator.

`native:android:drag:gate` runs the focused Release test for repeated accepted
drags followed by correlated controlled-position commits and 300 ms position
transitions. It clears and captures logcat around the test, then fails on known
Fabric/Reanimated stale host signatures even when instrumentation itself
succeeds. Set `ANDROID_SERIAL` when more than one device is connected. Evidence
is written under
`apps/native-harness/android/app/build/reports/fabric-drag-gate/`.

`native:android:drag:terminal-handoff:gate` is the focused physical Release
gate for the native terminal-drag presentation barrier. Its fixture uses one
stable-id pawn and an explicit consumer commit control. The native test holds
the React Native JavaScript queue after the active overlay is visibly at the
target. It arms the terminal draw window before injecting `ACTION_UP`, forces a
real draw on every vsync, ignores any draw generation already in flight when
the window is armed, and marks `ACTION_UP` complete immediately after injection
returns. Blocked coverage then proves at least eight strictly post-injection
draws over 100 ms, each retaining the terminal overlay, before explicitly
releasing and joining the blocked JavaScript task. Its exit reason must be that
explicit release; the later safety timeout is a gate failure. Rejected,
off-board, cancelled, and unblocked-reuse windows are likewise armed before
their synchronous terminal event, so every subsequent draw through native
overlay cleanup is classified. Every outcome requires exactly one full-opacity
primary actor, except for the explicit accepted-move crossfade containing one
pending target and one canonical actor co-located at the target with combined
full opacity. Arbitrary co-located partial actors, blanks, overdraw, and spatial
duplicates fail. Recovered outcomes may transfer the primary actor from the
terminal pointer to the canonical source, but every frame must classify at one
of those two locations. Accepted outcomes reject source snapback or any actor
away from the target and observe the pending target and correlated 200 ms
transition. Every session finishes from its actual latest draw with exactly one
full-opacity canonical actor at the expected square and no other primary or
overlay host. Here, primary means the overlay, pending target, canonical
transition, or canonical piece; the intentional 0.45-opacity pending-source
ghost is recorded separately.

The same unchanged process must reject an in-board move and an off-board
release at a measured point outside the board (with the overlay witnessed at
that point), cancel without a callback, and accept and commit a final reuse
drag. The unblocked final reuse proves continuous primary coverage and
canonical settle without requiring a timing-racy post-`ACTION_UP` overlay
frame.
The shared gate runner requires a physical device, zero official
Fabric/Reanimated scanner findings, and exactly one schema-valid
`CHESSBOARD_DRAG_HANDOFF` record. The test emits that record after collecting
all five sessions and before enforcing their visual assertions, so an expected
negative control remains machine-readable. The record includes a bounded
role/alpha/center witness for every invalid composition it samples, so a red
run preserves the exact native-view overlap or gap instead of only its count.
A validated passing summary is
embedded in `result.json`; a missing, duplicate, malformed, or violating record
fails the gate even when Gradle exits zero.
Class-only and wrong-method filters for the terminal-handoff test also require
that record, so a zero-test filter mismatch cannot pass closed-loop evidence.
Evidence is written under
`apps/native-harness/android/app/build/reports/fabric-drag-terminal-handoff-gate/`.

`native:android:position-transition:interrupt:gate` runs a focused Release
fixture that alternates one anonymous pawn between actual plain-FEN positions
18 times at 190 ms while each controlled transition is configured for 300 ms,
then publishes one more update to prove host reuse. It verifies the final FEN,
piece count, square, and native adjustable-board state and applies the same
Fabric/Reanimated log scanner. The gate requires a physical Android device by
default; set `ANDROID_SERIAL` to select the release Galaxy when multiple devices
are connected. Evidence is written under
`apps/native-harness/android/app/build/reports/fabric-plain-fen-transition-interrupt-gate/`.
A clean-source Samsung `SM-A075F` run passed this gate and the corrected 200 ms,
whole-provider-unmount, and transition/provider-overlap gates. See the
[final commit-bound evidence record](../../docs/release-evidence/fabric-transition-retirement-bf151bd.md).
That record covers repository source rather than an npm artifact or the
VibeChess application Gate C; performance, background/resume, full physical
accessibility, visual baselines, and iOS were not newly rerun.

`native:android:position-transition:interrupt:200ms:gate` preserves the same
plain-FEN, native-accessibility, reuse, and log-scanner assertions while running
72 changes against 200 ms controlled transitions. An instrumentation-thread
driver injects every raw native DOWN/UP pair through `UiAutomation`, without
Espresso's click-action delay or main-thread idle waits. Intermediate events are
asynchronous and the final UP is a synchronous ordering barrier. The driver
waits for each exact React-committed position-change count before scheduling the
next input, preventing queued touches from reaching JavaScript in a burst. Each
next DOWN is no earlier than both the preceding DOWN plus the configured 125 ms
and the commit acknowledgement plus 100 ms; the gate fails if that schedule
cannot stay below the preceding DOWN plus 200 ms. The fixture separately
measures all 71 consecutive JavaScript `onPress` gaps and publishes one summary
after handler 72; the test requires a minimum of 100 ms, a maximum below 200 ms,
and zero invalid or out-of-bound gaps. The sequence is therefore accepted only
when it measurably interrupts all four 18-change transition cycles. Afterward it
holds the quiescent hosts for 3.5 seconds, covering Reanimated 4.5's Android
settled-props cleanup window and the guarded removal frames, then injects the
reuse control as a separate off-main raw native tap. The scanner therefore
observes the first event-driven synchronous-props flush after host removal. The
original 300/190 ms gate remains independently executable and its historical
evidence is unchanged.

`native:android:position-transition:whole-unmount:gate` runs two focused
200 ms lifecycle cycles against the transition/provider fixture. The prompt
cycle starts a controlled transition, removes the complete board/provider
subtree after 50 ms, injects a real native sibling-control tap while the board
is absent, promptly remounts by another real tap, and starts another transition
with a real post-remount tap. The long cycle repeats the immediate absent tap,
keeps the subtree absent for 3.5 seconds, injects another real absent tap that
remounts it, and starts a final transition with a real native tap. It asserts
zero boards while absent, exactly one reusable board after each remount, and the
latest canonical square and revision. The shared scanner remains the crash and
stale-Fabric-tag oracle. This mandatory physical Android lifecycle gate is
separate from, and does not replace, the held-drag provider-replacement gate.

The iOS commands require Xcode, the Ruby version pinned by the Gemfile, Bundler,
and CocoaPods. Release builds use the simulator SDK with code signing disabled;
the harness is a test consumer, not a distributable application. Static audits
do not replace the physical TalkBack and VoiceOver pass documented in
[`docs/accessibility.md`](../../docs/accessibility.md).
