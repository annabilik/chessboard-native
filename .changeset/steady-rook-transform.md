---
'@vibechess/chessboard-native': patch
---

<!-- markdownlint-disable MD041 -->

Always write an explicit identity transform for a piece host that has no
transition, instead of `transform: undefined`. Reanimated's props builder
drops an `undefined` style member, and its Fabric props registry keeps a
host's last written transform for as long as the host stays mounted. A
dragged piece's transition starts only after the drag-overlay handoff is
acknowledged, so the moving hosts write their start offsets at progress 0
first; when that transition was aborted or torn down before its last frame,
nothing replaced the offset and the piece stayed drawn at its start square.
Castling by drag on a busy Android JS thread showed the rook on its original
square while the controlled position already had it beside the king.
