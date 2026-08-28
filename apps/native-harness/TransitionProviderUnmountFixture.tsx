import {
  Chessboard,
  ChessboardProvider,
  type ControlledPosition,
  type OnMoveRequest,
  type SquareId,
} from '@vibechess/chessboard-native';
import { defaultPieceRenderers } from '@vibechess/chessboard-native/pieces';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

const BOARD_LABEL = 'Transition provider unmount test board, white orientation';
const BOARD_ID = 'native-interaction-transition-provider-unmount';
const INITIAL_POSITION = Object.freeze({
  revision: 31,
  value: Object.freeze({
    d4: Object.freeze({ id: 'transition-knight', pieceType: 'wN' }),
  }),
}) satisfies ControlledPosition;
const TRANSITION_DURATION_MS = 12_000;

function AuditStatus({
  label,
  testID,
  value,
}: {
  readonly label: string;
  readonly testID: string;
  readonly value: string;
}) {
  return (
    <Text accessibilityLabel={`${label}: ${value}`} testID={testID}>
      {label}: {value}
    </Text>
  );
}

/**
 * Release-only lifecycle fixture for overlapping a controlled piece
 * transition, an active drag, and keyed provider replacement.
 *
 * The status and trigger live outside the keyed provider so the test can prove
 * that the latest controlled position survives teardown and can begin another
 * transition/drag cycle on the replacement provider.
 */
