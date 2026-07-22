import { render } from '@testing-library/react-native';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

import { defaultPieceRenderers } from '../../src/pieces/default-piece-renderers';
import type {
  PieceRendererProps,
  PieceVisualState,
} from '../../src/public-types';

const STANDARD_PIECE_TYPES = [
  'bB',
  'bK',
  'bN',
  'bP',
  'bQ',
  'bR',
  'wB',
  'wK',
  'wN',
  'wP',
  'wQ',
  'wR',
] as const;

const EXPECTED_PATH = Object.freeze({
  bB: 'M 15,32 C 17.5,34.5 27.5,34.5 30,32 C 30.5,30.5 30,30 30,30 C 30,27.5 27.5,26 27.5,26 C 33,24.5 33.5,14.5 22.5,10.5 C 11.5,14.5 12,24.5 17.5,26 C 17.5,26 15,27.5 15,30 C 15,30 14.5,30.5 15,32 z',
  bK: 'M 12.5,37 C 18,40.5 27,40.5 32.5,37 L 32.5,30 C 32.5,30 41.5,25.5 38.5,19.5 C 34.5,13 25,16 22.5,23.5 L 22.5,27 L 22.5,23.5 C 20,16 10.5,13 6.5,19.5 C 3.5,25.5 12.5,30 12.5,30 L 12.5,37',
  bN: 'M 24,18 C 24.38,20.91 18.45,25.37 16,27 C 13,29 13.18,31.34 11,31 C 9.958,30.06 12.41,27.96 11,28 C 10,28 11.19,29.23 10,30 C 9,30 5.997,31 6,26 C 6,24 12,14 12,14 C 12,14 13.89,12.1 14,10.5 C 13.27,9.506 13.5,8.5 13.5,7.5 C 14.5,6.5 16.5,10 16.5,10 L 18.5,10 C 18.5,10 19.28,8.008 21,7 C 22,7 22,10 22,10',
  bP: 'm 22.5,9 c -2.21,0 -4,1.79 -4,4 0,0.89 0.29,1.71 0.78,2.38 C 17.33,16.5 16,18.59 16,21 c 0,2.03 0.94,3.84 2.41,5.03 C 15.41,27.09 11,31.58 11,39.5 H 34 C 34,31.58 29.59,27.09 26.59,26.03 28.06,24.84 29,23.03 29,21 29,18.59 27.67,16.5 25.72,15.38 26.21,14.71 26.5,13.89 26.5,13 c 0,-2.21 -1.79,-4 -4,-4 z',
  bQ: 'M 9,26 C 17.5,24.5 30,24.5 36,26 L 38.5,13.5 L 31,25 L 30.7,10.9 L 25.5,24.5 L 22.5,10 L 19.5,24.5 L 14.3,10.9 L 14,25 L 6.5,13.5 L 9,26 z',
  bR: 'M 14,29.5 L 14,16.5 L 31,16.5 L 31,29.5 L 14,29.5 z ',
  wB: 'M 15,32 C 17.5,34.5 27.5,34.5 30,32 C 30.5,30.5 30,30 30,30 C 30,27.5 27.5,26 27.5,26 C 33,24.5 33.5,14.5 22.5,10.5 C 11.5,14.5 12,24.5 17.5,26 C 17.5,26 15,27.5 15,30 C 15,30 14.5,30.5 15,32 z',
  wK: 'M 12.5,37 C 18,40.5 27,40.5 32.5,37 L 32.5,30 C 32.5,30 41.5,25.5 38.5,19.5 C 34.5,13 25,16 22.5,23.5 L 22.5,27 L 22.5,23.5 C 20,16 10.5,13 6.5,19.5 C 3.5,25.5 12.5,30 12.5,30 L 12.5,37',
  wN: 'M 24,18 C 24.38,20.91 18.45,25.37 16,27 C 13,29 13.18,31.34 11,31 C 9.958,30.06 12.41,27.96 11,28 C 10,28 11.19,29.23 10,30 C 9,30 5.997,31 6,26 C 6,24 12,14 12,14 C 12,14 13.89,12.1 14,10.5 C 13.27,9.506 13.5,8.5 13.5,7.5 C 14.5,6.5 16.5,10 16.5,10 L 18.5,10 C 18.5,10 19.28,8.008 21,7 C 22,7 22,10 22,10',
  wP: 'm 22.5,9 c -2.21,0 -4,1.79 -4,4 0,0.89 0.29,1.71 0.78,2.38 C 17.33,16.5 16,18.59 16,21 c 0,2.03 0.94,3.84 2.41,5.03 C 15.41,27.09 11,31.58 11,39.5 H 34 C 34,31.58 29.59,27.09 26.59,26.03 28.06,24.84 29,23.03 29,21 29,18.59 27.67,16.5 25.72,15.38 26.21,14.71 26.5,13.89 26.5,13 c 0,-2.21 -1.79,-4 -4,-4 z',
  wQ: 'M 9,26 C 17.5,24.5 30,24.5 36,26 L 38.5,13.5 L 31,25 L 30.7,10.9 L 25.5,24.5 L 22.5,10 L 19.5,24.5 L 14.3,10.9 L 14,25 L 6.5,13.5 L 9,26 z',
  wR: 'M 31,17 L 31,29.5 L 14,29.5 L 14,17',
}) satisfies Readonly<Record<(typeof STANDARD_PIECE_TYPES)[number], string>>;

