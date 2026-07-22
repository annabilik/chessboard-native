# Support matrix

This document separates the declared support contract from the evidence
currently collected for `chessboard-native`. “Supported” identifies the exact
configuration the project is designed to accept. It does not mean that every
physical-device, assistive-technology, performance, or release-candidate gate
has finished.

> [!IMPORTANT]
> The matrices describe the source package prepared as `0.1.0-next.2` unless a
> row explicitly says “published.” Merging does not publish that version. npm
> `0.1.0-next.1`, published from commit `8d3c419`, is an older immutable archive
> without the later compatibility export. Verify the exact registry version
> before treating the prepared package as available from npm.

## Status vocabulary

<!-- markdownlint-disable MD013 -->

| Status           | Meaning                                                                                                                                          |
| ---------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| Supported        | Part of the exact prepared-package support contract.                                                                                             |
| Normal CI        | Verified on every pull request and push to `main` by a required job.                                                                             |
| Opt-in native CI | A checked-in native build or audit job exists, but `RUN_NATIVE_CI=true` is currently required. A normal green pull request does not mean it ran. |
| Manual pending   | The contract and procedure exist, but the required physical or manual release pass is not complete.                                              |
| Not validated    | The project has not collected evidence for that configuration and makes no support promise.                                                      |
| Not supported    | Deliberately outside the current contract.                                                                                                       |

<!-- markdownlint-enable MD013 -->

## Runtime and dependency support

Install every peer on the exact supported release line. These are peer ranges,
not suggestions for independently upgrading one native dependency.

<!-- markdownlint-disable MD013 -->

| Runtime or dependency            | Supported line                | Status and boundary                                                                                                                                                           |
| -------------------------------- | ----------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `react`                          | `19.2.x`                      | Supported. Current development resolution is `19.2.3`.                                                                                                                        |
| `react-native`                   | `0.86.x`                      | Supported with the New Architecture. Current development resolution is `0.86.0`.                                                                                              |
| `react-native-gesture-handler`   | `2.32.x`                      | Required peer.                                                                                                                                                                |
| `react-native-reanimated`        | `4.5.x`                       | Required peer; this line requires the New Architecture.                                                                                                                       |
| `react-native-svg`               | `15.15.x`                     | Required peer for annotation and default-piece rendering.                                                                                                                     |
| `react-native-worklets`          | `0.10.x`                      | Required peer. Bare apps put `react-native-worklets/plugin` last in Babel configuration.                                                                                      |
| Expo                             | SDK 57 with React Native 0.86 | Supported managed-app boundary. Packed consumers are type-checked and exported for Android and iOS in normal CI; the clean Expo Android Release assembly is opt-in native CI. |
| Bare React Native                | React Native 0.86             | Supported boundary. A packed bare consumer is type-checked in normal CI; Android and iOS Release builds are opt-in native CI.                                                 |
| React Native New Architecture    | Required                      | Supported. The legacy architecture is not supported.                                                                                                                          |
| Module system                    | ESM                           | Supported through `import` and `default` export conditions. No CommonJS `require` build is published.                                                                         |
| Android                          | First-class native target     | Supported on the exact dependency lines. The checked-in automated Release harness is opt-in; physical accessibility and performance qualification remain pending.             |
| iOS                              | First-class native target     | Supported on the exact dependency lines. The checked-in automated Release harness is opt-in; physical accessibility and performance qualification remain pending.             |
| React Native Web                 | No support guarantee          | Not supported for 1.0. Hover, secondary click, and browser compatibility remain post-1.0 work.                                                                                |
| Other Expo SDK lines             | Any line other than SDK 57    | Not validated and outside the current support contract.                                                                                                                       |
| Other React Native lines         | Any line other than 0.86.x    | Not validated and outside the current support contract.                                                                                                                       |
| Legacy React Native architecture | Any version                   | Not supported.                                                                                                                                                                |

<!-- markdownlint-enable MD013 -->

The repository development toolchain is separately pinned to Node.js
`24.15.0` and pnpm `11.11.0`. Those versions make repository verification
reproducible; they are not additional mobile application runtime peers.

## Public entry points

Package exports are the support boundary. Deep imports into `src`, `lib`, or
another internal path are not public API.

<!-- markdownlint-disable MD013 -->

| Import                                                 | Current repository source | Prepared `0.1.0-next.2` | Contract                                                                                                                                                   |
| ------------------------------------------------------ | ------------------------- | ----------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `@vibechess/chessboard-native`                         | Supported                 | Present                 | Primary controlled component, provider, spare piece, public types, theme/defaults, and pure helpers. Consult the API report for the exact current symbols. |
| `@vibechess/chessboard-native/pieces`                  | Supported                 | Present                 | Focused `defaultPieceRenderers` export.                                                                                                                    |
| `@vibechess/chessboard-native/react-chessboard-compat` | Supported                 | Present                 | Native options-name adapter for the pinned `react-chessboard` 5.10 migration surface.                                                                      |
| `@vibechess/chessboard-native/package.json`            | Supported metadata export | Present                 | Package metadata only.                                                                                                                                     |
| `@vibechess/chessboard-native/src/*` or `lib/*`        | Not supported             | Not supported           | Internal layout may change without notice.                                                                                                                 |