export function TransitionProviderUnmountFixture() {
  const [abortCount, setAbortCount] = useState(0);
  const [callbackCount, setCallbackCount] = useState(0);
  const [dragStartCount, setDragStartCount] = useState(0);
  const [pieceSquare, setPieceSquare] = useState<SquareId>('d4');
  const [position, setPosition] =
    useState<ControlledPosition>(INITIAL_POSITION);
  const [providerGeneration, setProviderGeneration] = useState(0);
  const [transitionCount, setTransitionCount] = useState(0);
  const [transitionWindow, setTransitionWindow] = useState<
    'active' | 'cleared' | 'idle'
  >('idle');
  const pieceSquareRef = useRef<SquareId>('d4');
  const positionRef = useRef<ControlledPosition>(INITIAL_POSITION);
  const firstReplacementFrameRef = useRef<number | null>(null);
  const secondReplacementFrameRef = useRef<number | null>(null);

  useEffect(
    () => () => {
      if (firstReplacementFrameRef.current !== null) {
        cancelAnimationFrame(firstReplacementFrameRef.current);
      }
      if (secondReplacementFrameRef.current !== null) {
        cancelAnimationFrame(secondReplacementFrameRef.current);
      }
    },
    [],
  );

  const startControlledTransition = useCallback(() => {
    if (transitionWindow === 'active') {
      return;
    }
    const nextSquare: SquareId = pieceSquareRef.current === 'd4' ? 'd5' : 'd4';
    const current = positionRef.current;
    const nextPosition = Object.freeze({
      revision: current.revision + 1,
      value: Object.freeze({
        [nextSquare]: Object.freeze({
          id: 'transition-knight',
          pieceType: 'wN',
        }),
      }),
    }) satisfies ControlledPosition;

    positionRef.current = nextPosition;
    pieceSquareRef.current = nextSquare;
    setPosition(nextPosition);
    setPieceSquare(nextSquare);
    setTransitionCount((count) => count + 1);
    setTransitionWindow('active');
  }, [transitionWindow]);

  const replaceProviderDuringHeldDrag = useCallback(() => {
    setDragStartCount((count) => count + 1);
    if (
      firstReplacementFrameRef.current !== null ||
      secondReplacementFrameRef.current !== null
    ) {
      return;
    }

    // Preserve one fully committed overlap frame before replacing the whole
    // keyed provider. The native test keeps the pointer down across both RAFs.
    firstReplacementFrameRef.current = requestAnimationFrame(() => {
      firstReplacementFrameRef.current = null;
      secondReplacementFrameRef.current = requestAnimationFrame(() => {
        secondReplacementFrameRef.current = null;
        setProviderGeneration((generation) => generation + 1);
        setTransitionWindow('cleared');
      });
    });
  }, []);

  const rejectUnexpectedMove = useCallback<OnMoveRequest>(
    (_intent, context) => {
      setCallbackCount((count) => count + 1);
      if (context.signal.aborted) {
        setAbortCount((count) => count + 1);
      }
      return {
        reason:
          'Transition/provider-unmount fixture must replace the held drag before release.',
        status: 'rejected',
      };
    },
    [],
  );

  const nextSquare = pieceSquare === 'd4' ? 'd5' : 'd4';

  return (
    <View style={styles.content}>
      <View style={styles.status}>
        <Text style={styles.title}>Transition/provider lifecycle fixture</Text>
        <AuditStatus
          label="Transition count"
          testID="interaction-transition-provider-unmount:transition-count"
          value={String(transitionCount)}
        />
        <AuditStatus
          label="Transition window"
          testID="interaction-transition-provider-unmount:transition-window"
          value={transitionWindow}
        />
        <AuditStatus
          label="Drag start count"
          testID="interaction-transition-provider-unmount:drag-start-count"
          value={String(dragStartCount)}
        />
        <AuditStatus
          label="Provider generation"
          testID="interaction-transition-provider-unmount:provider-generation"
          value={String(providerGeneration)}
        />
        <AuditStatus
          label="Callback count"
          testID="interaction-transition-provider-unmount:callback-count"
          value={String(callbackCount)}
        />
        <AuditStatus
          label="Commit count"
          testID="interaction-transition-provider-unmount:commit-count"
          value="0"
        />
        <AuditStatus
          label="Abort count"
          testID="interaction-transition-provider-unmount:abort-count"
          value={String(abortCount)}
        />
        <AuditStatus
          label="Position revision"
          testID="interaction-transition-provider-unmount:position-revision"
          value={String(position.revision)}
        />
        <AuditStatus
          label="Piece square"
          testID="interaction-transition-provider-unmount:piece-square"
          value={pieceSquare}
        />
      </View>
      <Pressable
        accessibilityLabel="Start controlled position transition"
        accessibilityRole="button"
        disabled={transitionWindow === 'active'}
        onPress={startControlledTransition}
        style={({ pressed }) => [
          styles.trigger,
          pressed ? styles.triggerPressed : null,
        ]}
        testID="interaction-transition-provider-unmount:transition-trigger"
      >
        <Text style={styles.triggerLabel}>Transition to {nextSquare}</Text>
      </Pressable>
      <View style={styles.boardFrame}>
        <ChessboardProvider key={providerGeneration}>
          <View
            style={styles.board}
            testID="interaction-transition-provider-unmount:board-host"
          >
            <Chessboard
              accessibility={{ boardLabel: BOARD_LABEL }}
              boardId={BOARD_ID}
              interactionPermissions={{ accessibility: true, drag: true }}
              onMoveRequest={rejectUnexpectedMove}
              onPieceDragStart={replaceProviderDuringHeldDrag}
              pieceRenderers={defaultPieceRenderers}
              position={position}
              reduceMotion="never"
              transitionDurationMs={TRANSITION_DURATION_MS}
            />
          </View>
        </ChessboardProvider>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  board: {
    aspectRatio: 1,
    maxWidth: 420,
    width: '100%',
  },
  boardFrame: {
    alignItems: 'center',
    alignSelf: 'stretch',
  },
  content: {
    alignItems: 'center',
    flex: 1,
    gap: 12,
    justifyContent: 'center',
    paddingHorizontal: 20,
  },
  status: {
    alignSelf: 'stretch',
    gap: 2,
    maxWidth: 480,
  },
  title: {
    fontSize: 18,
    fontWeight: '700',
    marginBottom: 4,
  },
  trigger: {
    backgroundColor: '#2f5d50',
    borderRadius: 8,
    paddingHorizontal: 18,
    paddingVertical: 10,
  },
  triggerLabel: {
    color: '#ffffff',
    fontSize: 15,
    fontWeight: '600',
  },
  triggerPressed: {
    opacity: 0.72,
  },
});
