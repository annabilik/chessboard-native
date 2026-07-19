import {
  Chessboard,
  ChessboardProvider,
  SparePiece,
  type ChessboardStyles,
  type ChessboardTheme,
  type ControlledPosition,
  type MoveIntent,
  type OnMoveRequest,
  type PieceData,
  type PositionObject,
  type SquareRenderer,
} from '@vibechess/chessboard-native';
import { useCallback, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

const BOARD_ID = 'visual-customization';

const INITIAL_POSITION = Object.freeze({
  a1: Object.freeze({ id: 'white-rook', pieceType: 'wR' }),
  d4: Object.freeze({ id: 'white-queen', pieceType: 'wQ' }),
  e5: Object.freeze({ id: 'black-pawn', pieceType: 'bP' }),
  h8: Object.freeze({ id: 'black-king', pieceType: 'bK' }),
}) satisfies PositionObject;

const SPARE_PIECE = Object.freeze({ pieceType: 'wN' });

const VISUAL_SELECTION = Object.freeze({
  destinationSquares: Object.freeze(['d5', 'e5']),
  disabledSquares: Object.freeze(['a8']),
  selectedSquare: 'd4',
});

const VISUAL_THEME = Object.freeze({
  darkSquare: Object.freeze({ backgroundColor: '#355f5a' }),
  destinationSquare: Object.freeze({
    backgroundColor: 'rgba(241, 194, 50, 0.32)',
  }),
  disabledSquare: Object.freeze({ opacity: 0.42 }),
  draggingPiece: Object.freeze({
    transform: Object.freeze([
      Object.freeze({ rotate: '2deg' }),
      Object.freeze({ scale: 1.14 }),
    ]),
  }),
  draggingPieceGhost: Object.freeze({ opacity: 0.24 }),
  dropTarget: Object.freeze({
    backgroundColor: 'rgba(255, 218, 92, 0.68)',
  }),
  lightSquare: Object.freeze({ backgroundColor: '#e7efe8' }),
  selectedSquare: Object.freeze({
    backgroundColor: 'rgba(242, 126, 62, 0.34)',
  }),
}) satisfies ChessboardTheme;

const VISUAL_STYLES = Object.freeze({
  board: Object.freeze({
    backgroundColor: '#183a36',
    boxShadow: '0px 12px 24px rgba(20, 42, 38, 0.24)',
  }),
  draggingPiece: Object.freeze({
    backgroundColor: 'rgba(255, 248, 220, 0.92)',
    borderRadius: 16,
    boxShadow: '0px 10px 16px rgba(15, 40, 35, 0.4)',
  }),
  draggingPieceGhost: Object.freeze({
    borderColor: '#ffd65a',
    borderRadius: 14,
    borderWidth: 2,
  }),
  dropTarget: Object.freeze({
    borderColor: '#fff7c2',
    borderWidth: 3,
  }),
  piece: Object.freeze({ borderRadius: 12 }),
}) satisfies ChessboardStyles;

const VISUAL_SQUARE_STYLES = Object.freeze({
  b2: Object.freeze({ backgroundColor: '#aecfc5' }),
  g7: Object.freeze({ backgroundColor: '#244d49' }),
});

type DemoPosition = Omit<ControlledPosition, 'value'> & {
  readonly value: PositionObject;
};

function piecesMatch(
  left: Readonly<PieceData> | undefined,
  right: Readonly<PieceData>,
): boolean {
  return (
    left !== undefined &&
    left.id === right.id &&
    left.pieceType === right.pieceType
  );
}

function applyIntent(
  current: Readonly<DemoPosition>,
  intent: Readonly<MoveIntent>,
): Readonly<DemoPosition> | null {
  if (
    intent.boardId !== BOARD_ID ||
    intent.basePositionRevision !== current.revision
  ) {
    return null;
  }

  if (intent.source.kind === 'board') {
    if (!piecesMatch(current.value[intent.source.square], intent.piece)) {
      return null;
    }
  } else if (
    intent.source.spareId !== 'palette-knight' ||
    !piecesMatch(SPARE_PIECE, intent.piece) ||
    intent.targetSquare === null
  ) {
    return null;
  }

  const value: Record<string, Readonly<PieceData>> = {};
  for (const [square, piece] of Object.entries(current.value)) {
    if (
      piece !== undefined &&
      (intent.source.kind === 'spare' || square !== intent.source.square)
    ) {
      value[square] = piece;
    }
  }
  if (intent.targetSquare !== null) {
    value[intent.targetSquare] = intent.piece;
  }

  return Object.freeze({
    committedIntentId: intent.intentId,
    revision: current.revision + 1,
    value: Object.freeze(value),
  });
}

function squareStateLabel(
  state: Parameters<SquareRenderer>[0]['state'],
): string | null {
  if (state.isDropTarget) return 'DROP';
  if (state.isPendingTarget) return 'WAIT';
  if (state.isPendingSource) return 'SOURCE';
  if (state.isPressed) return 'PRESS';
  if (state.isSelected) return 'SELECT';
  if (state.isDestination) return 'MOVE';
  if (state.isDisabled) return 'BLOCK';
  return null;
}

const VisualSquare: SquareRenderer = ({
  boardId,
  piece,
  size,
  square,
  state,
  style,
}) => {
  const label = squareStateLabel(state);
  const inheritedOpacity =
    typeof style.opacity === 'number' ? style.opacity : 1;

  return (
    <View
      pointerEvents="none"
      style={StyleSheet.absoluteFill}
      testID={`visual-square:${boardId}:${square}`}
    >
      {piece === null ? null : (
        <View
          style={[
            styles.occupiedMarker,
            {
              height: Math.max(4, size * 0.08),
              opacity: inheritedOpacity,
              width: Math.max(4, size * 0.08),
            },
          ]}
        />
      )}
      {label === null ? null : (
        <View style={[styles.squareBadge, { opacity: inheritedOpacity }]}>
          <Text
            style={[
              styles.squareBadgeText,
              { fontSize: Math.max(7, Math.min(10, size * 0.14)) },
            ]}
          >
            {label}
          </Text>
        </View>
      )}
    </View>
  );
};

export default function VisualCustomizationExample() {
  const [position, setPosition] = useState<DemoPosition>({
    revision: 0,
    value: INITIAL_POSITION,
  });
  const [status, setStatus] = useState(
    'Drag the queen, rook, or palette knight to inspect the transient visual states.',
  );

  const onMoveRequest = useCallback<OnMoveRequest>(
    (intent) => {
      const next = applyIntent(position, intent);
      if (next === null) {
        setStatus('Rejected a stale, foreign, or off-board spare request.');
        return { status: 'rejected', reason: 'Request is not current' };
      }

      setPosition(next);
      setStatus(
        `Committed ${intent.source.kind === 'board' ? intent.source.square : intent.source.spareId} → ${intent.targetSquare ?? 'off board'} as controlled revision ${String(next.revision)}.`,
      );
      return { status: 'accepted' };
    },
    [position],
  );

  return (
    <ScrollView
      contentContainerStyle={styles.content}
      contentInsetAdjustmentBehavior="automatic"
      style={styles.screen}
    >
      <Text style={styles.eyebrow}>PHASE 5 · VISUAL CUSTOMIZATION</Text>
      <Text style={styles.title}>Consumer paint, board-owned behavior</Text>
      <Text style={styles.description}>
        The position remains controlled while renderSquare receives frozen
        visual props. Theme defaults and per-instance styles layer onto drop
        targets, drag overlays, and source ghosts without adding another state
        owner.
      </Text>

      <ChessboardProvider>
        <View style={styles.paletteCard}>
          <View style={styles.paletteCopy}>
            <Text style={styles.cardTitle}>Provider spare source</Text>
            <Text style={styles.cardCopy}>
              Drag this reusable knight onto the board to project the same
              target-square and drag-overlay styling as a board piece.
            </Text>
          </View>
          <SparePiece
            accessibilityLabel="White knight customization spare"
            piece={SPARE_PIECE}
            size={68}
            spareId="palette-knight"
            style={styles.sparePiece}
            targetBoardId={BOARD_ID}
          />
        </View>

        <View style={styles.boardCard}>
          <Chessboard
            accessibility={{
              boardHint:
                'Drag a piece to inspect the custom target and source visuals.',
              boardLabel: 'Visual customization board, white orientation',
            }}
            boardId={BOARD_ID}
            interactionPermissions={{ accessibility: true, drag: true }}
            onMoveRequest={onMoveRequest}
            position={position}
            reduceMotion="never"
            renderSquare={VisualSquare}
            selection={VISUAL_SELECTION}
            squareStyles={VISUAL_SQUARE_STYLES}
            styles={VISUAL_STYLES}
            theme={VISUAL_THEME}
            transitionDurationMs={0}
          />
        </View>
      </ChessboardProvider>

      <View style={styles.statusCard}>
        <Text style={styles.cardTitle}>Deterministic controlled result</Text>
        <Text style={styles.status}>
          Revision {position.revision}
          {`\n`}
          {status}
        </Text>
        <Pressable
          accessibilityRole="button"
          onPress={() => {
            setPosition((current) => ({
              revision: current.revision + 1,
              value: INITIAL_POSITION,
            }));
            setStatus(
              'Consumer published a reset revision; the board did not restore internal position state.',
            );
          }}
          style={styles.resetButton}
        >
          <Text style={styles.resetButtonText}>Reset controlled position</Text>
        </Pressable>
      </View>

      <View style={styles.legendCard}>
        <Text style={styles.cardTitle}>Renderer state legend</Text>
        <Text style={styles.cardCopy}>
          SELECT and MOVE come from controlled selection. PRESS, DROP, SOURCE,
          and WAIT are transient projections. BLOCK is a declarative disabled
          square. The renderer is visual-only: no press or gesture handlers are
          passed into it.
        </Text>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  boardCard: {
    borderColor: '#183a36',
    borderRadius: 18,
    borderWidth: 3,
    maxWidth: 520,
    overflow: 'hidden',
    width: '100%',
  },
  cardCopy: {
    color: '#665c4d',
    fontSize: 14,
    lineHeight: 21,
  },
  cardTitle: {
    color: '#1e1b17',
    fontSize: 19,
    fontWeight: '700',
  },
  content: {
    alignItems: 'center',
    gap: 20,
    paddingHorizontal: 20,
    paddingVertical: 28,
  },
  description: {
    color: '#665c4d',
    fontSize: 16,
    lineHeight: 24,
    maxWidth: 520,
    width: '100%',
  },
  eyebrow: {
    color: '#665c4d',
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 1.2,
    maxWidth: 520,
    width: '100%',
  },
  legendCard: {
    backgroundColor: '#edf4f1',
    borderColor: '#b8cec7',
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    gap: 8,
    maxWidth: 520,
    padding: 16,
    width: '100%',
  },
  occupiedMarker: {
    backgroundColor: '#f2c232',
    borderRadius: 999,
    left: 5,
    position: 'absolute',
    top: 5,
  },
  paletteCard: {
    alignItems: 'center',
    backgroundColor: '#fffaf0',
    borderColor: '#d9d0c3',
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    gap: 16,
    justifyContent: 'space-between',
    maxWidth: 520,
    padding: 16,
    width: '100%',
  },
  paletteCopy: {
    flex: 1,
    gap: 6,
  },
  resetButton: {
    alignItems: 'center',
    backgroundColor: '#236a5b',
    borderRadius: 10,
    justifyContent: 'center',
    minHeight: 46,
    paddingHorizontal: 16,
    paddingVertical: 11,
  },
  resetButtonText: {
    color: '#ffffff',
    fontSize: 15,
    fontWeight: '700',
  },
  screen: {
    backgroundColor: '#f7f4ee',
  },
  sparePiece: {
    backgroundColor: '#e8f0ed',
    borderColor: '#236a5b',
    borderRadius: 14,
    borderWidth: 2,
  },
  squareBadge: {
    alignSelf: 'center',
    backgroundColor: 'rgba(20, 42, 38, 0.82)',
    borderRadius: 999,
    bottom: 4,
    paddingHorizontal: 4,
    paddingVertical: 2,
    position: 'absolute',
  },
  squareBadgeText: {
    color: '#ffffff',
    fontWeight: '800',
    letterSpacing: 0.3,
  },
  status: {
    color: '#665c4d',
    fontSize: 14,
    lineHeight: 21,
  },
  statusCard: {
    backgroundColor: '#ffffff',
    borderColor: '#d9d0c3',
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    gap: 12,
    maxWidth: 520,
    padding: 16,
    width: '100%',
  },
  title: {
    color: '#1e1b17',
    fontSize: 30,
    fontWeight: '700',
    letterSpacing: -0.7,
    maxWidth: 520,
    width: '100%',
  },
});
