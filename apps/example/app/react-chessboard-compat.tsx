import {
  Chessboard,
  type ReactChessboardArrow,
  type ReactChessboardOptions,
  type ReactChessboardPieceDropHandlerArgs,
} from '@vibechess/chessboard-native/react-chessboard-compat';
import { useCallback, useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

type CompatibilityPosition = Readonly<
  Partial<Record<string, Readonly<{ pieceType: string }>>>
>;

const INITIAL_POSITION = Object.freeze({
  a1: Object.freeze({ pieceType: 'wR' }),
  d1: Object.freeze({ pieceType: 'wQ' }),
  e1: Object.freeze({ pieceType: 'wK' }),
  d4: Object.freeze({ pieceType: 'wN' }),
  d5: Object.freeze({ pieceType: 'bP' }),
  d8: Object.freeze({ pieceType: 'bQ' }),
  e8: Object.freeze({ pieceType: 'bK' }),
  h8: Object.freeze({ pieceType: 'bR' }),
}) satisfies CompatibilityPosition;

const INITIAL_ARROWS = Object.freeze([
  Object.freeze({
    color: '#d97706',
    endSquare: 'f5',
    startSquare: 'd4',
  }),
]) satisfies readonly Readonly<ReactChessboardArrow>[];

const ALTERNATE_ARROWS = Object.freeze([
  Object.freeze({
    color: '#2563eb',
    endSquare: 'h6',
    startSquare: 'd2',
  }),
  Object.freeze({
    color: '#b91c1c',
    endSquare: 'd4',
    startSquare: 'd8',
  }),
]) satisfies readonly Readonly<ReactChessboardArrow>[];

function detachArrows(
  arrows: readonly Readonly<ReactChessboardArrow>[],
): readonly Readonly<ReactChessboardArrow>[] {
  return Object.freeze(
    arrows.map(({ color, endSquare, startSquare }) =>
      Object.freeze({ color, endSquare, startSquare }),
    ),
  );
}

export default function ReactChessboardCompatibilityScreen() {
  const [position, setPosition] =
    useState<CompatibilityPosition>(INITIAL_POSITION);
  const [arrows, setArrows] =
    useState<readonly Readonly<ReactChessboardArrow>[]>(INITIAL_ARROWS);
  const [lastEvent, setLastEvent] = useState('No compatibility callback yet.');

  const handlePieceDrop = useCallback(
    (args: Readonly<ReactChessboardPieceDropHandlerArgs>): boolean => {
      const { piece, sourceSquare, targetSquare } = args;
      const source = position[sourceSquare];
      if (
        piece.isSparePiece ||
        targetSquare === null ||
        targetSquare === sourceSquare ||
        source?.pieceType !== piece.pieceType
      ) {
        setLastEvent('Rejected drop; controlled position was not changed.');
        return false;
      }

      const next: Record<string, Readonly<{ pieceType: string }>> = {};
      for (const [square, currentPiece] of Object.entries(position)) {
        if (square !== sourceSquare && currentPiece !== undefined) {
          next[square] = Object.freeze({ pieceType: currentPiece.pieceType });
        }
      }
      next[targetSquare] = Object.freeze({ pieceType: piece.pieceType });
      setPosition(Object.freeze(next));
      setLastEvent(
        `Accepted ${piece.pieceType}: ${sourceSquare} → ${targetSquare}.`,
      );
      return true;
    },
    [position],
  );

  const handleArrowsChange = useCallback(
    (args: {
      readonly arrows: readonly Readonly<ReactChessboardArrow>[];
    }): void => {
      const next = detachArrows(args.arrows);
      setArrows(next);
      setLastEvent(`Published ${String(next.length)} controlled arrow(s).`);
    },
    [],
  );

  const options = useMemo<Readonly<ReactChessboardOptions>>(
    () => ({
      allowDragOffBoard: false,
      allowDragging: true,
      allowDrawingArrows: true,
      animationDurationInMs: 220,
      arrows,
      boardOrientation: 'white',
      boardStyle: { borderColor: '#5b4636', borderRadius: 12, borderWidth: 2 },
      clearArrowsOnClick: true,
      clearArrowsOnPositionChange: false,
      darkSquareStyle: { backgroundColor: '#8c684d' },
      dragActivationDistance: 5,
      id: 'react-chessboard-compat-example',
      lightSquareStyle: { backgroundColor: '#ead7b7' },
      onArrowsChange: handleArrowsChange,
      onPieceDrop: handlePieceDrop,
      position,
      showAnimations: true,
      showNotation: true,
    }),
    [arrows, handleArrowsChange, handlePieceDrop, position],
  );

  return (
    <SafeAreaView edges={['bottom']} style={styles.screen}>
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.eyebrow}>REACT-CHESSBOARD 5.10 OPTION NAMES</Text>
        <Text style={styles.title}>Compatibility subpath</Text>
        <Text style={styles.description}>
          This route imports only the compatibility entry point. Position and
          arrows live in this screen; Boolean callbacks merely request the next
          controlled values.
        </Text>

        <View style={styles.board}>
          <Chessboard options={options} />
        </View>

        <View style={styles.status}>
          <Text style={styles.statusText}>
            Pieces: {Object.keys(position).length} · arrows: {arrows.length}
          </Text>
          <Text accessibilityLiveRegion="polite" style={styles.eventText}>
            {lastEvent}
          </Text>
        </View>

        <Text style={styles.instructions}>
          Drag a piece to request a controlled position update. Draw an arrow
          with the native arrow gestures; the callback proposes a new array and
          this screen publishes it back through options.arrows.
        </Text>

        <View style={styles.actions}>
          <Pressable
            accessibilityRole="button"
            onPress={() => {
              setPosition(INITIAL_POSITION);
              setLastEvent('Reset the app-owned position.');
            }}
            style={styles.button}
          >
            <Text style={styles.buttonText}>Reset position</Text>
          </Pressable>
          <Pressable
            accessibilityRole="button"
            onPress={() => {
              setArrows(ALTERNATE_ARROWS);
              setLastEvent('Replaced the app-owned arrow array.');
            }}
            style={styles.button}
          >
            <Text style={styles.buttonText}>Replace arrows</Text>
          </Pressable>
          <Pressable
            accessibilityRole="button"
            onPress={() => {
              setArrows(Object.freeze([]));
              setLastEvent('Cleared the app-owned arrow array.');
            }}
            style={styles.button}
          >
            <Text style={styles.buttonText}>Clear arrows</Text>
          </Pressable>
        </View>

        <Text style={styles.caveat}>
          The adapter keeps familiar option names, not browser behavior: styles
          and renderers are React Native values, mouse hover/right-click and
          ancestor auto-scroll are unavailable, and no callback commits board
          state inside the component.
        </Text>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  actions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    marginTop: 18,
    width: '100%',
  },
  board: {
    marginTop: 24,
    maxWidth: 520,
    width: '100%',
  },
  button: {
    backgroundColor: '#236a5b',
    borderRadius: 9,
    paddingHorizontal: 14,
    paddingVertical: 11,
  },
  buttonText: {
    color: '#ffffff',
    fontSize: 14,
    fontWeight: '700',
  },
  caveat: {
    color: '#6b6257',
    fontSize: 13,
    lineHeight: 20,
    marginTop: 24,
  },
  content: {
    alignItems: 'center',
    paddingHorizontal: 24,
    paddingVertical: 32,
  },
  description: {
    color: '#5d574f',
    fontSize: 16,
    lineHeight: 24,
    marginTop: 10,
    maxWidth: 520,
    width: '100%',
  },
  eventText: {
    color: '#6b6257',
    fontSize: 13,
    marginTop: 4,
  },
  eyebrow: {
    color: '#665c4d',
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 1.1,
    maxWidth: 520,
    width: '100%',
  },
  instructions: {
    color: '#4f473e',
    fontSize: 14,
    lineHeight: 21,
    marginTop: 18,
    maxWidth: 520,
    width: '100%',
  },
  screen: {
    backgroundColor: '#f7f4ee',
    flex: 1,
  },
  status: {
    backgroundColor: '#eee7dc',
    borderRadius: 10,
    marginTop: 18,
    maxWidth: 520,
    padding: 14,
    width: '100%',
  },
  statusText: {
    color: '#282520',
    fontSize: 14,
    fontWeight: '700',
  },
  title: {
    color: '#1e1b17',
    fontSize: 30,
    fontWeight: '700',
    letterSpacing: -0.7,
    marginTop: 6,
    maxWidth: 520,
    width: '100%',
  },
});