<!-- markdownlint-enable MD013 -->

For exact current declarations, use the
[primary API report](../packages/chessboard-native/etc/chessboard-native.api.md),
the
[pieces API report](../packages/chessboard-native/etc/chessboard-native.pieces.api.md),
and the
[compatibility API report](../packages/chessboard-native/etc/chessboard-native.react-chessboard-compat.api.md).
API Extractor checks all three reports in normal CI, while release validation
locks the exact package resolver map. These reports are frozen reviewed
declaration snapshots; changing one requires an intentional report or resolver
diff, matching documentation and tests, and a Changeset when published behavior
changes.

The React Native export condition intentionally resolves TypeScript source for
Metro. The `import` and `default` conditions resolve compiled ESM, and `types`
resolves declarations. There is no `require` condition.

## Feature support

The feature status below applies to the prepared `0.1.0-next.2` package, not
automatically to the older npm archive.

<!-- markdownlint-disable MD013 -->

| Surface                                                                 | Current-source status | Evidence level                                                                                    | Remaining boundary                                                                                                |
| ----------------------------------------------------------------------- | --------------------- | ------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| Static controlled position rendering                                    | Supported             | Unit/component tests, API checks, gallery export, and packed Expo/bare consumers in normal CI     | Physical visual baselines remain pending.                                                                         |
| White/black orientation and rectangular dimensions                      | Supported             | Unit and property tests plus gallery examples                                                     | Broad physical device and layout matrix remains pending.                                                          |
| Strict FEN and sparse object positions                                  | Supported             | Unit/property contract evidence in normal CI                                                      | FEN remains 8 by 8 only; variants must use object positions.                                                      |
| Default and custom piece renderers                                      | Supported             | Component tests, API checks, and gallery export                                                   | Supplied renderer maps replace the defaults as a whole.                                                           |
| Native theme, instance styles, square styles, and square renderers      | Supported             | Component and parity contract evidence                                                            | Renderers are visual-only; board geometry and accessibility remain board-owned.                                   |
| Controlled selection and square activation                              | Supported             | Component and parity contract evidence                                                            | The consumer must publish selection and position changes.                                                         |
| Controlled move requests                                                | Supported             | Deterministic sync/async, cancellation, timeout, stale-result, and commit-correlation tests       | The component does not validate chess rules or commit position.                                                   |
| Board and spare-piece drag                                              | Supported             | Component instrumentation; packed Android/iOS interaction harness available in opt-in native CI   | Physical gesture/device matrix and performance qualification remain pending.                                      |
| Provider coordination and `SparePiece`                                  | Supported             | Component tests, examples, and packed interaction harness available in opt-in native CI           | Every spare must target one explicit board; the provider is not a semantic store.                                 |
| Controlled arrows and square annotations                                | Supported             | Unit/component/parity evidence and gallery examples; packed native annotation fixtures are opt-in | Persistent state remains consumer-owned.                                                                          |
| Touch annotation gestures                                               | Supported             | Deterministic component tests and the controlled-annotations gallery route                        | Physical gesture matrix remains pending.                                                                          |
| Adjustable board accessibility model                                    | Supported contract    | Component tests; Android Espresso and iOS XCUITest audits are available in opt-in native CI       | Physical TalkBack and VoiceOver validation is a release gate and remains pending.                                 |
| Reduced-motion policy                                                   | Supported             | Unit/component tests and gallery route                                                            | Physical platform confirmation remains part of the manual matrix.                                                 |
| Controlled position transitions                                         | Supported             | Pure planning, component, interruption, and geometry-rebase tests                                 | Physical visual/performance baselines remain pending.                                                             |
| `react-chessboard` 5.10 compatibility adapter                           | Supported             | API report, adapter/component tests, gallery route, and closed parity ledger                      | Included in prepared `0.1.0-next.2`; npm `0.1.0-next.1` lacks it, and browser-only exclusions remain intentional. |
| Chess rules, legal moves, promotion choice, and premove queue           | Not provided          | Explicit architecture contract and gallery consumer example                                       | The application or a chess rules library owns them.                                                               |
| Hover, right-click, modifier-key arrow colors, and ancestor auto-scroll | Not supported         | Explicit `drop` rows in the pinned parity ledger                                                  | React Native Web and browser-specific compatibility are post-1.0 work.                                            |

<!-- markdownlint-enable MD013 -->

## Evidence matrix

### Required normal CI

Every pull request and push to `main` requires:

