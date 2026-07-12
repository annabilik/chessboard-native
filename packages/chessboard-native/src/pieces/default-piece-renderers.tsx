import type { ReactElement } from 'react';
import { StyleSheet, View } from 'react-native';
import Svg, { Circle, Ellipse, G, Line, Path, Polygon } from 'react-native-svg';

import type { PieceRendererProps, PieceRenderers } from '../public-types';

type GeometricPieceKind =
  'bishop' | 'king' | 'knight' | 'pawn' | 'queen' | 'rook';

type GeometricPieceTone = 'dark' | 'light';

interface PiecePalette {
  readonly accent: string;
  readonly fill: string;
  readonly stroke: string;
}

const LIGHT_PALETTE: PiecePalette = Object.freeze({
  accent: '#C9C0AE',
  fill: '#F7F2E8',
  stroke: '#272522',
});

const DARK_PALETTE: PiecePalette = Object.freeze({
  accent: '#766C61',
  fill: '#302C28',
  stroke: '#F4EEE2',
});

function PieceBase({ palette }: { palette: PiecePalette }): ReactElement {
  return (
    <G
      fill={palette.fill}
      stroke={palette.stroke}
      strokeLinejoin="round"
      strokeWidth={4}
    >
      <Polygon points="24,72 76,72 84,88 16,88" />
      <Line x1={20} x2={80} y1={82} y2={82} />
    </G>
  );
}

function Pawn({ palette }: { palette: PiecePalette }): ReactElement {
  return (
    <>
      <G
        fill={palette.fill}
        stroke={palette.stroke}
        strokeLinejoin="round"
        strokeWidth={4}
      >
        <Circle cx={50} cy={28} r={12} />
        <Path d="M39 42 C40 49 37 59 31 69 L69 69 C63 59 60 49 61 42 C55 47 45 47 39 42 Z" />
      </G>
      <PieceBase palette={palette} />
    </>
  );
}

function Rook({ palette }: { palette: PiecePalette }): ReactElement {
  return (
    <>
      <G
        fill={palette.fill}
        stroke={palette.stroke}
        strokeLinejoin="round"
        strokeWidth={4}
      >
        <Polygon points="25,20 36,20 36,29 45,29 45,20 55,20 55,29 64,29 64,20 75,20 72,40 28,40" />
        <Path d="M32 40 L68 40 L64 69 L36 69 Z" />
      </G>
      <Line
        stroke={palette.accent}
        strokeLinecap="round"
        strokeWidth={4}
        x1={39}
        x2={61}
        y1={50}
        y2={50}
      />
      <PieceBase palette={palette} />
    </>
  );
}

function Knight({ palette }: { palette: PiecePalette }): ReactElement {
  return (
    <>
      <Path
        d="M29 70 C29 57 34 43 46 31 L42 18 L66 27 C75 34 77 45 70 55 C65 62 57 64 51 59 L44 70 Z"
        fill={palette.fill}
        stroke={palette.stroke}
        strokeLinejoin="round"
        strokeWidth={4}
      />
      <Path
        d="M34 58 C43 51 52 50 62 52"
        fill="none"
        stroke={palette.accent}
        strokeLinecap="round"
        strokeWidth={4}
      />
      <Circle cx={61} cy={38} fill={palette.stroke} r={3} />
      <PieceBase palette={palette} />
    </>
  );
}

function Bishop({ palette }: { palette: PiecePalette }): ReactElement {
  return (
    <>
      <G
        fill={palette.fill}
        stroke={palette.stroke}
        strokeLinejoin="round"
        strokeWidth={4}
      >
        <Path d="M50 17 C37 27 35 39 50 50 C65 39 63 27 50 17 Z" />
        <Path d="M39 51 C43 57 38 64 32 70 L68 70 C62 64 57 57 61 51 Z" />
      </G>
      <Line
        stroke={palette.accent}
        strokeLinecap="round"
        strokeWidth={4}
        x1={43}
        x2={57}
        y1={37}
        y2={27}
      />
      <PieceBase palette={palette} />
    </>
  );
}

function Queen({ palette }: { palette: PiecePalette }): ReactElement {
  return (
    <>
      <G
        fill={palette.fill}
        stroke={palette.stroke}
        strokeLinejoin="round"
        strokeWidth={4}
      >
        <Polygon points="24,34 30,20 43,31 50,15 57,31 70,20 76,34 68,46 32,46" />
        <Path d="M33 46 L67 46 C63 55 62 63 68 70 L32 70 C38 63 37 55 33 46 Z" />
      </G>
      <G fill={palette.accent} stroke={palette.stroke} strokeWidth={3}>
        <Circle cx={30} cy={20} r={4} />
        <Circle cx={50} cy={15} r={4} />
        <Circle cx={70} cy={20} r={4} />
      </G>
      <PieceBase palette={palette} />
    </>
  );
}

