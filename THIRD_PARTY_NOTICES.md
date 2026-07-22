# Third-party notices

This repository contains the following third-party material. Project and
package code remains under the MIT License; the Cburnett artwork identified
below is separately licensed under CC BY-SA 3.0.

## Cburnett default chess-piece artwork (published package)

- Creator: [Colin M.L. Burnett (User:Cburnett)](https://commons.wikimedia.org/wiki/User:Cburnett)
- Origin: [Wikimedia Commons SVG chess pieces](https://commons.wikimedia.org/wiki/Category:SVG_chess_pieces)
- Selected license: [Creative Commons Attribution-ShareAlike 3.0 Unported](https://creativecommons.org/licenses/by-sa/3.0/)
  (`CC BY-SA 3.0`)
- Adapted package source:
  `packages/chessboard-native/src/pieces/default-piece-renderers.tsx`
- Packaged notice: `packages/chessboard-native/NOTICE.md`
- Packaged license text:
  `packages/chessboard-native/LICENSE.CC-BY-SA-3.0.txt`

The source material was obtained from these individual standard transparent
SVG file pages on Wikimedia Commons:

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

Changes made July 22, 2026: SVG geometry and paint data were re-expressed as
`react-native-svg` components, grouped into the package's typed twelve-renderer
map, and integrated with responsive sizing and the package's visual-only
renderer contract. Standalone SVG document metadata and wrappers were not
retained. The repository's existing parity fixture was consulted as a code
reference during this port but remains excluded from the published package. The
adapted artwork is distributed under CC BY-SA 3.0; that license applies to the
artwork and its adaptation only, not the surrounding MIT-licensed code.

The Cburnett design is also the default piece design used by Lichess, as shown
in Lichess's official
[`PieceSet.scala`](https://github.com/lichess-org/lila/blob/master/modules/pref/src/main/PieceSet.scala).
The published package's original artwork source and selected license are the
Wikimedia Commons files above, not Lichess's GPL-distributed copies.
Attribution does not imply endorsement by the creator, Wikimedia Commons, or
Lichess.

## `react-chessboard` 5.10.0 parity fixture

- Origin: [`Clariity/react-chessboard`](https://github.com/Clariity/react-chessboard)
- Tag: `v5.10.0`
- Commit: `b74704af988396d3da32a8c1627d95341e1e0061`
- Copyright: Copyright (c) 2022 Ryan Gregory
- License: MIT
- Local source: `fixtures/parity/upstream-b74704a/src/`
- License text: `fixtures/parity/upstream-b74704a/LICENSE`

The source tree is preserved byte-for-byte for offline API and behavioral
inventory, source references, and compatibility tests. The complete fixture is
excluded from the published `@vibechess/chessboard-native` npm package. See the
fixture's
[provenance record](./fixtures/parity/upstream-b74704a/PROVENANCE.md).

### Cburnett artwork inside the parity fixture

- Creator: [Cburnett](https://commons.wikimedia.org/wiki/User:Cburnett)
- Origin: [Wikimedia Commons SVG chess pieces](https://commons.wikimedia.org/wiki/Category:SVG_chess_pieces)
- Upstream source link:
  [`File:Chess plt45.svg`](https://commons.wikimedia.org/w/index.php?curid=1499810)
- Work: SVG chess-piece artwork embedded in
  `fixtures/parity/upstream-b74704a/src/pieces.tsx`
- License: Creative Commons Attribution-ShareAlike 3.0 Unported
  (`CC BY-SA 3.0`)
- License text:
  `fixtures/parity/upstream-b74704a/LICENSE.CC-BY-SA-3.0.txt`

The vendored file retains the upstream attribution comment. The fixture is an
unmodified reference copy; no adaptation is claimed. It was consulted as a code
reference for the native port but is not imported or distributed by the
published package.

Development dependencies remain subject to their respective licenses. Any
additional vendored source, fixtures, or assets must be recorded here with
their origin, pinned revision, copyright notice, license, and local path before
merge.