function colorPayload(value: unknown): number | null {
  if (typeof value !== 'object' || value === null) {
    return null;
  }
  const payload = (value as Readonly<Record<string, unknown>>)['payload'];
  return typeof payload === 'number' ? payload : null;
}

function nativeHexPayload(hex: string): number {
  return Number.parseInt(`ff${hex.slice(1)}`, 16);
}

const STATIC_STATE: PieceVisualState = Object.freeze({
  isDragging: false,
  isGhost: false,
  isPending: false,
  isPressed: false,
  isTransitioning: false,
});

function rendererProps(pieceType: string): PieceRendererProps {
  return {
    boardId: 'artwork',
    piece: Object.freeze({ pieceType }),
    size: 40,
    source: Object.freeze({ kind: 'board', square: 'a1' }),
    square: 'a1',
    state: STATIC_STATE,
    style: Object.freeze({ opacity: 0.75 }),
  };
}

describe('Cburnett default pieces', () => {
  it('[PARITY-EXPORT-DEFAULT-PIECES] exports twelve stable code-native renderers', async () => {
    expect(Object.keys(defaultPieceRenderers).sort()).toEqual(
      STANDARD_PIECE_TYPES,
    );
    expect(Object.getPrototypeOf(defaultPieceRenderers)).toBeNull();
    expect(Object.isFrozen(defaultPieceRenderers)).toBe(true);
    expect(new Set(Object.values(defaultPieceRenderers)).size).toBe(12);

    const result = await render(
      <View>
        {STANDARD_PIECE_TYPES.map((pieceType) => {
          const Renderer = defaultPieceRenderers[pieceType];
          if (Renderer === undefined) {
            throw new Error(`Missing default renderer for ${pieceType}.`);
          }
          return (
            <View key={pieceType} testID={`artwork-${pieceType}`}>
              <Renderer {...rendererProps(pieceType)} />
            </View>
          );
        })}
      </View>,
    );

    if (result.root === null) {
      throw new Error('Expected the default artwork fixture to render.');
    }

    const svgRoots = result.root.queryAll(
      (node) =>
        node.props['minX'] === 0 &&
        node.props['minY'] === 0 &&
        node.props['vbWidth'] === 45 &&
        node.props['vbHeight'] === 45,
    );
    expect(svgRoots).toHaveLength(12);
    for (const svg of svgRoots) {
      expect(svg).toHaveProp('accessible', false);
      expect(svg).toHaveProp('pointerEvents', 'none');
      expect(svg).toHaveProp('width', '100%');
      expect(svg).toHaveProp('height', '100%');
    }

    const artworkHosts = result.root.queryAll(
      (node) =>
        node.props['accessibilityElementsHidden'] === true &&
        StyleSheet.flatten(node.props['style'] as StyleProp<ViewStyle>)
          .width === 40,
    );
    expect(artworkHosts).toHaveLength(12);
    expect(
      result.root.queryAll((node) => node.props['id'] !== undefined),
    ).toEqual([]);

    for (const pieceType of STANDARD_PIECE_TYPES) {
      const artwork = result.root
        .queryAll((node) => node.props['testID'] === `artwork-${pieceType}`)
        .at(0);
      if (artwork === undefined) {
        throw new Error(`Expected artwork wrapper for ${pieceType}.`);
      }
      expect(
        artwork.queryAll(
          (node) => node.props['d'] === EXPECTED_PATH[pieceType],
        ),
      ).toHaveLength(1);

      const light = pieceType.startsWith('w');
      const fill = light ? '#ffffff' : '#000000';
      const stroke = '#000000';
      expect(
        artwork.queryAll(
          (node) =>
            colorPayload(node.props['fill']) === nativeHexPayload(fill) &&
            colorPayload(node.props['stroke']) === nativeHexPayload(stroke),
        ).length,
      ).toBeGreaterThan(0);
    }
  });
});
