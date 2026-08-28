import {
  Chessboard,
  type OnMoveRequest,
  type PieceRendererProps,
  type PieceRenderers,
  type SquareId,
} from '@vibechess/chessboard-native';
import { defaultPieceRenderers } from '@vibechess/chessboard-native/pieces';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

const BOARD_LABEL =
  'Plain FEN transition interrupt test board, white orientation';
const BOARD_ID = 'native-plain-fen-transition-interrupt';
const CADENCE_MS = 190;
const RAPID_CHANGE_COUNT = 18;
const TRANSITION_DURATION_MS = 300;
const E2_FEN = '8/8/8/8/8/8/4P3/8 w - - 0 1';
const E4_FEN = '8/8/8/8/4P3/8/8/8 w - - 0 1';
const BOARD_SELECTION = Object.freeze({ selectedSquare: 'e4' as const });
const INTERACTION_PERMISSIONS = Object.freeze({
  accessibility: true,
  drag: true,
});
const rejectUnexpectedMove: OnMoveRequest = () => ({
  reason:
    'Plain FEN transition fixture changes position only through its controls.',
  status: 'rejected',
});

const DefaultWhitePawn = defaultPieceRenderers.wP;

function AuditWhitePawn(props: PieceRendererProps) {
  if (DefaultWhitePawn === undefined) {
    return null;
  }
  const transitionState = props.state.isTransitioning
    ? 'transitioning'
    : 'settled';

  return (
    <View
      accessible={false}
      collapsable={false}
      pointerEvents="none"
      style={{ height: props.size, width: props.size }}
      testID={`plain-fen-transition:piece:${props.square ?? 'none'}:${transitionState}`}
    >
      <DefaultWhitePawn {...props} />
    </View>
  );
}

const PIECE_RENDERERS = Object.freeze({
  ...defaultPieceRenderers,
  wP: AuditWhitePawn,
}) satisfies PieceRenderers;

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

function squareForChangeCount(changeCount: number): SquareId {
  return changeCount % 2 === 0 ? 'e2' : 'e4';
}

/**
 * App-parity fixture for interrupting 300 ms controlled transitions with
 * actual plain FEN strings every 190 ms. FEN normalization deliberately
 * supplies no revision envelope, committed intent, or stable piece ID.
 */
export function PlainFenTransitionInterruptFixture() {
  const [changeCount, setChangeCount] = useState(0);
  const [currentFen, setCurrentFen] = useState(E2_FEN);
  const [pieceSquare, setPieceSquare] = useState<SquareId>('e2');
  const [sequencePhase, setSequencePhase] = useState<
    'idle' | 'rapid-complete' | 'reused' | 'running'
  >('idle');
  const changeCountRef = useRef(0);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(
    () => () => {
      if (intervalRef.current !== null) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    },
    [],
  );

  const publishNextFen = useCallback(() => {
    const nextCount = changeCountRef.current + 1;
    const nextSquare = squareForChangeCount(nextCount);
    const nextFen = nextSquare === 'e2' ? E2_FEN : E4_FEN;

    changeCountRef.current = nextCount;
    setChangeCount(nextCount);
    setCurrentFen(nextFen);
    setPieceSquare(nextSquare);
    return nextCount;
  }, []);

  const startRapidSequence = useCallback(() => {
    if (sequencePhase !== 'idle' || intervalRef.current !== null) {
      return;
    }

    setSequencePhase('running');
    publishNextFen();
    intervalRef.current = setInterval(() => {
      const nextCount = publishNextFen();
      if (nextCount < RAPID_CHANGE_COUNT) {
        return;
      }

      if (intervalRef.current !== null) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
      setSequencePhase('rapid-complete');
    }, CADENCE_MS);
  }, [publishNextFen, sequencePhase]);

  const proveReuse = useCallback(() => {
    if (sequencePhase !== 'rapid-complete') {
      return;
    }
    publishNextFen();
    setSequencePhase('reused');
  }, [publishNextFen, sequencePhase]);

  return (
    <View style={styles.content}>
      <View style={styles.status}>
        <Text style={styles.title}>Plain FEN transition interrupt fixture</Text>
        <AuditStatus
          label="Position input tier"
          testID="plain-fen-transition:input-tier"
          value="plain-fen"
        />
        <AuditStatus
          label="Piece identities"
          testID="plain-fen-transition:piece-identities"
          value="absent"
        />
        <AuditStatus
          label="Transition duration ms"
          testID="plain-fen-transition:transition-duration"
          value={String(TRANSITION_DURATION_MS)}
        />
        <AuditStatus
          label="Rapid cadence ms"
          testID="plain-fen-transition:cadence"
          value={String(CADENCE_MS)}
        />
        <AuditStatus
          label="Position change count"
          testID="plain-fen-transition:change-count"
          value={String(changeCount)}
        />
        <AuditStatus
          label="Sequence phase"
          testID="plain-fen-transition:sequence-phase"
          value={sequencePhase}
        />
        <AuditStatus
          label="Piece square"
          testID="plain-fen-transition:piece-square"
          value={pieceSquare}
        />
        <AuditStatus
          label="Piece count"
          testID="plain-fen-transition:piece-count"
          value="1"
        />
        <AuditStatus
          label="Current FEN"
          testID="plain-fen-transition:current-fen"
          value={currentFen}
        />
      </View>
      <View style={styles.controls}>
        <Pressable
          accessibilityLabel="Start rapid plain FEN transition interruptions"
          accessibilityRole="button"
          disabled={sequencePhase !== 'idle'}
          onPress={startRapidSequence}
          style={({ pressed }) => [
            styles.trigger,
            pressed ? styles.triggerPressed : null,
          ]}
          testID="plain-fen-transition:rapid-trigger"
        >
          <Text style={styles.triggerLabel}>Run 18 changes at 190 ms</Text>
        </Pressable>
        <Pressable
          accessibilityLabel="Apply reusable plain FEN transition"
          accessibilityRole="button"
          disabled={sequencePhase !== 'rapid-complete'}
          onPress={proveReuse}
          style={({ pressed }) => [
            styles.trigger,
            pressed ? styles.triggerPressed : null,
          ]}
          testID="plain-fen-transition:reuse-trigger"
        >
          <Text style={styles.triggerLabel}>Prove one more transition</Text>
        </Pressable>
      </View>
      <View style={styles.boardFrame}>
        <View style={styles.board} testID="plain-fen-transition:board-host">
          <Chessboard
            accessibility={{ boardLabel: BOARD_LABEL }}
            boardId={BOARD_ID}
            interactionPermissions={INTERACTION_PERMISSIONS}
            onMoveRequest={rejectUnexpectedMove}
            pieceRenderers={PIECE_RENDERERS}
            position={currentFen}
            reduceMotion="never"
            selection={BOARD_SELECTION}
            showNotation
            transitionDurationMs={TRANSITION_DURATION_MS}
          />
        </View>
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
  controls: {
    flexDirection: 'row',
    gap: 10,
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
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  triggerLabel: {
    color: '#ffffff',
    fontSize: 14,
    fontWeight: '600',
  },
  triggerPressed: {
    opacity: 0.72,
  },
});
