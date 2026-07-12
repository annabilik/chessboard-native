# Native harness

Private bare React Native 0.86 consumer for native build and test gates. The
Android and iOS projects are checked in deliberately; Expo CNG does not own or
regenerate them.

The harness imports `@vibechess/chessboard-native` and its public `/pieces`
subpath through the workspace exports, then renders a responsive starting
position with the package's interim default pieces. The board remains
non-interactive and decorative. Native UI tests, accessibility targets, and
benchmarks land in the phases that own them.

CI also copies this harness to a fresh directory outside the repository,
replaces `workspace:*` with the inspected npm archive, performs a clean npm
install, and builds the packed consumer. Metro watches the package source only
for workspace development; a packed install uses normal standalone resolution.

From the repository root:

```sh
pnpm native:start
pnpm native:android
pnpm native:android:release
pnpm native:ios:gems
pnpm native:ios:pods
pnpm native:ios
pnpm native:ios:release
```

The iOS commands require Xcode, the Ruby version pinned by the Gemfile, Bundler,
and CocoaPods. Release builds use the simulator SDK with code signing disabled;
the harness is a compile-time consumer, not a distributable application.
