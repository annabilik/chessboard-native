# Accessibility evidence: 0.1.1-next.3

- Status: pending physical validation
- Package: `@vibechess/chessboard-native@0.1.1-next.3`
- Package source commit: `3d8aa5b0df5b95f2e9b0d711dcb00947b693c538`
- Registry archive SHA-256:
  `573cde3c9c9d137453a8ddae31011f5d4a9c723dc0a2688ddff78776634bacf6`
- Publication workflow:
  [`33224004537`](https://github.com/annabilik/chessboard-native/actions/runs/33224004537)
- Gallery fixture commit: pending
- Machine record:
  [`accessibility-0.1.1-next.3.json`](./accessibility-0.1.1-next.3.json)

The publication workflow verified provenance, exact registry bytes, clean Expo
Android and iOS exports, and a clean bare React Native type check. The same
package source lineage passed the source-bound Android Fabric transition
gates, and this exact archive passed the app Gate C qualification recorded
elsewhere. Those results do not establish physical screen-reader behavior.

| Platform | Assistive technology | Status  | Device | Evidence |
| -------- | -------------------- | ------- | ------ | -------- |
| Android  | TalkBack             | Pending | —      | —        |
| iOS      | VoiceOver            | Pending | —      | —        |

No physical result is claimed yet. Follow the
[physical validation runbook](../physical-accessibility-validation.md), record
failed attempts in a durable commit or linked issue before a rerun, and run the
strict complete gate before changing either row to passed.

Until both rows pass, the physical screen-reader gate remains open. This
candidate must not be called production-ready or stable-release-ready on the
strength of automated audits alone.

Release decision: on 2026-08-30, the maintainer explicitly waived this open
gate only for publication of stable `0.1.1`. The waiver is not test evidence:
it does not convert any `not-run` result to `passed`, close the gate, or support
physical TalkBack or VoiceOver certification. Publishing to npm's stable
channel must not be described as an accessibility or production-readiness
certification.
