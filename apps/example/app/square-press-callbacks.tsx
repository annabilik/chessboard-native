import {
  Chessboard,
  type ControlledPosition,
  type OnSquarePressIn,
  type OnSquarePressOut,
  type SquarePressContext,
} from '@vibechess/chessboard-native';
import { useCallback, useRef, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

const POSITIONS = Object.freeze([
  Object.freeze({
    revision: 40,
    value: Object.freeze({
      a2: Object.freeze({ id: 'white-pawn', pieceType: 'wP' }),
      d4: Object.freeze({ id: 'white-knight', pieceType: 'wN' }),
      e5: Object.freeze({ id: 'black-knight', pieceType: 'bN' }),
      h7: Object.freeze({ id: 'black-pawn', pieceType: 'bP' }),
    }),
  }),
  Object.freeze({
    revision: 41,
    value: Object.freeze({
      a3: Object.freeze({ id: 'white-pawn', pieceType: 'wP' }),
      c6: Object.freeze({ id: 'white-knight', pieceType: 'wN' }),
      f3: Object.freeze({ id: 'black-knight', pieceType: 'bN' }),
      h6: Object.freeze({ id: 'black-pawn', pieceType: 'bP' }),
    }),
  }),
] satisfies readonly ControlledPosition[]);

interface PressEvent {
  readonly id: number;
  readonly label: string;
}

function describe(
  phase: 'onSquarePressIn' | 'onSquarePressOut',
  context: Readonly<SquarePressContext>,
): string {
  return `${phase} · ${context.square} · ${context.piece?.pieceType ?? 'empty'} · revision ${String(context.basePositionRevision)}`;
}

export default function SquarePressCallbacksExample() {
  const [events, setEvents] = useState<readonly PressEvent[]>([]);
  const [orientation, setOrientation] = useState<'white' | 'black'>('white');
  const [positionIndex, setPositionIndex] = useState(0);
  const nextEventId = useRef(0);
  const position = POSITIONS[positionIndex] ?? POSITIONS[0];

  const record = useCallback(
    (
      phase: 'onSquarePressIn' | 'onSquarePressOut',
      context: Readonly<SquarePressContext>,
    ): void => {
      const id = nextEventId.current;
      nextEventId.current += 1;
      setEvents((current) =>
        Object.freeze(
          [{ id, label: describe(phase, context) }, ...current].slice(0, 10),
        ),
      );
    },
    [],
  );

  const onSquarePressIn = useCallback<OnSquarePressIn>(
    (context) => {
      record('onSquarePressIn', context);
    },
    [record],
  );
  const onSquarePressOut = useCallback<OnSquarePressOut>(
    (context) => {
      record('onSquarePressOut', context);
    },
    [record],
  );

  return (
    <ScrollView
      contentContainerStyle={styles.content}
      contentInsetAdjustmentBehavior="automatic"
      style={styles.screen}
    >
      <Text style={styles.eyebrow}>PHASE 5 · SQUARE PRESS CALLBACKS</Text>
      <Text style={styles.title}>
        Observe a press, keep the board controlled
      </Text>
      <Text style={styles.description}>
        Press occupied or empty squares. The board reports a frozen context at
        press-in and reuses that originating context at press-out. This route
        has no activation or move callback, so pressing never selects or moves a
        piece.
      </Text>

      <View style={styles.controls}>
        <Pressable
          accessibilityRole="button"
          onPress={() => {
            setPositionIndex((current) => (current === 0 ? 1 : 0));
          }}
          style={styles.button}
        >
          <Text style={styles.buttonText}>Replace controlled position</Text>
        </Pressable>
        <Pressable
          accessibilityRole="button"
          onPress={() => {
            setOrientation((current) =>
              current === 'white' ? 'black' : 'white',
            );
          }}
          style={styles.button}
        >
          <Text style={styles.buttonText}>Flip orientation</Text>
        </Pressable>
      </View>

      <View style={styles.board}>
        <Chessboard
          accessibility={{
            boardHint:
              'Use the buttons outside the board to change the controlled example. Square press callbacks are touch-only observations.',
            boardLabel: `Square press callback board, ${orientation} orientation`,
          }}
          boardId="square-press-callback-lab"
          onSquarePressIn={onSquarePressIn}
          onSquarePressOut={onSquarePressOut}
          orientation={orientation}
          position={position}
          reduceMotion="always"
        />
      </View>

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
          <Text style={styles.emptyLog}>No square press has fired yet.</Text>
        ) : (
          events.map((event) => (
            <Text key={event.id} style={styles.logEntry}>
              {event.label}
            </Text>
          ))
        )}
      </View>

      <Text style={styles.boundary}>
        Releasing, leaving the board, gesture takeover, or a mounted controlled
        revision change closes an accepted press at most once. Callback failures
        and return values cannot affect position, selection, or annotations.
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
    alignItems: 'center',
    backgroundColor: '#254f3d',
    borderRadius: 10,
    flexGrow: 1,
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  buttonText: {
    color: '#ffffff',
    fontSize: 14,
    fontWeight: '700',
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
    maxWidth: 620,
    width: '100%',
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
  screen: {
    backgroundColor: '#f7f4ee',
    flex: 1,
  },
  title: {
    color: '#29241e',
    fontSize: 30,
    fontWeight: '800',
    maxWidth: 620,
    textAlign: 'center',
  },
});
