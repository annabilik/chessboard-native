import {
  Chessboard,
  ChessboardProvider,
  SparePiece,
  type ControlledPosition,
  type OnMoveRequest,
  type OnPieceDragStart,
  type OnPiecePress,
  type PieceInteractionContext,
} from '@vibechess/chessboard-native';
import { useCallback, useRef, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

const BOARD_ID = 'piece-callback-lab';

const POSITION = Object.freeze({
  revision: 7,
  value: Object.freeze({
    a1: Object.freeze({ id: 'white-rook', pieceType: 'wR' }),
    d4: Object.freeze({ id: 'white-pawn', pieceType: 'wP' }),
    e5: Object.freeze({ id: 'black-pawn', pieceType: 'bP' }),
    h8: Object.freeze({ id: 'black-rook', pieceType: 'bR' }),
  }),
}) satisfies ControlledPosition;

const SPARE_QUEEN = Object.freeze({
  id: 'palette-queen',
  pieceType: 'wQ',
});

const ACTIVATION_DISTANCES = Object.freeze([4, 16, 32] as const);

interface CallbackEvent {
  readonly id: number;
  readonly label: string;
}

function sourceLabel(context: Readonly<PieceInteractionContext>): string {
  return context.source.kind === 'board'
    ? `board ${context.source.square}`
    : `spare ${context.source.spareId}`;
}

export default function PieceCallbacksExample() {
  const [activationDistance, setActivationDistance] = useState(16);
  const [events, setEvents] = useState<readonly CallbackEvent[]>([]);
  const nextEventId = useRef(0);

  const record = useCallback(
    (
      kind: 'onPiecePress' | 'onPieceDragStart',
      context: Readonly<PieceInteractionContext>,
    ): void => {
      const id = nextEventId.current;
      nextEventId.current += 1;
      const label = `${kind} · ${sourceLabel(context)} · ${context.piece.pieceType} · revision ${String(context.basePositionRevision)}`;
      setEvents((current) =>
        Object.freeze([{ id, label }, ...current].slice(0, 8)),
      );
    },
    [],
  );

  const onPiecePress = useCallback<OnPiecePress>(
    (context) => {
      record('onPiecePress', context);
    },
    [record],
  );

  const onPieceDragStart = useCallback<OnPieceDragStart>(
    (context) => {
      record('onPieceDragStart', context);
    },
    [record],
  );

  const onMoveRequest = useCallback<OnMoveRequest>(() => {
    return {
      reason: 'This callback lab deliberately keeps revision 7 unchanged.',
      status: 'rejected',
    };
  }, []);

  return (
    <ScrollView
      contentContainerStyle={styles.content}
      contentInsetAdjustmentBehavior="automatic"
      style={styles.screen}
    >
      <Text style={styles.eyebrow}>PHASE 5 · PIECE CALLBACKS</Text>
      <Text style={styles.title}>Observe interaction, own the state</Text>
      <Text style={styles.description}>
        Tap a board piece or activate the spare queen to observe one immutable
        press context. Drag either source past the selected threshold to observe
        one drag-start context. This route rejects every terminal move, so the
        controlled position remains revision 7.
      </Text>

      <View style={styles.card}>
        <Text style={styles.cardTitle}>Activation distance</Text>
        <Text style={styles.cardBody}>
          The board and its targeted spare share {activationDistance} native
          points. Larger values require more movement before a drag activates.
        </Text>
        <View style={styles.controls}>
          {ACTIVATION_DISTANCES.map((distance) => {
            const selected = distance === activationDistance;
            return (
              <Pressable
                accessibilityRole="button"
                accessibilityState={{ selected }}
                key={distance}
                onPress={() => {
                  setActivationDistance(distance);
                }}
                style={[styles.button, selected && styles.buttonSelected]}
              >
                <Text
                  style={[
                    styles.buttonText,
                    selected && styles.buttonTextSelected,
                  ]}
                >
                  {distance} pt
                </Text>
              </Pressable>
            );
          })}
        </View>
      </View>

      <ChessboardProvider>
        <View style={styles.palette}>
          <Text style={styles.paletteLabel}>Targeted spare</Text>
          <SparePiece
            accessibilityLabel="White queen callback example"
            piece={SPARE_QUEEN}
            spareId="white-queen"
            targetBoardId={BOARD_ID}
          />
        </View>

        <View style={styles.board}>
          <Chessboard
            accessibility={{
              boardHint:
                'Activate an occupied square to observe a piece press, or drag a piece to observe drag start.',
              boardLabel: 'Piece callback example board, white orientation',
            }}
            boardId={BOARD_ID}
            gesture={{ activationDistance }}
            onMoveRequest={onMoveRequest}
            onPieceDragStart={onPieceDragStart}
            onPiecePress={onPiecePress}
            position={POSITION}
            reduceMotion="always"
          />
        </View>
      </ChessboardProvider>

      <View style={styles.card}>
        <View style={styles.logHeading}>
          <Text style={styles.cardTitle}>Committed callback log</Text>
          <Pressable
            accessibilityRole="button"
            onPress={() => {
              setEvents([]);
            }}
            style={styles.clearButton}
          >
            <Text style={styles.clearButtonText}>Clear</Text>
          </Pressable>
        </View>
        {events.length === 0 ? (
          <Text style={styles.emptyLog}>No callback has fired yet.</Text>
        ) : (
          events.map((event) => (
            <Text key={event.id} style={styles.logEntry}>
              {event.label}
            </Text>
          ))
        )}
      </View>

      <Text style={styles.boundary}>
        These callbacks are observations, not move decisions. They cannot mutate
        position, accept a drop, or create a second source of truth. Continuous
        pointer frames remain on the UI thread and never enter this log.
      </Text>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  board: {
    maxWidth: 520,
    width: '100%',
  },
  boundary: {
    color: '#60584d',
    fontSize: 14,
    lineHeight: 21,
    maxWidth: 620,
    textAlign: 'center',
  },
  button: {
    backgroundColor: '#eee7dc',
    borderColor: '#c9bda9',
    borderRadius: 10,
    borderWidth: 1,
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  buttonSelected: {
    backgroundColor: '#254f3d',
    borderColor: '#254f3d',
  },
  buttonText: {
    color: '#493f34',
    fontSize: 14,
    fontWeight: '700',
  },
  buttonTextSelected: {
    color: '#ffffff',
  },
  card: {
    backgroundColor: '#ffffff',
    borderColor: '#ddd3c4',
    borderRadius: 14,
    borderWidth: 1,
    gap: 10,
    maxWidth: 620,
    padding: 18,
    width: '100%',
  },
  cardBody: {
    color: '#5d5347',
    fontSize: 14,
    lineHeight: 20,
  },
  cardTitle: {
    color: '#29241e',
    fontSize: 16,
    fontWeight: '800',
  },
  clearButton: {
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  clearButtonText: {
    color: '#2d6b50',
    fontSize: 13,
    fontWeight: '700',
  },
  content: {
    alignItems: 'center',
    gap: 20,
    paddingHorizontal: 22,
    paddingVertical: 34,
  },
  controls: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  description: {
    color: '#5d5347',
    fontSize: 16,
    lineHeight: 24,
    maxWidth: 620,
    textAlign: 'center',
  },
  emptyLog: {
    color: '#766d62',
    fontSize: 14,
    fontStyle: 'italic',
  },
  eyebrow: {
    color: '#2d6b50',
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 1.2,
  },
  logEntry: {
    color: '#40382f',
    fontFamily: 'monospace',
    fontSize: 12,
    lineHeight: 18,
  },
  logHeading: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  palette: {
    alignItems: 'center',
    backgroundColor: '#e9e2d7',
    borderRadius: 12,
    flexDirection: 'row',
    gap: 14,
    padding: 12,
  },
  paletteLabel: {
    color: '#493f34',
    fontSize: 14,
    fontWeight: '700',
  },
  screen: {
    backgroundColor: '#f7f4ee',
    flex: 1,
  },
  title: {
    color: '#29241e',
    fontSize: 30,
    fontWeight: '800',
    textAlign: 'center',
  },
});
