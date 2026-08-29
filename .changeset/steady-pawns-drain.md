---
'@vibechess/chessboard-native': patch
---

<!-- markdownlint-disable MD041 -->

Keep admitted controlled-transition hosts mounted through Reanimated 4.5's
Android settled-props cleanup window before guarded removal. Admission is
bounded across live and retiring hosts to `2 * cells + 64` for pieces and 65
for pending handoffs; overflow current pieces settle statically without an
animated descriptor, while hidden detached and pending actors are omitted.
Other platforms and overflow actors retain the two-frame removal barrier.

This protection applies to ordinary updates while the layer stays mounted.
Whole-board or provider teardown still removes descendants immediately and
remains covered by a mandatory physical Android lifecycle gate.
