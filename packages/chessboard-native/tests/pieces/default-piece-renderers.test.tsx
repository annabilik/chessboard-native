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
  bB: 'M50 17 C37 27 35 39 50 50 C65 39 63 27 50 17 Z',
  bK: 'M30 43 C35 34 42 32 50 38 C58 32 65 34 70 43 L63 55 C59 60 61 65 67 70 L33 70 C39 65 41 60 37 55 Z',
  bN: 'M29 70 C29 57 34 43 46 31 L42 18 L66 27 C75 34 77 45 70 55 C65 62 57 64 51 59 L44 70 Z',
  bP: 'M39 42 C40 49 37 59 31 69 L69 69 C63 59 60 49 61 42 C55 47 45 47 39 42 Z',
  bQ: 'M33 46 L67 46 C63 55 62 63 68 70 L32 70 C38 63 37 55 33 46 Z',
  bR: 'M32 40 L68 40 L64 69 L36 69 Z',
  wB: 'M50 17 C37 27 35 39 50 50 C65 39 63 27 50 17 Z',
  wK: 'M30 43 C35 34 42 32 50 38 C58 32 65 34 70 43 L63 55 C59 60 61 65 67 70 L33 70 C39 65 41 60 37 55 Z',
  wN: 'M29 70 C29 57 34 43 46 31 L42 18 L66 27 C75 34 77 45 70 55 C65 62 57 64 51 59 L44 70 Z',
  wP: 'M39 42 C40 49 37 59 31 69 L69 69 C63 59 60 49 61 42 C55 47 45 47 39 42 Z',
  wQ: 'M33 46 L67 46 C63 55 62 63 68 70 L32 70 C38 63 37 55 33 46 Z',
  wR: 'M32 40 L68 40 L64 69 L36 69 Z',
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
    square: 'a1',
    state: STATIC_STATE,
    style: Object.freeze({ opacity: 0.75 }),
  };
}

describe('original geometric default pieces', () => {
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
        node.props['vbWidth'] === 100 &&
        node.props['vbHeight'] === 100,
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
      const fill = light ? '#F7F2E8' : '#302C28';
      const stroke = light ? '#272522' : '#F4EEE2';
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
