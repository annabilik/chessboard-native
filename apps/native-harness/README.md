# Native harness

Private bare React Native 0.86 consumer for native build and test gates. The
Android and iOS projects are checked in deliberately; Expo CNG does not own or
regenerate them.

The harness imports `@vibechess/chessboard-native` and its public `/pieces`
subpath through the workspace exports, then renders one deterministic audit
fixture: a white knight on selected `d4`, white orientation, reduced motion,
and an explicit board label and hint. The board remains touch-noninteractive;
its outer host is one adjustable accessibility control and its visual
descendants are decorative.

The Android instrumentation target inspects the native adjustable node,
exercises its six navigation actions, and runs Espresso Accessibility Test
Framework checks from the screen root. The iOS UI target verifies the
aggregated board element and runs `XCUIApplication.performAccessibilityAudit()`.
Both targets use Release builds so JavaScript is embedded and headless tests do
not depend on Metro.

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

The iOS commands require Xcode, the Ruby version pinned by the Gemfile, Bundler,
and CocoaPods. Release builds use the simulator SDK with code signing disabled;
the harness is a test consumer, not a distributable application. Static audits
do not replace the physical TalkBack and VoiceOver pass documented in
[`docs/accessibility.md`](../../docs/accessibility.md).
