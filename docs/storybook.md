# Native Storybook

The private Expo example app also hosts the library's on-device Storybook. It
is a searchable, interactive catalog for the standalone
`@vibechess/chessboard-native` package; it does not import or run any VibeChess
application code.

Storybook is an alternate Metro entry point. With `STORYBOOK_ENABLED=true`,
Metro starts `.rnstorybook/index.tsx`. Without that variable, the wrapper is a
strict no-op and the existing Expo Router gallery starts normally. No
Storybook module enters the normal gallery bundle.

There are two ways to meet the catalog: browse the static previews below, or
run the real thing on a device or simulator.

## Preview the catalog

These are unmodified iOS simulator captures of the stories, regenerated from
the live catalog (see [Refresh the previews](#refresh-the-previews)). They are
stills: the drag, animation, and accessibility behaviour that the catalog
exists to demonstrate only exists on a device.

<!-- markdownlint-disable MD013 -->

| Public API playground                                           | Play vs random (chess.js)                                    |
| --------------------------------------------------------------- | ------------------------------------------------------------ |
| ![Public API playground story](assets/storybook/playground.png) | ![Play vs random story](assets/storybook/play-vs-random.png) |
| Args-driven tour of validated chess and mini-chess scenes       | chess.js validates requests and generates legal replies      |

| Game replay                                            | Mate in two                                                 |
| ------------------------------------------------------ | ----------------------------------------------------------- |
| ![Game replay story](assets/storybook/game-replay.png) | ![Mate in two story](assets/storybook/mate-in-two.png)      |
| The Opera Game, one controlled position per ply        | The same game's forced finish, with snapback on wrong moves |

| Themes and custom pieces                                       | Cburnett piece set                                                |
| -------------------------------------------------------------- | ----------------------------------------------------------------- |
| ![Themes and custom pieces story](assets/storybook/themes.png) | ![Cburnett piece set story](assets/storybook/cburnett-pieces.png) |
| Board theming with custom square and piece renderers           | The twelve bundled renderers on a rectangular board               |

<!-- markdownlint-enable MD013 -->

For an interactive browser version, see the
[web preview](#web-preview-unsupported) below — with the caveat that it is a
demo artifact, not a supported target.

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

The example app uses only libraries bundled with Expo Go, so a phone running a
matching Expo Go can open the printed QR code without a custom build. If port
8081 is already taken by another checkout, pass `--port`:

```sh
cd apps/example && STORYBOOK_ENABLED=true npx expo start --port 8082
```

### Jump straight to one story

The runner reads a `STORYBOOK_STORY_ID` query parameter from the URL the app
was opened with, which selects that story instead of the persisted one. This is
useful for reviewing a single story and is what the preview-capture script
uses:

```sh
xcrun simctl openurl booted \
  'exp://127.0.0.1:8082/--/?STORYBOOK_STORY_ID=play-a-game--play-vs-random'
```

Story IDs are the values pinned in `fixtures/storybook/required-stories.json`.

### Refresh the previews

The screenshots in [Preview the catalog](#preview-the-catalog) are manually
regenerated from the running catalog. With Storybook running on port 8082 and
an iOS simulator booted:

```sh
apps/example/scripts/capture-storybook-screenshots.sh
```

Pass a story ID and file name to capture one story
(`… play-a-game--play-vs-random play-vs-random`). Recapture after any change
that alters what a featured story looks like, and commit the updated PNGs.
Recording interaction video additionally requires driving the gestures by hand
alongside `xcrun simctl io booted recordVideo`; that pass is manual.

## Web preview (unsupported)

Deployed at **<https://chessboard-native.vercel.app>**.

The same story files also build as an ordinary web Storybook through
`@storybook/react-native-web-vite`, which renders them with
`react-native-web`. This exists so the catalog can be linked from a browser;
it does **not** extend the support contract. React Native Web remains
unsupported for the library itself, every claim in the
[support matrix](./support-matrix.md) is about Android and iOS, and the
authoritative catalog is the on-device one.

```sh
pnpm storybook:web         # dev server on http://localhost:6006
pnpm storybook:web:build   # static site into apps/example/dist/storybook-web
```

Two pieces of configuration make it work, both in `apps/example/.storybook-web`:

- `react-native-web` is a **root** dev dependency, not an app-level one.
  pnpm otherwise isolates it from `packages/chessboard-native`, so the bare
  `react-native` → `react-native-web` alias cannot resolve from the library's
  own files and the build fails with `Could not load react-native-web`.
- The preview wraps every story in `GestureHandlerRootView` and
  `SafeAreaProvider`. The native entry mounts those once for the whole app;
  on web the story is the root, and without the safe-area provider the
  gallery screens that render inside `SafeAreaView` produce an empty page.

### What the web preview does and does not show

Verified by rendering every story in headless Chrome: 17 of the 18 stories
paint a board, with correct measured geometry, theme colours, notation,
Cburnett SVG pieces, and an `aria-label`/`role="slider"` accessibility host.

Known gaps:

<!-- markdownlint-disable MD013 -->

| Gap                              | Detail                                                                                             |
| -------------------------------- | -------------------------------------------------------------------------------------------------- |
| Migration story renders no board | `migration--from-react-chessboard` silently renders nothing on web; it works on device             |
| Touch fidelity                   | Gestures are driven by mouse through the DOM, so drag feel, momentum, and arbitration differ       |
| Animation fidelity               | Reanimated runs as plain JavaScript on web instead of on the UI thread                             |
| Accessibility fidelity           | RN Web maps to ARIA; TalkBack and VoiceOver behaviour cannot be judged from it                     |
| Dev server                       | `storybook dev` currently fails on an `expo-modules-core` type-declaration export; the build works |

<!-- markdownlint-enable MD013 -->

Treat a web-only failure as a bug in the preview, not evidence about the
library, and reproduce it on device before filing it against the board.

### Deploying the web preview

`vercel.json` at the repository root configures the deployment: it installs
with a frozen lockfile, runs `pnpm build` (the library must be built first,
because the web preview consumes `packages/chessboard-native/lib`) followed by
`pnpm storybook:web:build`, and serves
`apps/example/dist/storybook-web`.

Connect the repository once in the Vercel dashboard, or run `vercel` from the
repository root. Two things to check on the first deploy:

- The project must use **Node.js 24**. The repository pins `node@24.15.0` in
  `engines` with `engine-strict=true` in `.npmrc`, so an older Node on the
  build image fails during install.
- The web preview is not part of `pnpm verify`. A break shows up as a failed
  Vercel deployment rather than a failed pull-request gate, which is
  deliberate: an unsupported preview should not block library work.

### Installable builds

Sharing a runnable catalog with someone who will not clone the repository
needs a real build, because Expo Go cannot load
[EAS Update](https://docs.expo.dev/eas-update/introduction/) payloads — those
require a custom build containing `expo-updates`, which this private example
app deliberately does not include. The two documented options, both requiring
an Expo account and neither currently wired up, are an EAS Build
internal-distribution Android artifact (installable from a link or QR) and a
TestFlight or ad-hoc iOS build. Adopt one only alongside the maintenance cost
of keeping it current.

## Catalog scope

The catalog is organized by consumer task, so a consumer finds the feature
they are building rather than the library's internal taxonomy. Story titles
and notes distinguish playable chess scenarios from rules-free protocol,
editor, renderer, and engineering fixtures. The required inventory is pinned
in `fixtures/storybook/required-stories.json` and covers these sections:

- **Overview** — an args-driven public API playground over two orthodox chess
  scenes (an opening move and the Scholar's Mate finish) plus an explicitly
  labelled 5×3 mini-chess ladder mate; each pair of `positionVariant` frames is
  one legal ply apart and can animate forward or backward, while observational
  callbacks stream to the Actions tab. A separate renderer inventory shows all
  twelve bundled Cburnett pieces.
- **Play a Game** — the "using with chess.js" recipe (chess.js validates
  inside `onMoveRequest`, legal-move hints flow through `selection`, and a
  random opponent replies with revisioned positions), a clearly rules-free
  move-request lifecycle lab for decision/commit timeouts, chess.js-backed
  selection and legal-move hints, consumer-owned promotion and a premove that
  chess.js revalidates after the opponent move, and move animation with legal
  special-move fixtures plus labelled synthetic labs.
- **Analysis and Training** — analysis arrows and highlights, Opera Game
  replay, and the Opera Game's forced finish as a mate-in-two puzzle.
- **Board Setup and Variants** — a rules-free spare-piece variant-editor
  palette and multiple independently controlled boards coordinated by one
  explicit provider.
- **Look and Feel** — themes and custom pieces, piece touch feedback, and
  square press feedback.
- **Accessibility** — screen-reader board navigation as one adjustable control.
- **Migration** — familiar `react-chessboard` names over a controlled pipeline
  whose example consumer validates drops and candidate arrows with chess.js.
- **Engineering Lab** — the interaction-hardening QA stress lab, deliberately
  kept outside the chess-concept sections.

Most stories reuse the same public example screens as the Expo Router gallery,
while a few focused recipes in `apps/example/src` exist only for Storybook.
chess.js is a dependency of the private example app only — the published
package stays rules-free. Stories that claim playable or orthodox chess use
complete positions and validated moves. Renderer
inventories, variant editors, request-lifecycle labs, and multi-piece position
diffs may be synthetic; those stories identify that boundary in their visible
copy instead of presenting it as chess legality. The gallery index itself is
not a story because Storybook already provides navigation.

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
story inventory, with no missing or accidental stories.

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

This repository supports Android and iOS, not React Native Web. The
[web preview](#web-preview-unsupported) is a demo artifact built from the same
stories; it is not a support claim, and no parity, accessibility, or
performance evidence is collected from it. Automated gesture traversal and
screenshot baselines remain separate changes after their maintenance costs are
accepted.

The committed previews are documentation, not a visual-regression baseline.
Nothing fails when they age, so refresh them deliberately with the capture
script when a featured story changes. This is the observed ecosystem pattern
for interaction-heavy native libraries — published docs with recorded media
plus a runnable example app — rather than a hosted interactive catalog, which
in practice requires the react-native-web support this project excludes.

The setup follows the official
[React Native Storybook project](https://github.com/storybookjs/react-native)
and its
[Expo Router entry-point guidance](https://storybookjs.github.io/react-native/docs/intro/getting-started/).
