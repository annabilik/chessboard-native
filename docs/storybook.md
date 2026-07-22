# Native Storybook

The private Expo example app also hosts the library's on-device Storybook. It
is a searchable, interactive catalog for the standalone
`@vibechess/chessboard-native` package; it does not import or run any VibeChess
application code.

Storybook is an alternate Metro entry point. With `STORYBOOK_ENABLED=true`,
Metro starts `.rnstorybook/index.tsx`. Without that variable, the wrapper is a
strict no-op and the existing Expo Router gallery starts normally. No
Storybook module enters the normal gallery bundle.

## Run it

Install the pinned workspace dependencies once:

```sh
corepack enable
pnpm install --frozen-lockfile
```

Start Storybook:

```sh
pnpm storybook:start
```

Then press `i` for the iOS simulator or `a` for an Android emulator. The Expo
terminal can also display a QR code for a compatible device runtime. The story
picker remembers the last selected story on that device.

To open a platform directly from the example package, use:

```sh
pnpm --filter @vibechess/chessboard-native-example storybook:ios
pnpm --filter @vibechess/chessboard-native-example storybook:android
```

## Catalog scope

The catalog has 15 required stories:

- an args-driven public API playground;
- all twelve bundled Cburnett piece renderers;
- every focused Expo gallery workflow for controlled annotations, selection,
  move requests (including decision and commit timeouts), rules-owned promotion
  and premoves, provider coordination, active and disabled spare pieces,
  callbacks, interaction hardening, transitions, customization, accessibility
  formatters, and `react-chessboard` migration callback payloads.

The route-backed stories reuse the same public examples as the Expo Router
gallery. The gallery index itself is not a story because Storybook already
provides navigation.

Some stories are intentionally manual labs. Timers, native gestures,
accessibility speech, lifecycle changes, and performance behavior cannot be
certified by a static story index or Metro export. The support matrix remains
authoritative for physical-device evidence.

Type-only exports, pure coordinate/FEN helpers, and deliberate development
error paths have no meaningful native visual state. Their API documentation
and deterministic tests remain the authoritative demonstrations instead of
manufacturing placeholder stories.

## Add or rename a story

Story source lives in `apps/example/stories`. After changing the story glob,
device addons, or Storybook configuration, regenerate the committed native
entry:

```sh
pnpm --filter @vibechess/chessboard-native-example storybook:generate
```

Do not edit `.rnstorybook/storybook.requires.ts` by hand. Add the stable story
ID to `fixtures/storybook/required-stories.json`, then run:

```sh
pnpm storybook:check
```

That check regenerates the entry and fails if it was stale. It also builds the
CSF index through Storybook's public Node API and requires the exact committed
15-story inventory, with no missing or accidental stories.

## Bundle validation

The pull-request gate exports four Metro bundles:

```sh
pnpm example:export
pnpm storybook:export
```

The first command exports normal Android and iOS gallery bundles with
Storybook disabled. The second exports the native Storybook entry for both
platforms. These are JavaScript bundle gates; they do not run Xcode or Gradle
native builds.

## Deliberate limits

This repository currently supports Android and iOS, not React Native Web.
Consequently, this slice does not publish a hosted browser Storybook. A web
catalog, automated gesture traversal, and screenshot baselines should each be
separate changes after their support and maintenance costs are accepted.

The setup follows the official
[React Native Storybook project](https://github.com/storybookjs/react-native)
and its
[Expo Router entry-point guidance](https://storybookjs.github.io/react-native/docs/intro/getting-started/).
