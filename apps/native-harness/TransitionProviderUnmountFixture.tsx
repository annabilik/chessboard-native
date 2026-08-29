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
const WHOLE_UNMOUNT_TRANSITION_DURATION_MS = 200;
const WHOLE_UNMOUNT_DELAY_MS = 50;
const WHOLE_UNMOUNT_DRAIN_MS = 3_500;

type LifecycleStep =
  | 'absent-long'
  | 'absent-long-drained'
  | 'absent-long-draining'
  | 'absent-prompt'
  | 'absent-prompt-probed'
  | 'complete'
  | 'ready-long'
  | 'ready-prompt'
  | 'remounted-long'
  | 'remounted-prompt'
  | 'settling-prompt'
  | 'starting-long'
  | 'starting-prompt';

const LIFECYCLE_ACTION_LABELS: Readonly<Record<LifecycleStep, string>> =
  Object.freeze({
    'absent-long': 'Record immediate long-cycle touch while board absent',
    'absent-long-drained': 'Record post-drain touch and remount board',
    'absent-long-draining': 'Long whole-unmount lifecycle is draining',
    'absent-prompt': 'Record prompt touch while board absent',
    'absent-prompt-probed': 'Remount board promptly',
    complete: 'Whole unmount lifecycle complete',
    'ready-long': 'Start long whole-unmount lifecycle',
    'ready-prompt': 'Start prompt whole-unmount lifecycle',
    'remounted-long': 'Apply long post-remount transition',
    'remounted-prompt': 'Apply prompt post-remount transition',
    'settling-prompt': 'Prompt post-remount transition is settling',
    'starting-long': 'Long whole-unmount lifecycle is starting',
    'starting-prompt': 'Prompt whole-unmount lifecycle is starting',
  });

const LIFECYCLE_ACTION_TITLES: Readonly<Record<LifecycleStep, string>> =
  Object.freeze({
    'absent-long': 'Probe long absence',
    'absent-long-drained': 'Probe and remount',
    'absent-long-draining': 'Draining native registry',
    'absent-prompt': 'Probe prompt absence',
    'absent-prompt-probed': 'Remount promptly',
    complete: 'Lifecycle complete',
    'ready-long': 'Run long lifecycle',
    'ready-prompt': 'Run prompt lifecycle',
    'remounted-long': 'Transition after remount',
    'remounted-prompt': 'Transition after remount',
    'settling-prompt': 'Settling transition',
    'starting-long': 'Starting long lifecycle',
    'starting-prompt': 'Starting prompt lifecycle',
  });

function lifecycleActionDisabled(step: LifecycleStep): boolean {
  return (
    step === 'absent-long-draining' ||
    step === 'complete' ||
    step === 'settling-prompt' ||
    step === 'starting-long' ||
    step === 'starting-prompt'
  );
}

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
    <Text
      accessibilityLabel={`${label}: ${value}`}
      style={styles.auditStatus}
      testID={testID}
    >
      {label}: {value}
    </Text>
  );
}

/**
 * Release-only lifecycle fixture for overlapping a controlled piece
 * transition, an active drag, keyed provider replacement, and complete
 * provider/board subtree removal.
 *
 * The status and trigger live outside the keyed provider so the test can prove
 * that the latest controlled position survives teardown and can begin another
 * transition/drag cycle on the replacement provider.
 */
