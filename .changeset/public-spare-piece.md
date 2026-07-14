---
'@vibechess/chessboard-native': minor
---

<!-- markdownlint-disable MD041 -->

Add the public provider-coordinated `SparePiece` API with named-board drag,
controlled move-intent payloads, and accessible select/place/cancel composition.

`PieceRendererProps` now requires a discriminated `source`. Board visuals keep
a non-null `square`; spare visuals may pass `square: null`. Custom renderers
should narrow on `props.source.kind` before assuming a square is present.
