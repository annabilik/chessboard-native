# Accessibility evidence: 0.1.0

- Status: pending physical validation
- Package: `@vibechess/chessboard-native@0.1.0`
- Package source commit: `f8aa4653e9d75d3141dfcbae52a1223a327f6945`
- Registry archive SHA-256:
  `7457c0f66774c03ca18a3bc05496471d1bf58f4163069f5e15245b64aeb8ea67`
- Publication workflow:
  [`30806201340`](https://github.com/annabilik/chessboard-native/actions/runs/30806201340)
- Gallery fixture commit: pending
- Machine record:
  [`accessibility-0.1.0.json`](./accessibility-0.1.0.json)

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
release must not be called production-ready or a release candidate on the
strength of automated audits alone.
