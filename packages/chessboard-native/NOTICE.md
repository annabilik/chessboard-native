# Notices

Copyright (c) 2026 chessboard-native contributors.

The package code is released under the MIT License in `LICENSE`. The artwork
identified below is separate third-party material and is not covered by that
MIT grant.

## Cburnett chess-piece artwork

The twelve built-in default chess-piece renderers adapt the Cburnett design by
[Colin M.L. Burnett (User:Cburnett)](https://commons.wikimedia.org/wiki/User:Cburnett).
The source material was obtained from Wikimedia Commons, through the
[SVG chess pieces category](https://commons.wikimedia.org/wiki/Category:SVG_chess_pieces)
and these individual standard transparent SVG file pages:

- Light pieces: [`Chess_klt45.svg`](https://commons.wikimedia.org/wiki/File:Chess_klt45.svg),
  [`Chess_qlt45.svg`](https://commons.wikimedia.org/wiki/File:Chess_qlt45.svg),
  [`Chess_rlt45.svg`](https://commons.wikimedia.org/wiki/File:Chess_rlt45.svg),
  [`Chess_blt45.svg`](https://commons.wikimedia.org/wiki/File:Chess_blt45.svg),
  [`Chess_nlt45.svg`](https://commons.wikimedia.org/wiki/File:Chess_nlt45.svg),
  and [`Chess_plt45.svg`](https://commons.wikimedia.org/wiki/File:Chess_plt45.svg).
- Dark pieces: [`Chess_kdt45.svg`](https://commons.wikimedia.org/wiki/File:Chess_kdt45.svg),
  [`Chess_qdt45.svg`](https://commons.wikimedia.org/wiki/File:Chess_qdt45.svg),
  [`Chess_rdt45.svg`](https://commons.wikimedia.org/wiki/File:Chess_rdt45.svg),
  [`Chess_bdt45.svg`](https://commons.wikimedia.org/wiki/File:Chess_bdt45.svg),
  [`Chess_ndt45.svg`](https://commons.wikimedia.org/wiki/File:Chess_ndt45.svg),
  and [`Chess_pdt45.svg`](https://commons.wikimedia.org/wiki/File:Chess_pdt45.svg).

The selected license for this use is
[Creative Commons Attribution-ShareAlike 3.0 Unported](https://creativecommons.org/licenses/by-sa/3.0/)
(`CC BY-SA 3.0`). The complete legal code is included in
`LICENSE.CC-BY-SA-3.0.txt`.

Changes made July 22, 2026: the source SVG geometry and paint data were
re-expressed as `react-native-svg` components, grouped into the package's typed
renderer map, and integrated with its responsive sizing and visual-only
renderer contract. Standalone SVG document metadata and wrappers were not
retained. The adapted artwork is distributed under CC BY-SA 3.0; that license
applies to the artwork and its adaptation, not to the surrounding MIT-licensed
package code.

The Cburnett design is also the default piece design used by Lichess, as shown
in Lichess's official
[`PieceSet.scala`](https://github.com/lichess-org/lila/blob/master/modules/pref/src/main/PieceSet.scala).
The package artwork's original source and selected license are the Wikimedia
Commons files above, not Lichess's GPL-distributed copies. Attribution does not
imply endorsement by the creator, Wikimedia Commons, or Lichess.
