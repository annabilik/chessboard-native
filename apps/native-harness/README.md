# Native harness

Private bare React Native 0.86 consumer for native build and test gates. The
Android and iOS projects are checked in deliberately; Expo CNG does not own or
regenerate them.

The Phase 0 shell imports `@vibechess/chessboard-native` through its public
workspace export and renders the disabled board frame. Native UI tests,
accessibility targets, and benchmarks land in the phases that own them.

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

The iOS commands require Xcode, Ruby, Bundler, and CocoaPods. Release builds use
the simulator SDK with code signing disabled; the harness is a compile-time
consumer, not a distributable application.
