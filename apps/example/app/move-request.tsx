import {
  Chessboard,
  type ChessboardActions,
  type ControlledPosition,
  type MoveOutcomeAccessibilityContext,
  type MoveIntent,
  type OnMoveRequest,
  type PieceData,
  type PositionObject,
  type SquareAccessibilityContext,
} from '@vibechess/chessboard-native';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

const DECISION_DELAY_MS = 450;
const DECISION_TIMEOUT_MS = 1_200;
const COMMIT_TIMEOUT_MS = 1_200;

const INITIAL_POSITION: PositionObject = Object.freeze({
  a1: Object.freeze({ id: 'white-rook', pieceType: 'wR' }),
  e2: Object.freeze({ id: 'white-pawn', pieceType: 'wP' }),
  e7: Object.freeze({ id: 'black-pawn', pieceType: 'bP' }),
  h8: Object.freeze({ id: 'black-rook', pieceType: 'bR' }),
});

type DemoPosition = Omit<ControlledPosition, 'value'> & {
  readonly value: PositionObject;
};

type DecisionMode = 'accept' | 'reject' | 'decision-timeout' | 'commit-timeout';

const DECISION_MODES = Object.freeze([
  'accept',
  'reject',
  'decision-timeout',
  'commit-timeout',
] as const satisfies readonly DecisionMode[]);

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
): Readonly<DemoPosition> {
  if (
    intent.source.kind !== 'board' ||
    intent.basePositionRevision !== current.revision ||
    !piecesMatch(current.value[intent.source.square], intent.piece)
  ) {
    return current;
  }

  const value: Record<string, Readonly<PieceData> | undefined> = {};
  for (const [square, piece] of Object.entries(current.value)) {
    if (square !== intent.source.square && piece !== undefined) {
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

function waitForDecision(signal: AbortSignal): Promise<boolean> {
  return new Promise((resolve) => {
    if (signal.aborted) {
      resolve(false);
      return;
    }

    const finish = (completed: boolean): void => {
      clearTimeout(timer);
      signal.removeEventListener('abort', handleAbort);
      resolve(completed);
    };
    const handleAbort = (): void => {
      finish(false);
    };
    const timer = setTimeout(() => {
      finish(true);
    }, DECISION_DELAY_MS);
    signal.addEventListener('abort', handleAbort, { once: true });
  });
}

function waitForAbort(signal: AbortSignal): Promise<void> {
  return new Promise((resolve) => {
    if (signal.aborted) {
      resolve();
      return;
    }
    signal.addEventListener(
      'abort',
      () => {
        resolve();
      },
      { once: true },
    );
  });
}

function nextDecisionMode(current: DecisionMode): DecisionMode {
  const index = DECISION_MODES.indexOf(current);
  return DECISION_MODES[(index + 1) % DECISION_MODES.length] ?? 'accept';
}

function formatSquareValue(context: SquareAccessibilityContext): string {
  const piece = context.piece?.pieceType ?? 'empty';
  const states = [
    context.isSelected ? 'selected' : null,
    context.isDisabled ? 'disabled' : null,
    context.isDestination ? 'destination' : null,
    context.isPendingSource ? 'pending source' : null,
    context.isPendingTarget ? 'pending target' : null,
  ].filter((state): state is string => state !== null);
  return `Demo square ${context.square}: ${piece}${states.length === 0 ? '' : `, ${states.join(', ')}`}.`;
}

function formatMoveOutcomeMessage(
  context: MoveOutcomeAccessibilityContext,
): string {
  const source =
    context.intent.source.kind === 'board'
      ? context.intent.source.square
      : context.intent.source.spareId;
  return `Demo move ${source} to ${context.intent.targetSquare ?? 'off board'} ended ${context.outcome}${context.reason === undefined ? '' : `: ${context.reason}`}.`;
}

function canDragWhitePiece({ piece }: { readonly piece: PieceData }): boolean {
  return piece.pieceType.startsWith('w');
}

export default function MoveRequestExample() {
  const [position, setPosition] = useState<DemoPosition>({
    revision: 0,
    value: INITIAL_POSITION,
  });
  const [decisionMode, setDecisionMode] = useState<DecisionMode>('accept');
  const [allowDragOffBoard, setAllowDragOffBoard] = useState(true);
  const [status, setStatus] = useState(
    'Drag a white piece, or use the board actions to choose a source and target.',
  );
  const [lastTerminalOutcome, setLastTerminalOutcome] = useState(
    'No terminal move outcome yet.',
  );
  const decisionModeRef = useRef(decisionMode);
  const actionsRef = useRef<ChessboardActions | null>(null);

  useEffect(() => {
    decisionModeRef.current = decisionMode;
  }, [decisionMode]);

  const formatMoveOutcome = useCallback(
    (context: MoveOutcomeAccessibilityContext): string => {
      const message = formatMoveOutcomeMessage(context);
      setLastTerminalOutcome(message);
      return message;
    },
    [],
  );

  const onMoveRequest = useCallback<OnMoveRequest>(async (intent, context) => {
    const mode = decisionModeRef.current;
    setStatus(
      `Request ${intent.source.kind === 'board' ? intent.source.square : intent.source.spareId} → ${intent.targetSquare ?? 'off board'} is deciding…`,
    );

    if (mode === 'decision-timeout') {
      setStatus(
        `Leaving ${intent.intentId} unresolved so the ${String(DECISION_TIMEOUT_MS)} ms decision budget can expire…`,
      );
      await waitForAbort(context.signal);
      setStatus(
        'The runtime ended the unresolved decision after its timeout or an explicit cancellation.',
      );
      return { status: 'rejected', reason: 'Decision ended after abort' };
    }

    const completed = await waitForDecision(context.signal);
    if (!completed) {
      setStatus('The request was cancelled before the decision completed.');
      return { status: 'rejected', reason: 'cancelled' };
    }
    if (mode === 'reject') {
      setStatus('The consumer rejected the request; position is unchanged.');
      return { status: 'rejected', reason: 'Example rejection' };
    }
    if (mode === 'commit-timeout') {
      setStatus(
        `Accepted ${intent.intentId} without publishing a matching controlled revision; the ${String(COMMIT_TIMEOUT_MS)} ms commit budget will expire.`,
      );
      return { status: 'accepted' };
    }

    setPosition((current) => applyIntent(current, intent));
    setStatus(
      `Accepted ${intent.intentId}; publishing a newer controlled revision with the matching intent ID.`,
    );
    return { status: 'accepted' };
  }, []);

  return (
    <ScrollView
      contentContainerStyle={styles.content}
      contentInsetAdjustmentBehavior="automatic"
      style={styles.screen}
    >
      <Text style={styles.eyebrow}>PHASE 2 · CONTROLLED MOVE REQUESTS</Text>
      <Text style={styles.title}>One source of truth</Text>
      <Text style={styles.description}>
        The callback decides only whether to wait for a controlled update. This
        route manually relocates the requested piece; it deliberately contains
        no chess rules or legality engine.
      </Text>

      <View style={styles.board}>
        <Chessboard
          actionsRef={actionsRef}
          accessibility={{
            boardHint:
              'Navigate to a piece and activate it, then navigate to a target and activate again.',
            boardLabel: 'Controlled move-request example, white orientation',
            formatMoveOutcome,
            formatSquareValue,
          }}
          boardId="controlled-move-request"
          canDragPiece={canDragWhitePiece}
          gesture={{ allowDragOffBoard }}
          interactionPermissions={{ accessibility: true, drag: true }}
          moveRequestTimeouts={{
            commitMs: COMMIT_TIMEOUT_MS,
            decisionMs: DECISION_TIMEOUT_MS,
          }}
          onMoveRequest={onMoveRequest}
          position={position}
          reduceMotion="always"
        />
      </View>

      <View style={styles.card}>
        <Text style={styles.cardTitle}>Consumer controls</Text>
        <Text style={styles.status}>
          Revision {position.revision} · next decision: {decisionMode}
          {`\n`}Overlay may leave board: {allowDragOffBoard ? 'yes' : 'no'}
          {`\n`}
          {status}
          {`\n`}Terminal: {lastTerminalOutcome}
        </Text>
        <View style={styles.controls}>
          <Pressable
            accessibilityRole="button"
            onPress={() => {
              setDecisionMode(nextDecisionMode);
            }}
            style={styles.button}
          >
            <Text style={styles.buttonText}>Cycle request outcome</Text>
          </Pressable>
          <Pressable
            accessibilityRole="button"
            onPress={() => {
              const cancelled = actionsRef.current?.cancelMove() ?? false;
              setStatus(
                cancelled
                  ? 'Cancelled the current transient move; controlled position is unchanged.'
                  : 'There was no transient move to cancel.',
              );
            }}
            style={styles.button}
          >
            <Text style={styles.buttonText}>Cancel transient move</Text>
          </Pressable>
          <Pressable
            accessibilityRole="button"
            onPress={() => {
              setAllowDragOffBoard((current) => {
                const next = !current;
                setStatus(
                  next
                    ? 'Overlay may leave the board; outside releases still have a null target.'
                    : 'Overlay center is clamped; raw outside releases still have a null target.',
                );
                return next;
              });
            }}
            style={styles.button}
          >
            <Text style={styles.buttonText}>Toggle overlay bounds</Text>
          </Pressable>
          <Pressable
            accessibilityRole="button"
            onPress={() => {
              setPosition((current) => ({
                revision: current.revision + 1,
                value: INITIAL_POSITION,
              }));
              setStatus('Consumer reset published as an unrelated revision.');
            }}
            style={styles.button}
          >
            <Text style={styles.buttonText}>Reset controlled position</Text>
          </Pressable>
        </View>
      </View>

      <Text style={styles.boundary}>
        Outcome modes cover acceptance, explicit rejection, an unresolved
        decision timeout, and acceptance without a matching controlled commit.
        The board's custom accessibility formatters prefix square values and
        terminal move announcements with “Demo”.{`\n\n`}
        Drag is permitted only for white pieces in this example. The adjustable
        control remains available for every occupied source, proving that drag
        always has a non-drag alternative. An off-board removal is the same
        request with a null target, even while the visible overlay is clamped.
        The cancel button affects transient move work only.
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
    color: '#665c4d',
    fontSize: 14,
    lineHeight: 21,
    maxWidth: 520,
    width: '100%',
  },
  button: {
    alignItems: 'center',
    backgroundColor: '#2f5f4f',
    borderRadius: 10,
    minHeight: 48,
    justifyContent: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  buttonText: {
    color: '#ffffff',
    fontSize: 15,
    fontWeight: '700',
  },
  card: {
    backgroundColor: '#ffffff',
    borderColor: '#d9d0c3',
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    gap: 12,
    maxWidth: 520,
    padding: 16,
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
  screen: {
    backgroundColor: '#f7f4ee',
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
    maxWidth: 520,
    width: '100%',
  },
});
