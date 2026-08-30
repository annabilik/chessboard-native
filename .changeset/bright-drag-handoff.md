---
'@vibechess/chessboard-native': patch
---

<!-- markdownlint-disable MD041 -->

Keep renderable board-drag artwork continuous across release, native
`ACTION_CANCEL`, pending acceptance, and correlated controlled commits. Exact
pending handoffs wait for both admitted hosts and one guarded frame before
starting a fresh full configured-duration crossfade; a generation-guarded
canonical drain covers fallback and interrupted paths.

This host-level guarantee assumes the selected piece renderer synchronously and
deterministically produces artwork. Missing, suspended, `null`, or
mount-dependent renderer output cannot be preserved.
