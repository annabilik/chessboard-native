import {
  Chessboard,
  type ReactChessboardArrow,
  type ReactChessboardOptions,
  type ReactChessboardPieceDropHandlerArgs,
  type ReactChessboardPieceHandlerArgs,
  type ReactChessboardSquareHandlerArgs,
} from '@vibechess/chessboard-native/react-chessboard-compat';
import { Chess } from 'chess.js';
import { useCallback, useMemo, useRef, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

type CompatibilityPosition = Readonly<
  Partial<Record<string, Readonly<{ pieceType: string }>>>
>;

interface CallbackEvent {
  readonly id: number;
  readonly message: string;
}

const INITIAL_FEN = '3qk2r/8/8/3p4/3N4/8/8/R2QK3 w - - 0 1';

function compatibilityPositionFromChess(
  chess: Readonly<Chess>,
): CompatibilityPosition {
  const position: Record<string, Readonly<{ pieceType: string }>> = {};
  for (const row of chess.board()) {
    for (const piece of row) {
      if (piece !== null) {
        position[piece.square] = Object.freeze({
          pieceType: `${piece.color}${piece.type.toUpperCase()}`,
        });
      }
    }
  }
  return Object.freeze(position);
}

const INITIAL_ARROWS = Object.freeze([
  Object.freeze({
    color: '#d97706',
    endSquare: 'f5',
    startSquare: 'd4',
  }),
]) satisfies readonly Readonly<ReactChessboardArrow>[];

function legalCandidateArrows(
  chess: Readonly<Chess>,
): readonly Readonly<ReactChessboardArrow>[] {
  return Object.freeze(
    chess
      .moves({ verbose: true })
      .slice(0, 2)
      .map((move, index) =>
        Object.freeze({
          color: index === 0 ? '#2563eb' : '#b91c1c',
          endSquare: move.to,
          startSquare: move.from,
        }),
      ),
  );
}

function detachArrows(
  arrows: readonly Readonly<ReactChessboardArrow>[],
): readonly Readonly<ReactChessboardArrow>[] {
  return Object.freeze(
    arrows.map(({ color, endSquare, startSquare }) =>
      Object.freeze({ color, endSquare, startSquare }),
    ),
  );
}

function describePieceCallback(
  name: 'canDragPiece' | 'onPieceClick' | 'onPieceDrag',
  args: Readonly<ReactChessboardPieceHandlerArgs>,
): string {
  return `${name}: ${args.piece.pieceType} at ${args.square ?? 'null'}; spare=${String(args.isSparePiece)}.`;
}

function describeSquareCallback(
  name: 'onSquareClick' | 'onSquareMouseDown' | 'onSquareMouseUp',
  args: Readonly<ReactChessboardSquareHandlerArgs>,
): string {
  return `${name}: ${args.square}; piece=${args.piece?.pieceType ?? 'null'}.`;
}

export default function ReactChessboardCompatibilityScreen() {
  const [chess] = useState(() => new Chess(INITIAL_FEN));
  const [position, setPosition] = useState<CompatibilityPosition>(() =>
    compatibilityPositionFromChess(chess),
  );
  const [arrows, setArrows] =
    useState<readonly Readonly<ReactChessboardArrow>[]>(INITIAL_ARROWS);
  const [eventLog, setEventLog] = useState<readonly CallbackEvent[]>([]);
  const nextEventId = useRef(1);
  const recordEvent = useCallback((message: string): void => {
    const event = Object.freeze({ id: nextEventId.current, message });
    nextEventId.current += 1;
    setEventLog((current) => [event, ...current].slice(0, 8));
  }, []);

  const handlePieceDrop = useCallback(
    (args: Readonly<ReactChessboardPieceDropHandlerArgs>): boolean => {
      const { piece, sourceSquare, targetSquare } = args;
      if (
        piece.isSparePiece ||
        targetSquare === null ||
        targetSquare === sourceSquare ||
        position[sourceSquare]?.pieceType !== piece.pieceType
      ) {
        recordEvent('Rejected drop; controlled position was not changed.');
        return false;
      }

      try {
        const move = chess.move({
          from: sourceSquare,
          promotion: 'q',
          to: targetSquare,
        });
        setPosition(compatibilityPositionFromChess(chess));
        setArrows(Object.freeze([]));
        recordEvent(`Accepted ${move.san}; chess.js published the position.`);
        return true;
      } catch {
        recordEvent(
          `Rejected illegal ${piece.pieceType} drop: ${sourceSquare} → ${targetSquare}.`,
        );
        return false;
      }
    },
    [chess, position, recordEvent],
  );

  const handleArrowsChange = useCallback(
    (args: {
      readonly arrows: readonly Readonly<ReactChessboardArrow>[];
    }): void => {
      const next = detachArrows(args.arrows);
      setArrows(next);
      recordEvent(`Published ${String(next.length)} controlled arrow(s).`);
    },
    [recordEvent],
  );
  const handleCanDragPiece = useCallback(
    (args: Readonly<ReactChessboardPieceHandlerArgs>): boolean =>
      args.square !== null && args.piece.pieceType.startsWith(chess.turn()),
    [chess],
  );
  const handlePieceClick = useCallback(
    (args: Readonly<ReactChessboardPieceHandlerArgs>): void => {
      recordEvent(describePieceCallback('onPieceClick', args));
    },
    [recordEvent],
  );
  const handlePieceDrag = useCallback(
    (args: Readonly<ReactChessboardPieceHandlerArgs>): void => {
      recordEvent(describePieceCallback('onPieceDrag', args));
    },
    [recordEvent],
  );
  const handleSquareClick = useCallback(
    (args: Readonly<ReactChessboardSquareHandlerArgs>): void => {
      recordEvent(describeSquareCallback('onSquareClick', args));
    },
    [recordEvent],
  );
  const handleSquareMouseDown = useCallback(
    (args: Readonly<ReactChessboardSquareHandlerArgs>): void => {
      recordEvent(describeSquareCallback('onSquareMouseDown', args));
    },
    [recordEvent],
  );
  const handleSquareMouseUp = useCallback(
    (args: Readonly<ReactChessboardSquareHandlerArgs>): void => {
      recordEvent(describeSquareCallback('onSquareMouseUp', args));
    },
    [recordEvent],
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
      canDragPiece: handleCanDragPiece,
      clearArrowsOnClick: true,
      clearArrowsOnPositionChange: false,
      darkSquareStyle: { backgroundColor: '#8c684d' },
      dragActivationDistance: 5,
      id: 'react-chessboard-compat-example',
      lightSquareStyle: { backgroundColor: '#ead7b7' },
      onArrowsChange: handleArrowsChange,
      onPieceClick: handlePieceClick,
      onPieceDrag: handlePieceDrag,
      onPieceDrop: handlePieceDrop,
      onSquareClick: handleSquareClick,
      onSquareMouseDown: handleSquareMouseDown,
      onSquareMouseUp: handleSquareMouseUp,
      position,
      showAnimations: true,
      showNotation: true,
    }),
    [
      arrows,
      handleArrowsChange,
      handleCanDragPiece,
      handlePieceClick,
      handlePieceDrag,
      handlePieceDrop,
      handleSquareClick,
      handleSquareMouseDown,
      handleSquareMouseUp,
      position,
    ],
  );

  return (
    <SafeAreaView edges={['bottom']} style={styles.screen}>
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.eyebrow}>REACT-CHESSBOARD 5.10 OPTION NAMES</Text>
        <Text style={styles.title}>Compatibility subpath</Text>
        <Text style={styles.description}>
          This route imports only the compatibility entry point. Position and
          arrows live in this screen; chess.js validates drops before this
          consumer publishes the next controlled value.
        </Text>

        <View style={styles.board}>
          <Chessboard options={options} />
        </View>

        <View style={styles.status}>
          <Text style={styles.statusText}>
            Turn: {chess.turn() === 'w' ? 'White' : 'Black'} · pieces:{' '}
            {Object.keys(position).length} · arrows: {arrows.length} · callback
            log (newest first)
          </Text>
          <View accessibilityLiveRegion="polite">
            {eventLog.length === 0 ? (
              <Text style={styles.eventText}>
                No compatibility callback yet.
              </Text>
            ) : (
              eventLog.map((event) => (
                <Text key={event.id} style={styles.eventText}>
                  {event.message}
                </Text>
              ))
            )}
          </View>
        </View>

        <Text style={styles.instructions}>
          Drag a piece to request a controlled position update. Draw an arrow
          with the native arrow gestures; the callback proposes a new array and
          this screen publishes it back through options.arrows. Press or drag
          pieces and press occupied or empty squares to inspect the native
          compatibility callback payloads in the event card. Programmatic arrows
          show legal candidate moves for the current side; user-drawn arrows
          remain free-form analysis marks.
        </Text>

        <View style={styles.actions}>
          <Pressable
            accessibilityRole="button"
            onPress={() => {
              chess.load(INITIAL_FEN);
              setPosition(compatibilityPositionFromChess(chess));
              setArrows(INITIAL_ARROWS);
              recordEvent('Reset the app-owned position.');
            }}
            style={styles.button}
          >
            <Text style={styles.buttonText}>Reset position</Text>
          </Pressable>
          <Pressable
            accessibilityRole="button"
            onPress={() => {
              const candidates = legalCandidateArrows(chess);
              setArrows(candidates);
              recordEvent(
                `Published ${String(candidates.length)} current legal candidate arrow(s).`,
              );
            }}
            style={styles.button}
          >
            <Text style={styles.buttonText}>Show legal candidate arrows</Text>
          </Pressable>
          <Pressable
            accessibilityRole="button"
            onPress={() => {
              setArrows(Object.freeze([]));
              recordEvent('Cleared the app-owned arrow array.');
            }}
            style={styles.button}
          >
            <Text style={styles.buttonText}>Clear arrows</Text>
          </Pressable>
          <Pressable
            accessibilityRole="button"
            onPress={() => {
              setEventLog([]);
            }}
            style={styles.button}
          >
            <Text style={styles.buttonText}>Clear callback log</Text>
          </Pressable>
        </View>

        <Text style={styles.caveat}>
          The adapter keeps familiar option names, not browser behavior: styles
          and renderers are React Native values, mouse hover/right-click and
          ancestor auto-scroll are unavailable, and no callback commits board
          state inside the component. chess.js is example-app code, not part of
          the published board package.
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