export function TransitionProviderUnmountFixture() {
  const [abortCount, setAbortCount] = useState(0);
  const [boardMounted, setBoardMounted] = useState(true);
  const [callbackCount, setCallbackCount] = useState(0);
  const [dragStartCount, setDragStartCount] = useState(0);
  const [lifecycleProbeCount, setLifecycleProbeCount] = useState(0);
  const [lifecycleStep, setLifecycleStep] =
    useState<LifecycleStep>('ready-prompt');
  const [pieceSquare, setPieceSquare] = useState<SquareId>('d4');
  const [position, setPosition] =
    useState<ControlledPosition>(INITIAL_POSITION);
  const [providerGeneration, setProviderGeneration] = useState(0);
  const [transitionCount, setTransitionCount] = useState(0);
  const [transitionWindow, setTransitionWindow] = useState<
    | 'absent-long'
    | 'absent-long-drained'
    | 'absent-long-draining'
    | 'absent-prompt'
    | 'absent-prompt-probed'
    | 'active'
    | 'cleared'
    | 'complete'
    | 'idle'
    | 'ready-long'
    | 'remounted-long'
    | 'remounted-prompt'
  >('idle');
  const [transitionDurationMs, setTransitionDurationMs] = useState(
    TRANSITION_DURATION_MS,
  );
  const pieceSquareRef = useRef<SquareId>('d4');
  const positionRef = useRef<ControlledPosition>(INITIAL_POSITION);
  const firstReplacementFrameRef = useRef<number | null>(null);
  const secondReplacementFrameRef = useRef<number | null>(null);
  const wholeUnmountTimerRef = useRef<ReturnType<typeof setTimeout> | null>(
    null,
  );
  const wholeDrainTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lifecycleCompletionTimerRef = useRef<ReturnType<
    typeof setTimeout
  > | null>(null);

  useEffect(
    () => () => {
      if (firstReplacementFrameRef.current !== null) {
        cancelAnimationFrame(firstReplacementFrameRef.current);
      }
      if (secondReplacementFrameRef.current !== null) {
        cancelAnimationFrame(secondReplacementFrameRef.current);
      }
      if (wholeUnmountTimerRef.current !== null) {
        clearTimeout(wholeUnmountTimerRef.current);
      }
      if (wholeDrainTimerRef.current !== null) {
        clearTimeout(wholeDrainTimerRef.current);
      }
      if (lifecycleCompletionTimerRef.current !== null) {
        clearTimeout(lifecycleCompletionTimerRef.current);
      }
    },
    [],
  );

  const publishNextControlledPosition = useCallback(() => {
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
  }, []);

  const startControlledTransition = useCallback(() => {
    if (transitionWindow === 'active') {
      return;
    }
    publishNextControlledPosition();
    setTransitionWindow('active');
  }, [publishNextControlledPosition, transitionWindow]);

  const handleWholeUnmountLifecycle = useCallback(() => {
    if (lifecycleStep === 'ready-prompt' || lifecycleStep === 'ready-long') {
      const longCycle = lifecycleStep === 'ready-long';
      setLifecycleStep(longCycle ? 'starting-long' : 'starting-prompt');
      setTransitionDurationMs(WHOLE_UNMOUNT_TRANSITION_DURATION_MS);
      publishNextControlledPosition();
      setTransitionWindow('active');
      wholeUnmountTimerRef.current = setTimeout(() => {
        wholeUnmountTimerRef.current = null;
        setBoardMounted(false);
        setLifecycleStep(longCycle ? 'absent-long' : 'absent-prompt');
        setTransitionWindow(longCycle ? 'absent-long' : 'absent-prompt');
      }, WHOLE_UNMOUNT_DELAY_MS);
      return;
    }
    if (lifecycleStep === 'absent-prompt') {
      setLifecycleProbeCount((count) => count + 1);
      setLifecycleStep('absent-prompt-probed');
      setTransitionWindow('absent-prompt-probed');
      return;
    }
    if (lifecycleStep === 'absent-prompt-probed') {
      setBoardMounted(true);
      setLifecycleStep('remounted-prompt');
      setTransitionWindow('remounted-prompt');
      return;
    }
    if (lifecycleStep === 'remounted-prompt') {
      setLifecycleStep('settling-prompt');
      publishNextControlledPosition();
      setTransitionWindow('active');
      lifecycleCompletionTimerRef.current = setTimeout(() => {
        lifecycleCompletionTimerRef.current = null;
        setLifecycleStep('ready-long');
        setTransitionWindow('ready-long');
      }, WHOLE_UNMOUNT_TRANSITION_DURATION_MS + 100);
      return;
    }
    if (lifecycleStep === 'absent-long') {
      setLifecycleProbeCount((count) => count + 1);
      setLifecycleStep('absent-long-draining');
      setTransitionWindow('absent-long-draining');
      wholeDrainTimerRef.current = setTimeout(() => {
        wholeDrainTimerRef.current = null;
        setLifecycleStep('absent-long-drained');
        setTransitionWindow('absent-long-drained');
      }, WHOLE_UNMOUNT_DRAIN_MS);
      return;
    }
    if (lifecycleStep === 'absent-long-drained') {
      setLifecycleProbeCount((count) => count + 1);
      setBoardMounted(true);
      setLifecycleStep('remounted-long');
      setTransitionWindow('remounted-long');
      return;
    }
    if (lifecycleStep === 'remounted-long') {
      setLifecycleStep('complete');
      publishNextControlledPosition();
      setTransitionWindow('active');
      lifecycleCompletionTimerRef.current = setTimeout(() => {
        lifecycleCompletionTimerRef.current = null;
        setTransitionWindow('complete');
      }, WHOLE_UNMOUNT_TRANSITION_DURATION_MS + 100);
    }
  }, [lifecycleStep, publishNextControlledPosition]);

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
          label="Lifecycle probe count"
          testID="interaction-transition-provider-unmount:lifecycle-probe-count"
          value={String(lifecycleProbeCount)}
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
      <Pressable
        accessibilityLabel={LIFECYCLE_ACTION_LABELS[lifecycleStep]}
        accessibilityRole="button"
        disabled={lifecycleActionDisabled(lifecycleStep)}
        onPress={handleWholeUnmountLifecycle}
        style={({ pressed }) => [
          styles.trigger,
          pressed ? styles.triggerPressed : null,
        ]}
        testID="interaction-transition-provider-unmount:whole-unmount-action"
      >
        <Text style={styles.triggerLabel}>
          {LIFECYCLE_ACTION_TITLES[lifecycleStep]}
        </Text>
      </Pressable>
      <View style={styles.boardFrame}>
        {boardMounted ? (
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
                transitionDurationMs={transitionDurationMs}
              />
            </View>
          </ChessboardProvider>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  auditStatus: {
    fontSize: 12,
    lineHeight: 14,
  },
  board: {
    aspectRatio: 1,
    maxWidth: 360,
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