function King({ palette }: { palette: PiecePalette }): ReactElement {
  return (
    <>
      <G
        fill={palette.fill}
        stroke={palette.stroke}
        strokeLinejoin="round"
        strokeWidth={4}
      >
        <Path d="M30 43 C35 34 42 32 50 38 C58 32 65 34 70 43 L63 55 C59 60 61 65 67 70 L33 70 C39 65 41 60 37 55 Z" />
        <Path d="M46 13 H54 V33 H46 Z" />
        <Path d="M38 19 H62 V27 H38 Z" />
      </G>
      <Line
        stroke={palette.accent}
        strokeLinecap="round"
        strokeWidth={4}
        x1={40}
        x2={60}
        y1={48}
        y2={48}
      />
      <PieceBase palette={palette} />
    </>
  );
}

function PieceShape({
  kind,
  palette,
}: {
  kind: GeometricPieceKind;
  palette: PiecePalette;
}): ReactElement {
  switch (kind) {
    case 'bishop':
      return <Bishop palette={palette} />;
    case 'king':
      return <King palette={palette} />;
    case 'knight':
      return <Knight palette={palette} />;
    case 'pawn':
      return <Pawn palette={palette} />;
    case 'queen':
      return <Queen palette={palette} />;
    case 'rook':
      return <Rook palette={palette} />;
  }
}

function GeometricPiece({
  kind,
  size,
  tone,
}: {
  kind: GeometricPieceKind;
  size: number;
  tone: GeometricPieceTone;
}): ReactElement {
  const palette = tone === 'light' ? LIGHT_PALETTE : DARK_PALETTE;

  return (
    <View
      accessibilityElementsHidden
      accessible={false}
      importantForAccessibility="no-hide-descendants"
      pointerEvents="none"
      style={[styles.artwork, { height: size, width: size }]}
    >
      <Svg
        accessible={false}
        height="100%"
        pointerEvents="none"
        viewBox="0 0 100 100"
        width="100%"
      >
        <Ellipse cx={50} cy={90} fill="#000000" opacity={0.16} rx={34} ry={3} />
        <PieceShape kind={kind} palette={palette} />
      </Svg>
    </View>
  );
}

function WhitePawn(props: PieceRendererProps): ReactElement {
  return <GeometricPiece kind="pawn" size={props.size} tone="light" />;
}

function WhiteKnight(props: PieceRendererProps): ReactElement {
  return <GeometricPiece kind="knight" size={props.size} tone="light" />;
}

function WhiteBishop(props: PieceRendererProps): ReactElement {
  return <GeometricPiece kind="bishop" size={props.size} tone="light" />;
}

function WhiteRook(props: PieceRendererProps): ReactElement {
  return <GeometricPiece kind="rook" size={props.size} tone="light" />;
}

function WhiteQueen(props: PieceRendererProps): ReactElement {
  return <GeometricPiece kind="queen" size={props.size} tone="light" />;
}

function WhiteKing(props: PieceRendererProps): ReactElement {
  return <GeometricPiece kind="king" size={props.size} tone="light" />;
}

function BlackPawn(props: PieceRendererProps): ReactElement {
  return <GeometricPiece kind="pawn" size={props.size} tone="dark" />;
}

function BlackKnight(props: PieceRendererProps): ReactElement {
  return <GeometricPiece kind="knight" size={props.size} tone="dark" />;
}

function BlackBishop(props: PieceRendererProps): ReactElement {
  return <GeometricPiece kind="bishop" size={props.size} tone="dark" />;
}

function BlackRook(props: PieceRendererProps): ReactElement {
  return <GeometricPiece kind="rook" size={props.size} tone="dark" />;
}

function BlackQueen(props: PieceRendererProps): ReactElement {
  return <GeometricPiece kind="queen" size={props.size} tone="dark" />;
}

function BlackKing(props: PieceRendererProps): ReactElement {
  return <GeometricPiece kind="king" size={props.size} tone="dark" />;
}

const standardRenderers = Object.assign(
  Object.create(null) as Record<
    string,
    (props: PieceRendererProps) => ReactElement
  >,
  {
    bB: BlackBishop,
    bK: BlackKing,
    bN: BlackKnight,
    bP: BlackPawn,
    bQ: BlackQueen,
    bR: BlackRook,
    wB: WhiteBishop,
    wK: WhiteKing,
    wN: WhiteKnight,
    wP: WhitePawn,
    wQ: WhiteQueen,
    wR: WhiteRook,
  },
);

/** Original MIT-licensed geometric artwork for the standard piece vocabulary. @public */
export const defaultPieceRenderers: PieceRenderers =
  Object.freeze(standardRenderers);

const styles = StyleSheet.create({
  artwork: {
    alignItems: 'center',
    justifyContent: 'center',
  },
});
