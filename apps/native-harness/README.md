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

`native:android:position-transition:interrupt:gate` runs a focused Release
fixture that alternates one anonymous pawn between actual plain-FEN positions
18 times at 190 ms while each controlled transition is configured for 300 ms,
then publishes one more update to prove host reuse. It verifies the final FEN,
piece count, square, and native adjustable-board state and applies the same
Fabric/Reanimated log scanner. The gate requires a physical Android device by
default; set `ANDROID_SERIAL` to select the release Galaxy when multiple devices
are connected. Evidence is written under
`apps/native-harness/android/app/build/reports/fabric-plain-fen-transition-interrupt-gate/`.
A clean-source Samsung `SM-A075F` run passed this gate and the focused
transition/provider, accepted-drag, and provider-unmount regression gates. See
the [commit-bound evidence record](../../docs/release-evidence/fabric-transition-retirement-9f6698a.md).
That record covers repository source rather than an npm artifact; performance,
background/resume, full physical accessibility, and iOS were not newly rerun.

`native:android:position-transition:interrupt:200ms:gate` preserves the same
plain-FEN, native-accessibility, reuse, and log-scanner assertions while running
72 changes at the app's 125 ms interruption cadence against 200 ms controlled
transitions. AndroidTest injects a real native tap for every position change so
Reanimated's input-event synchronous-props flush runs throughout all four
18-change cycles. After the rapid sequence it holds the quiescent hosts for 3.5
seconds, covering Reanimated 4.5's Android settled-props cleanup window and the
guarded removal frames, then injects the reuse control as another real native
tap. The scanner therefore observes the first event-driven synchronous-props
flush after host removal. The original 300/190 ms gate remains independently
executable and its historical evidence is unchanged.

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
