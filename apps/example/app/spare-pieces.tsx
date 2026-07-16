import {
  Chessboard,
  ChessboardProvider,
  SparePiece,
  type ControlledPosition,
  type MoveIntent,
  type OnMoveRequest,
  type PieceData,
  type PositionObject,
} from '@vibechess/chessboard-native';
import { useCallback, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

const BOARD_ID = 'spare-piece-editor';

const INITIAL_POSITION = Object.freeze({
  a1: Object.freeze({ id: 'white-king', pieceType: 'wK' }),
  d4: Object.freeze({ id: 'center-pawn', pieceType: 'wP' }),
  h8: Object.freeze({ id: 'black-king', pieceType: 'bK' }),
}) satisfies PositionObject;

const WHITE_QUEEN = Object.freeze({ pieceType: 'wQ' });
const BLACK_KNIGHT = Object.freeze({ pieceType: 'bN' });
const PALETTE: Readonly<Record<string, Readonly<PieceData>>> = Object.freeze({
  'black-knight': BLACK_KNIGHT,
  'white-queen': WHITE_QUEEN,
});

type DemoPosition = Omit<ControlledPosition, 'value'> & {
  readonly value: PositionObject;
};

type DecisionMode = 'accept' | 'reject';

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

  if (intent.source.kind === 'spare') {
    const palettePiece = PALETTE[intent.source.spareId];
    if (
      !piecesMatch(palettePiece, intent.piece) ||
      intent.targetSquare === null
    ) {
      return null;
    }
  } else if (!piecesMatch(current.value[intent.source.square], intent.piece)) {
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

function sourceLabel(intent: Readonly<MoveIntent>): string {
  return intent.source.kind === 'spare'
    ? `spare ${intent.source.spareId}`
    : `board square ${intent.source.square}`;
}

export default function SparePiecesExample() {
  const [position, setPosition] = useState<DemoPosition>({
    revision: 0,
    value: INITIAL_POSITION,
  });
  const [decisionMode, setDecisionMode] = useState<DecisionMode>('accept');
  const [status, setStatus] = useState(
    'Drag a spare onto the board, or activate it and use the board actions menu to place it.',
  );

  const onMoveRequest = useCallback<OnMoveRequest>(
    (intent) => {
      if (decisionMode === 'reject') {
        setStatus(
          `Consumer rejected ${sourceLabel(intent)} → ${intent.targetSquare ?? 'off board'}; the controlled position is unchanged.`,
        );
        return { status: 'rejected', reason: 'Example rejection mode' };
      }

      const next = applyIntent(position, intent);
      if (next === null) {
        setStatus(
          `Consumer rejected an obsolete, unknown, or off-board spare request from ${sourceLabel(intent)}.`,
        );
        return { status: 'rejected', reason: 'Request is not current' };
      }

      setPosition(next);
      setStatus(
        `Committed ${sourceLabel(intent)} → ${intent.targetSquare ?? 'off board'} as controlled revision ${String(next.revision)}.`,
      );
      return { status: 'accepted' };
    },
    [decisionMode, position],
  );

  return (
    <ScrollView
      contentContainerStyle={styles.content}
      contentInsetAdjustmentBehavior="automatic"
      style={styles.screen}
    >
      <Text style={styles.eyebrow}>PHASE 2 · EXTERNAL PIECE SOURCES</Text>
      <Text style={styles.title}>Controlled spare-piece placement</Text>
      <Text style={styles.description}>
        Each spare names one target board. Dragging or accessible placement
        emits the same move request against that board's current controlled
        revision; neither path edits the position itself.
      </Text>

      <ChessboardProvider>
        <View style={styles.paletteCard}>
          <Text style={styles.cardTitle}>Reusable palette</Text>
          <Text style={styles.instructions}>
            For the non-drag path, activate a spare, focus the board, navigate
            to a square, then choose “Place selected spare” from its actions
            menu. “Cancel spare selection” leaves the position unchanged.
          </Text>
          <View style={styles.paletteRow}>
            <View style={styles.spareOption}>
              <SparePiece
                accessibilityHint="Select this reusable queen for placement on the editor board."
                accessibilityLabel="White queen spare piece"
                piece={WHITE_QUEEN}
                size={64}
                spareId="white-queen"
                style={styles.sparePiece}
                targetBoardId={BOARD_ID}
              />
              <Text style={styles.spareLabel}>White queen</Text>
            </View>
            <View style={styles.spareOption}>
              <SparePiece
                accessibilityHint="Select this reusable knight for placement on the editor board."
                accessibilityLabel="Black knight spare piece"
                piece={BLACK_KNIGHT}
                size={64}
                spareId="black-knight"
                style={styles.sparePiece}
                targetBoardId={BOARD_ID}
              />
              <Text style={styles.spareLabel}>Black knight</Text>
            </View>
          </View>
        </View>

        <View style={styles.boardCard}>
          <Text style={styles.cardTitle}>Position editor</Text>
          <Chessboard
            accessibility={{
              boardHint:
                'Navigate to a destination and use the actions menu to place or cancel the selected spare.',
              boardLabel: 'Spare-piece editor board, white orientation',
            }}
            boardId={BOARD_ID}
            onMoveRequest={onMoveRequest}
            position={position}
            reduceMotion="always"
          />
          <Text style={styles.status}>
            Revision {position.revision} · next decision: {decisionMode}
            {`\n`}
            {status}
          </Text>
        </View>
      </ChessboardProvider>

      <View style={styles.controlsCard}>
        <Text style={styles.cardTitle}>Consumer controls</Text>
        <View style={styles.controls}>
          <Pressable
            accessibilityRole="button"
            onPress={() => {
              setDecisionMode((current) =>
                current === 'accept' ? 'reject' : 'accept',
              );
            }}
            style={styles.primaryButton}
          >
            <Text style={styles.primaryButtonText}>Toggle accept / reject</Text>
          </Pressable>
          <Pressable
            accessibilityRole="button"
            onPress={() => {
              setPosition((current) => ({
                revision: current.revision + 1,
                value: INITIAL_POSITION,
              }));
              setStatus(
                'Consumer published an unrelated controlled reset; no component-owned position was restored.',
              );
            }}
            style={styles.secondaryButton}
          >
            <Text style={styles.secondaryButtonText}>
              Reset controlled position
            </Text>
          </Pressable>
        </View>
      </View>

      <Text style={styles.boundary}>
        This route keeps the palette and board in one explicit provider and a
        stable layout. Nested ScrollView arbitration and native lifecycle stress
        flows arrive in the next interaction-hardening slice.
      </Text>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  boardCard: {
    backgroundColor: '#ffffff',
    borderColor: '#d9d0c3',
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    gap: 12,
    maxWidth: 520,
    padding: 14,
    width: '100%',
  },
  boundary: {
    color: '#665c4d',
    fontSize: 14,
    lineHeight: 21,
    maxWidth: 520,
    width: '100%',
  },
  cardTitle: {
    color: '#1e1b17',
    fontSize: 20,
    fontWeight: '700',
  },
  content: {
    alignItems: 'center',
    gap: 20,
    paddingHorizontal: 20,
    paddingVertical: 28,
  },
  controls: {
    gap: 10,
  },
  controlsCard: {
    backgroundColor: '#ffffff',
    borderColor: '#d9d0c3',
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    gap: 12,
    maxWidth: 520,
    padding: 16,
    width: '100%',
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
  instructions: {
    color: '#665c4d',
    fontSize: 14,
    lineHeight: 21,
  },
  paletteCard: {
    backgroundColor: '#eee7da',
    borderColor: '#d9d0c3',
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    gap: 12,
    maxWidth: 520,
    padding: 16,
    width: '100%',
  },
  paletteRow: {
    flexDirection: 'row',
    gap: 20,
  },
  primaryButton: {
    alignItems: 'center',
    backgroundColor: '#2f5f4f',
    borderRadius: 10,
    justifyContent: 'center',
    minHeight: 48,
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  primaryButtonText: {
    color: '#ffffff',
    fontSize: 15,
    fontWeight: '700',
  },
  screen: {
    backgroundColor: '#f7f4ee',
  },
  secondaryButton: {
    alignItems: 'center',
    borderColor: '#2f5f4f',
    borderRadius: 10,
    borderWidth: 1,
    justifyContent: 'center',
    minHeight: 48,
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  secondaryButtonText: {
    color: '#2f5f4f',
    fontSize: 15,
    fontWeight: '700',
  },
  spareLabel: {
    color: '#3f392f',
    fontSize: 13,
    fontWeight: '600',
  },
  spareOption: {
    alignItems: 'center',
    gap: 6,
  },
  sparePiece: {
    backgroundColor: '#ffffff',
    borderColor: '#b9ac9a',
    borderRadius: 10,
    borderWidth: StyleSheet.hairlineWidth,
  },
  status: {
    color: '#665c4d',
    fontSize: 14,
    lineHeight: 21,
  },
  title: {
    color: '#1e1b17',
    fontSize: 30,
    fontWeight: '800',
    letterSpacing: -0.7,
    maxWidth: 520,
    width: '100%',
  },
});
