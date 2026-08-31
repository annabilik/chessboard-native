import {
  Chessboard,
  ChessboardProvider,
  type ChessboardStyles,
  type ControlledPosition,
  type MoveIntent,
  type OnMoveRequest,
  type PieceRendererProps,
  type PieceRenderers,
  type SquareId,
} from '@vibechess/chessboard-native';
import { defaultPieceRenderers } from '@vibechess/chessboard-native/pieces';
import { useCallback, useRef, useState, type ReactElement } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

const BOARD_ID = 'native-interaction-terminal-handoff';
const BOARD_LABEL = 'Terminal handoff test board, white orientation';
const COMMIT_ACTION_LABEL = 'Commit terminal handoff pending move';
const INITIAL_POSITION = Object.freeze({
  revision: 41,
  value: Object.freeze({
    d4: Object.freeze({ id: 'terminal-handoff-pawn', pieceType: 'wP' }),
  }),
}) satisfies ControlledPosition;
const BOARD_STYLES = Object.freeze({
  draggingPieceGhost: Object.freeze({ opacity: 0 }),
}) satisfies ChessboardStyles;

type Decision =
  | 'accepted-awaiting-commit'
  | 'committed'
  | 'none'
  | 'rejected'
  | 'rejected-off-board';

function actorKind(props: PieceRendererProps): string {
  if (props.state.isDragging) {
    return 'overlay';
  }
  if (props.state.isGhost && props.state.isPending) {
    return 'pending-source';
  }
  if (props.state.isGhost) {
    return 'source-ghost';
  }
  if (props.state.isPending) {
    return 'pending-target';
  }
  return props.state.isTransitioning ? 'canonical-transition' : 'canonical';
}

const DefaultWhitePawn = defaultPieceRenderers.wP;

/** Native-view probe around the real package renderer used by instrumentation. */
function TerminalHandoffPawn(props: PieceRendererProps): ReactElement | null {
  if (DefaultWhitePawn === undefined) {
    return null;
  }
  return (
    <View
      accessible={false}
      collapsable={false}
      pointerEvents="none"
      style={{ height: props.size, width: props.size }}
      testID={`terminal-handoff:actor:${actorKind(props)}:${props.square ?? 'none'}`}
    >
      <DefaultWhitePawn {...props} />
    </View>
  );
}