- formatting, code lint, and Markdown lint;
- strict workspace and test type checking;
- Jest unit, component, and property tests;
- parity-tooling tests and the normal parity evidence check;
- package ESM and declaration builds;
- API Extractor report comparison;
- prerelease metadata validation;
- Android and iOS Expo gallery bundle export;
- generated-entry freshness and exact ordered 15-story Storybook inventory;
- Android and iOS native Storybook bundle export;
- one inspected npm archive;
- clean installation of that archive into isolated Expo and bare React Native
  consumers;
- type checking of both isolated consumers; and
- Android and iOS production bundle export from the isolated Expo consumer.

These checks prove JavaScript, declarations, package exports, and clean-consumer
resolution. They do not compile a native application in the normal
configuration.

### Opt-in native CI

The repository contains three native jobs guarded by
`RUN_NATIVE_CI=true`:

<!-- markdownlint-disable MD013 -->

| Job                  | Environment and evidence                                                                                                            | Current scheduling           |
| -------------------- | ----------------------------------------------------------------------------------------------------------------------------------- | ---------------------------- |
| Packed Expo Android  | Clean Expo prebuild and Android Release assembly using the inspected archive                                                        | Opt-in; skipped in normal CI |
| Bare Android Release | Clean packed bare build plus Espresso interaction and accessibility audits on a pinned API 35 `aosp_atd` emulator                   | Opt-in; skipped in normal CI |
| Bare iOS Release     | Clean packed bare build after CocoaPods install plus XCUITest interaction and accessibility audits on an available iPhone simulator | Opt-in; skipped in normal CI |

<!-- markdownlint-enable MD013 -->

The CI gate explicitly expects those jobs to be skipped while the variable is
false. A green pull request therefore must not be described as a fresh Android
or iOS native-build result.

See the [CI workflow](../.github/workflows/ci.yml), the
[native harness](../apps/native-harness/README.md), and the
[accessibility evidence description](./accessibility.md#automated-native-audits).

### Published prerelease evidence

The release record documents `0.1.0-next.1` as:

- built and inspected as one exact archive;
- published through npm trusted OIDC with provenance;
- downloaded again and matched to the prepared bytes; and
- installed into clean Expo and bare React Native consumers, with type checks
  and Expo production exports.

That evidence belongs to commit `8d3c419` and that immutable archive. It does
not validate later main-branch APIs. Merging also does not publish. See
[Releasing](./releasing.md).

## Release validation still pending

The following work must not be inferred from the support declaration or a green
normal CI run:

<!-- markdownlint-disable MD013 -->

| Release evidence             | Status         | What remains                                                                                                               |
| ---------------------------- | -------------- | -------------------------------------------------------------------------------------------------------------------------- |
| Physical TalkBack            | Manual pending | Spoken output, gesture behavior, announcement delivery, and focus retention on real Android hardware.                      |
| Physical VoiceOver           | Manual pending | Rotor and custom-action discoverability/execution, spoken output, announcements, and focus retention on real iOS hardware. |
| Visual baselines             | Manual pending | Approved baselines across the release device and appearance matrix.                                                        |
| Gesture and lifecycle matrix | Manual pending | Physical-device scrolling, clipping, cancellation, orientation, backgrounding, and reuse checks.                           |
| Compatibility matrix         | Manual pending | Recorded results for the chosen OS, device, Expo, React Native, and native toolchain combinations.                         |
| Performance budgets          | Manual pending | Physical JS/UI frame, render-count, memory, and large-board measurements.                                                  |
| Parity closure               | Complete       | All 131 ledger rows have one passing executable contract; the ten intentional drops are tested exclusions.                 |
| API freeze                   | Complete       | Three reviewed TypeScript entry-point reports plus the exact package resolver map are required in normal CI.               |
| Release candidate            | Not published  | Fresh clean-install, native, accessibility, performance, and burn-in gates must precede an RC claim.                       |
| 1.0 production support       | Not declared   | The current package remains a prerelease evaluation surface.                                                               |

<!-- markdownlint-enable MD013 -->

Automated accessibility audits are valuable but cannot establish spoken
pronunciation, TalkBack gesture behavior, VoiceOver rotor behavior, or live
focus retention. The
[manual TalkBack and VoiceOver checklist](./accessibility.md#manual-talkback-and-voiceover-pass)
remains authoritative for those claims.

## Consumer setup requirements

A supported application must:

1. use the exact peer release lines above;
2. enable React Native's New Architecture;
3. mount the app below a non-zero `GestureHandlerRootView`;
4. follow the Expo SDK 57 Reanimated setup, or put the Worklets Babel plugin
   last and install pods in a bare app;
5. constrain the board with a parent width;
6. keep position, annotations, and optional selection in application state;
7. keep chess rules and game state outside the component; and
8. pin the exact prerelease it evaluated instead of relying indefinitely on the
   moving npm `next` tag.

Report a compatibility result with the exact package version, peer versions,
platform and OS, architecture, and a minimal reproduction.
