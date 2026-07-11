# `react-chessboard` parity fixture provenance

This directory is an immutable, offline reference snapshot used to inventory
and test compatibility with `react-chessboard`. It is not implementation
source for `@vibechess/chessboard-native` and must not be included in the npm
package.

## Upstream identity

- Project: [`Clariity/react-chessboard`](https://github.com/Clariity/react-chessboard)
- Release: `react-chessboard@5.10.0` / Git tag `v5.10.0`
- Commit: `b74704af988396d3da32a8c1627d95341e1e0061`
- Commit timestamp: `2026-02-10T20:09:30Z`
- Snapshot scope: the complete upstream `src/` tree and upstream `LICENSE`
- Retrieved: 2026-07-11

The 16 files under `src/` are copied byte-for-byte from that commit. They total
2,753 physical lines. The upstream Git tree object for `src/` is
`1a18be85a7cc4af14e21fb575fc594f9a349eb19`; the copied files have not been
formatted, generated, or otherwise changed.

`LICENSE` is the byte-for-byte upstream MIT license. Its SHA-256 digest is
`3081fe03f1fc49022e944ab7854004c8027e92b06f8cdaf177cb0781dcf06ba0`.

## Chess-piece artwork

`src/pieces.tsx` embeds SVG chess-piece artwork attributed upstream to
[Cburnett](https://commons.wikimedia.org/wiki/User:Cburnett), sourced from the
[Wikimedia Commons SVG chess pieces category](https://commons.wikimedia.org/wiki/Category:SVG_chess_pieces).
The upstream header links to
[`File:Chess plt45.svg`](https://commons.wikimedia.org/w/index.php?curid=1499810)
and identifies the artwork as Cburnett's own work under Creative Commons
Attribution-ShareAlike 3.0 Unported.

`LICENSE.CC-BY-SA-3.0.txt` is the unmodified plain-text legal code retrieved
from the
[official Creative Commons URL](https://creativecommons.org/licenses/by-sa/3.0/legalcode.txt)
on 2026-07-11. Its SHA-256 digest is
`3f941b3b89cf7b8370ceb83cc76d2120d471b58735d8ca60238a751a48d7f72f`.

The fixture preserves the upstream attribution comment and artwork exactly.
No adaptation is claimed for this reference copy.

## Reproduction and maintenance

To verify the source snapshot from a fresh repository clone, create an upstream
checkout at the pinned commit and compare it with this directory:

```sh
git clone https://github.com/Clariity/react-chessboard.git /tmp/react-chessboard-b74704a
git -C /tmp/react-chessboard-b74704a checkout --detach \
  b74704af988396d3da32a8c1627d95341e1e0061
diff -qr /tmp/react-chessboard-b74704a/src \
  fixtures/parity/upstream-b74704a/src
diff -q /tmp/react-chessboard-b74704a/LICENSE \
  fixtures/parity/upstream-b74704a/LICENSE
```

Both commands must produce no output. A future upstream target must be added
as a new pinned fixture directory with its own provenance; do not edit this
snapshot in place.