const PIECE_RENDERERS = Object.freeze({
  ...defaultPieceRenderers,
  wP: TerminalHandoffPawn,
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

/**
 * Release-only fixture for the UI-thread terminal-drag presentation barrier.
 *
 * Accepted callbacks deliberately leave the consumer-owned position unchanged
 * until the native commit control is pressed. That gives instrumentation a
 * deterministic pending target before the correlated 200 ms controlled
 * transition. The callback sequence also covers rejection, null-target
 * off-board release, cancellation (which emits no callback), and final reuse.
 */
export function TerminalDragHandoffFixture() {
  const [abortCount, setAbortCount] = useState(0);
  const [callbackCount, setCallbackCount] = useState(0);
  const callbackCountRef = useRef(0);
  const [commitCount, setCommitCount] = useState(0);
  const [decision, setDecision] = useState<Decision>('none');
  const [dragStartCount, setDragStartCount] = useState(0);
  const [lastAcceptedIntentId, setLastAcceptedIntentId] = useState<
    string | null
  >(null);
  const [lastSource, setLastSource] = useState('none');
  const [lastTarget, setLastTarget] = useState<SquareId | null>(null);
  const [pendingIntent, setPendingIntent] = useState<MoveIntent | null>(null);
  const pendingIntentRef = useRef<MoveIntent | null>(null);
  const [pieceSquare, setPieceSquare] = useState<SquareId>('d4');
  const pieceSquareRef = useRef<SquareId>('d4');
  const [position, setPosition] =
    useState<ControlledPosition>(INITIAL_POSITION);
  const positionRef = useRef<ControlledPosition>(INITIAL_POSITION);

  const handleMoveRequest = useCallback<OnMoveRequest>((intent, context) => {
    const nextCallbackCount = callbackCountRef.current + 1;
    callbackCountRef.current = nextCallbackCount;
    setCallbackCount(nextCallbackCount);
    setLastSource(
      intent.source.kind === 'board'
        ? `board:${intent.source.square}`
        : `spare:${intent.source.spareId}`,
    );
    setLastTarget(intent.targetSquare);

    if (context.signal.aborted) {
      setAbortCount((count) => count + 1);
      setDecision('rejected');
      return { reason: 'Request arrived already aborted.', status: 'rejected' };
    }

    const acceptsThisAttempt =
      (nextCallbackCount === 1 || nextCallbackCount === 4) &&
      intent.source.kind === 'board' &&
      intent.source.square === pieceSquareRef.current &&
      intent.targetSquare !== null &&
      intent.basePositionRevision === positionRef.current.revision;
    if (acceptsThisAttempt) {
      pendingIntentRef.current = intent;
      setPendingIntent(intent);
      setLastAcceptedIntentId(intent.intentId);
      setDecision('accepted-awaiting-commit');
      return { status: 'accepted' };
    }

    pendingIntentRef.current = null;
    setPendingIntent(null);
    if (nextCallbackCount === 3 && intent.targetSquare === null) {
      setDecision('rejected-off-board');
      return {
        reason: 'The terminal-handoff fixture rejects its off-board attempt.',
        status: 'rejected',
      };
    }

    setDecision('rejected');
    return {
      reason: 'The terminal-handoff fixture rejects this attempt.',
      status: 'rejected',
    };
  }, []);

  const commitPendingMove = useCallback(() => {
    const intent = pendingIntentRef.current;
    const current = positionRef.current;
    if (
      intent?.source.kind !== 'board' ||
      intent.source.square !== pieceSquareRef.current ||
      intent.targetSquare === null ||
      intent.basePositionRevision !== current.revision
    ) {
      return;
    }

    const nextPosition = Object.freeze({
      committedIntentId: intent.intentId,
      revision: current.revision + 1,
      value: Object.freeze({
        [intent.targetSquare]: Object.freeze({ ...intent.piece }),
      }),
    }) satisfies ControlledPosition;
    positionRef.current = nextPosition;
    pieceSquareRef.current = intent.targetSquare;
    pendingIntentRef.current = null;
    setPosition(nextPosition);
    setPieceSquare(intent.targetSquare);
    setPendingIntent(null);
    setCommitCount((count) => count + 1);
    setDecision('committed');
  }, []);
  const commitCorrelation =
    lastAcceptedIntentId === null
      ? 'none'
      : pendingIntent?.intentId === lastAcceptedIntentId
        ? 'pending'
        : position.committedIntentId === lastAcceptedIntentId
          ? 'matched'
          : 'mismatched';

  return (
    <View style={styles.content}>
      <View style={styles.status}>
        <Text style={styles.title}>Terminal drag handoff fixture</Text>
        <AuditStatus
          label="Callback count"
          testID="terminal-handoff:callback-count"
          value={String(callbackCount)}
        />
        <AuditStatus
          label="Commit count"
          testID="terminal-handoff:commit-count"
          value={String(commitCount)}
        />
        <AuditStatus
          label="Commit correlation"
          testID="terminal-handoff:commit-correlation"
          value={commitCorrelation}
        />
        <AuditStatus
          label="Abort count"
          testID="terminal-handoff:abort-count"
          value={String(abortCount)}
        />
        <AuditStatus
          label="Drag start count"
          testID="terminal-handoff:drag-start-count"
          value={String(dragStartCount)}
        />
        <AuditStatus
          label="Position revision"
          testID="terminal-handoff:position-revision"
          value={String(position.revision)}
        />
        <AuditStatus
          label="Piece square"
          testID="terminal-handoff:piece-square"
          value={pieceSquare}
        />
        <AuditStatus
          label="Last source"
          testID="terminal-handoff:last-source"
          value={lastSource}
        />
        <AuditStatus
          label="Last target"
          testID="terminal-handoff:last-target"
          value={lastTarget ?? 'none'}
        />
        <AuditStatus
          label="Pending target"
          testID="terminal-handoff:pending-target"
          value={pendingIntent?.targetSquare ?? 'none'}
        />
        <AuditStatus
          label="Decision"
          testID="terminal-handoff:decision"
          value={decision}
        />
      </View>
      <View style={styles.boardArea}>
        <ChessboardProvider>
          <View style={styles.board} testID="terminal-handoff:board-host">
            <Chessboard
              accessibility={{ boardLabel: BOARD_LABEL }}
              boardId={BOARD_ID}
              gesture={{ activationDistance: 4, allowDragOffBoard: true }}
              interactionPermissions={{ accessibility: true, drag: true }}
              moveRequestTimeouts={{ commitMs: 60_000, decisionMs: 60_000 }}
              onMoveRequest={handleMoveRequest}
              onPieceDragStart={() => {
                setDragStartCount((count) => count + 1);
              }}
              pieceRenderers={PIECE_RENDERERS}
              position={position}
              reduceMotion="never"
              styles={BOARD_STYLES}
              transitionDurationMs={200}
            />
          </View>
        </ChessboardProvider>
        <Pressable
          accessibilityLabel={COMMIT_ACTION_LABEL}
          accessibilityRole="button"
          disabled={pendingIntent === null}
          onPress={commitPendingMove}
          style={({ pressed }) => [
            styles.commit,
            pendingIntent === null ? styles.commitDisabled : null,
            pressed ? styles.commitPressed : null,
          ]}
          testID="terminal-handoff:commit"
        >
          <Text style={styles.commitText}>Commit pending move</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  board: {
    maxWidth: 420,
    width: '100%',
  },
  boardArea: {
    alignItems: 'center',
    flex: 1,
    justifyContent: 'center',
    paddingHorizontal: 24,
  },
  commit: {
    backgroundColor: '#5e432d',
    borderRadius: 8,
    marginTop: 12,
    paddingHorizontal: 18,
    paddingVertical: 10,
  },
  commitDisabled: {
    opacity: 0.35,
  },
  commitPressed: {
    opacity: 0.75,
  },
  commitText: {
    color: '#ffffff',
    fontWeight: '700',
  },
  content: {
    flex: 1,
  },
  status: {
    borderBottomColor: '#d7d0c5',
    borderBottomWidth: StyleSheet.hairlineWidth,
    gap: 1,
    paddingBottom: 8,
    paddingHorizontal: 24,
    paddingTop: 12,
  },
  title: {
    color: '#282520',
    fontSize: 20,
    fontWeight: '700',
  },
});
