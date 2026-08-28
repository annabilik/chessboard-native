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

// Hermes exposes this monotonic clock, but React Native's no-DOM type surface
// intentionally does not declare the browser `performance` global.
declare const performance: Readonly<{ now: () => number }>;

const BOARD_LABEL =
  'Plain FEN transition interrupt test board, white orientation';
const E2_FEN = '8/8/8/8/8/8/4P3/8 w - - 0 1';
const E4_FEN = '8/8/8/8/4P3/8/8/8 w - - 0 1';
const BOARD_SELECTION = Object.freeze({ selectedSquare: 'e4' as const });
const INJECTED_GAP_MINIMUM_MS = 100;
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

interface PlainFenTransitionInterruptFixtureProps {
  readonly boardId: string;
  readonly cadenceMs: number;
  readonly postSequenceSettleMs: number;
  readonly rapidChangeCount: number;
  readonly transitionDurationMs: number;
}

/**
 * App-parity fixture for interrupting controlled transitions with actual
 * plain FEN strings. FEN normalization deliberately supplies no revision
 * envelope, committed intent, or stable piece ID.
 */
function ConfiguredPlainFenTransitionInterruptFixture({
  boardId,
  cadenceMs,
  postSequenceSettleMs,
  rapidChangeCount,
  transitionDurationMs,
}: PlainFenTransitionInterruptFixtureProps) {
  const [changeCount, setChangeCount] = useState(0);
  const [currentFen, setCurrentFen] = useState(E2_FEN);
  const [injectedGapTelemetry, setInjectedGapTelemetry] =
    useState('0|none|none|0|0|0');
  const [pieceSquare, setPieceSquare] = useState<SquareId>('e2');
  const [sequencePhase, setSequencePhase] = useState<
    'idle' | 'rapid-complete' | 'reused' | 'running'
  >('idle');
  const changeCountRef = useRef(0);
  const injectedGapAtOrAboveTransitionCountRef = useRef(0);
  const injectedGapBelowMinimumCountRef = useRef(0);
  const injectedGapCountRef = useRef(0);
  const injectedGapInvalidCountRef = useRef(0);
  const injectedGapMaximumMsRef = useRef<number | null>(null);
  const injectedGapMinimumMsRef = useRef<number | null>(null);
  const lastInjectedPressAtMsRef = useRef<number | null>(null);
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
      if (nextCount < rapidChangeCount) {
        return;
      }

      if (intervalRef.current !== null) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
      setSequencePhase('rapid-complete');
    }, cadenceMs);
  }, [cadenceMs, publishNextFen, rapidChangeCount, sequencePhase]);

  const publishInjectedTransition = useCallback(() => {
    if (
      (sequencePhase !== 'idle' && sequencePhase !== 'running') ||
      changeCountRef.current >= rapidChangeCount
    ) {
      return;
    }

    const pressedAtMs = performance.now();
    const previousPressAtMs = lastInjectedPressAtMsRef.current;
    lastInjectedPressAtMsRef.current = pressedAtMs;
    if (previousPressAtMs !== null) {
      const gapMs = pressedAtMs - previousPressAtMs;
      injectedGapCountRef.current += 1;
      if (!Number.isFinite(gapMs) || gapMs <= 0) {
        injectedGapInvalidCountRef.current += 1;
      } else {
        injectedGapMinimumMsRef.current =
          injectedGapMinimumMsRef.current === null
            ? gapMs
            : Math.min(injectedGapMinimumMsRef.current, gapMs);
        injectedGapMaximumMsRef.current =
          injectedGapMaximumMsRef.current === null
            ? gapMs
            : Math.max(injectedGapMaximumMsRef.current, gapMs);
        if (gapMs < INJECTED_GAP_MINIMUM_MS) {
          injectedGapBelowMinimumCountRef.current += 1;
        }
        if (gapMs >= transitionDurationMs) {
          injectedGapAtOrAboveTransitionCountRef.current += 1;
        }
      }
    }

    setSequencePhase('running');
    const nextCount = publishNextFen();
    if (nextCount === rapidChangeCount) {
      setInjectedGapTelemetry(
        `${String(injectedGapCountRef.current)}|${
          injectedGapMinimumMsRef.current === null
            ? 'none'
            : injectedGapMinimumMsRef.current.toFixed(3)
        }|${
          injectedGapMaximumMsRef.current === null
            ? 'none'
            : injectedGapMaximumMsRef.current.toFixed(3)
        }|${String(injectedGapBelowMinimumCountRef.current)}|${String(
          injectedGapAtOrAboveTransitionCountRef.current,
        )}|${String(injectedGapInvalidCountRef.current)}`,
      );
      setSequencePhase('rapid-complete');
    }
  }, [publishNextFen, rapidChangeCount, sequencePhase, transitionDurationMs]);

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
          value={String(transitionDurationMs)}
        />
        <AuditStatus
          label="Rapid cadence ms"
          testID="plain-fen-transition:cadence"
          value={String(cadenceMs)}
        />
        <AuditStatus
          label="Post-sequence settle ms"
          testID="plain-fen-transition:post-sequence-settle"
          value={String(postSequenceSettleMs)}
        />
        <AuditStatus
          label="Position change count"
          testID="plain-fen-transition:change-count"
          value={String(changeCount)}
        />
        <AuditStatus
          label="Injected gap telemetry"
          testID="plain-fen-transition:injected-gap-telemetry"
          value={injectedGapTelemetry}
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
          <Text style={styles.triggerLabel}>
            Run {rapidChangeCount} changes at {cadenceMs} ms
          </Text>
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
        <Pressable
          accessibilityLabel="Apply one injected plain FEN transition"
          accessibilityRole="button"
          disabled={
            (sequencePhase !== 'idle' && sequencePhase !== 'running') ||
            changeCount >= rapidChangeCount
          }
          onPress={publishInjectedTransition}
          style={({ pressed }) => [
            styles.trigger,
            pressed ? styles.triggerPressed : null,
          ]}
          testID="plain-fen-transition:injected-trigger"
        >
          <Text style={styles.triggerLabel}>Apply one injected transition</Text>
        </Pressable>
      </View>
      <View style={styles.boardFrame}>
        <View style={styles.board} testID="plain-fen-transition:board-host">
          <Chessboard
            accessibility={{ boardLabel: BOARD_LABEL }}
            boardId={boardId}
            interactionPermissions={INTERACTION_PERMISSIONS}
            onMoveRequest={rejectUnexpectedMove}
            pieceRenderers={PIECE_RENDERERS}
            position={currentFen}
            reduceMotion="never"
            selection={BOARD_SELECTION}
            showNotation
            transitionDurationMs={transitionDurationMs}
          />
        </View>
      </View>
    </View>
  );
}

/** Preserve the source-qualified 300/190 ms retirement acceptance profile. */
export function PlainFenTransitionInterruptFixture() {
  return (
    <ConfiguredPlainFenTransitionInterruptFixture
      boardId="native-plain-fen-transition-interrupt"
      cadenceMs={190}
      postSequenceSettleMs={600}
      rapidChangeCount={18}
      transitionDurationMs={300}
    />
  );
}

/** Four app-parity interruption cycles at the 200/125 ms failing cadence. */
export function PlainFenTransitionInterrupt200Fixture() {
  return (
    <ConfiguredPlainFenTransitionInterruptFixture
      boardId="native-plain-fen-transition-interrupt-200ms"
      cadenceMs={125}
      postSequenceSettleMs={3_500}
      rapidChangeCount={72}
      transitionDurationMs={200}
    />
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
    alignSelf: 'stretch',
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    justifyContent: 'center',
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
