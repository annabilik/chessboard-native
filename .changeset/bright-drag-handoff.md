---
'@vibechess/chessboard-native': patch
---

<!-- markdownlint-disable MD041 -->

Keep renderable board-drag artwork continuous across release, native
`ACTION_CANCEL`, pending acceptance, and correlated controlled commits. Exact
pending handoffs wait for both admitted hosts before the canonical
opacity-zero mapper acknowledges its exact host generation from the UI
runtime. Only then does a fresh full configured-duration crossfade start; a
generation-guarded canonical drain covers fallback and interrupted paths.

Once the board's resolved motion policy elects to animate, its Reanimated clock
now honors that decision even when the host system animation scale is disabled;
`system` and `always` reduction still stop the transition before clock creation.

This host-level guarantee assumes the selected piece renderer synchronously and
deterministically produces artwork. Missing, suspended, `null`, or
mount-dependent renderer output cannot be preserved.
