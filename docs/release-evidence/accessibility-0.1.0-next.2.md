# Accessibility evidence: 0.1.0-next.2

- Status: pending physical validation
- Package: `@vibechess/chessboard-native@0.1.0-next.2`
- Package source commit: `addc0cb8a7e4d6f4302e25e21c124766279ca82b`
- Registry archive SHA-256:
  `69546ea3fd9fc2a89ac4053be21a1d57e537c0ecbe27c5ea7bac02df07412916`
- Publication workflow:
  [`29760766252`](https://github.com/annabilik/chessboard-native/actions/runs/29760766252)
- Gallery fixture commit: pending
- Machine record:
  [`accessibility-0.1.0-next.2.json`](./accessibility-0.1.0-next.2.json)

The publication workflow verified provenance, exact registry bytes, clean Expo
Android and iOS exports, and a clean bare React Native type check. Those results
do not establish physical screen-reader behavior.

| Platform | Assistive technology | Status  | Device | Evidence |
| -------- | -------------------- | ------- | ------ | -------- |
| Android  | TalkBack             | Pending | —      | —        |
| iOS      | VoiceOver            | Pending | —      | —        |

No physical result is claimed yet. Follow the
[physical validation runbook](../physical-accessibility-validation.md), record
failed attempts in a durable commit or linked issue before a rerun, and run the
strict complete gate before changing either row to passed.

Until both rows pass, the physical screen-reader gate remains open. This
prerelease must not be called a release candidate on the strength of automated
audits alone.
