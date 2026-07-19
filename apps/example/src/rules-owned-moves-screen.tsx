import {
  Chessboard,
  type ChessboardActions,
  type ControlledAnnotations,
  type ControlledPosition,
  type ControlledSelection,
  type MoveDecision,
  type MoveIntent,
  type OnMoveRequest,
  type OnSquareActivate,
  type PieceData,
  type PieceType,
  type PositionObject,
  type SquareId,
} from '@vibechess/chessboard-native';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  AccessibilityInfo,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';

const PROMOTION_BOARD_ID = 'rules-owned-promotion';
const PREMOVE_BOARD_ID = 'rules-owned-premove';
const PROMOTION_SOURCE = 'g7';
const PROMOTION_TARGET = 'g8';
const PREMOVE_SOURCE = 'e2';
const PREMOVE_TARGET = 'e4';

const PROMOTION_CHOICES = Object.freeze([
  Object.freeze({ label: 'Queen', pieceType: 'wQ' }),
  Object.freeze({ label: 'Rook', pieceType: 'wR' }),
  Object.freeze({ label: 'Bishop', pieceType: 'wB' }),
  Object.freeze({ label: 'Knight', pieceType: 'wN' }),
] satisfies readonly Readonly<{ label: string; pieceType: PieceType }>[]);

const PROMOTION_START: PositionObject = Object.freeze({
  a1: Object.freeze({ id: 'promotion-white-king', pieceType: 'wK' }),
  a8: Object.freeze({ id: 'promotion-black-king', pieceType: 'bK' }),
  g7: Object.freeze({ id: 'promoting-pawn', pieceType: 'wP' }),
});

const PREMOVE_START: PositionObject = Object.freeze({
  a1: Object.freeze({ id: 'premove-white-king', pieceType: 'wK' }),
  e2: Object.freeze({ id: 'premove-white-pawn', pieceType: 'wP' }),
  e7: Object.freeze({ id: 'premove-black-pawn', pieceType: 'bP' }),
  h8: Object.freeze({ id: 'premove-black-king', pieceType: 'bK' }),
});

type DemoPosition = Omit<ControlledPosition, 'value'> & {
  readonly value: PositionObject;
};

interface PromotionRequest {
  readonly intent: Readonly<MoveIntent>;
  readonly onAbort: () => void;
  readonly resolve: (decision: MoveDecision) => void;
  readonly signal: AbortSignal;
}

interface QueuedPremove {
  readonly annotationId: string;
  readonly piece: Readonly<PieceData>;
  readonly queuedAtRevision: number;
  readonly sourceSquare: SquareId;
  readonly targetSquare: SquareId;
}

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

function movePiece(
  current: PositionObject,
  sourceSquare: SquareId,
  targetSquare: SquareId,
  piece: Readonly<PieceData>,
): PositionObject {
  const value: Record<string, Readonly<PieceData>> = {};
  for (const [square, currentPiece] of Object.entries(current)) {
    if (
      currentPiece !== undefined &&
      square !== sourceSquare &&
      square !== targetSquare
    ) {
      value[square] = currentPiece;
    }
  }
  value[targetSquare] = piece;
  return Object.freeze(value);
}

function emptySelection(revision: number): ControlledSelection {
  return Object.freeze({
    destinationSquares: Object.freeze([]),
    revision,
    selectedSquare: null,
  });
}

function emptyAnnotations(revision: number): ControlledAnnotations {
  return Object.freeze({ revision, value: Object.freeze([]) });
}

function actionButton(label: string, onPress: () => void, secondary = false) {
  return (
    <Pressable
      accessibilityRole="button"
      key={label}
      onPress={onPress}
      style={secondary ? styles.secondaryButton : styles.button}
    >
      <Text style={secondary ? styles.secondaryButtonText : styles.buttonText}>
        {label}
      </Text>
    </Pressable>
  );
}

export default function RulesOwnedMovesScreen() {
  const [promotionPosition, setPromotionPosition] = useState<DemoPosition>({
    revision: 0,
    value: PROMOTION_START,
  });
  const [pendingPromotion, setPendingPromotion] =
    useState<Readonly<MoveIntent> | null>(null);
  const [promotionStatus, setPromotionStatus] = useState(
    'Move the pawn from g7 to g8, then choose its new piece in consumer UI.',
  );
  const promotionActionsRef = useRef<ChessboardActions | null>(null);
  const promotionRequestRef = useRef<PromotionRequest | null>(null);

  const settlePromotion = useCallback(
    (request: PromotionRequest, decision: MoveDecision): boolean => {
      if (promotionRequestRef.current !== request) {
        return false;
      }
      request.signal.removeEventListener('abort', request.onAbort);
      promotionRequestRef.current = null;
      setPendingPromotion(null);
      request.resolve(decision);
      return true;
    },
    [],
  );

  const onPromotionMoveRequest = useCallback<OnMoveRequest>(
    (intent, { signal }) => {
      if (
        signal.aborted ||
        intent.boardId !== PROMOTION_BOARD_ID ||
        intent.source.kind !== 'board' ||
        intent.source.square !== PROMOTION_SOURCE ||
        intent.targetSquare !== PROMOTION_TARGET ||
        intent.basePositionRevision !== promotionPosition.revision ||
        !piecesMatch(
          promotionPosition.value[intent.source.square],
          intent.piece,
        ) ||
        intent.piece.pieceType !== 'wP'
      ) {
        setPromotionStatus(
          'The consumer rejected a stale request or a move outside this focused promotion recipe.',
        );
        return {
          reason: 'This example accepts only the current g7 to g8 promotion.',
          status: 'rejected',
        };
      }

      return new Promise<MoveDecision>((resolve) => {
        const previous = promotionRequestRef.current;
        if (previous !== null) {
          settlePromotion(previous, {
            reason: 'A newer promotion request replaced this request.',
            status: 'rejected',
          });
        }

        const request: PromotionRequest = Object.freeze({
          intent,
          onAbort: () => {
            if (
              settlePromotion(request, {
                reason: 'Promotion choice was cancelled.',
                status: 'rejected',
              })
            ) {
              setPromotionStatus(
                'The board cancelled the request; the late chooser cannot change position.',
              );
            }
          },
          resolve,
          signal,
        });
        promotionRequestRef.current = request;
        signal.addEventListener('abort', request.onAbort, { once: true });
        setPendingPromotion(intent);
        setPromotionStatus(
          'The move decision is waiting in consumer UI; the board still renders the controlled pawn on g7.',
        );
      });
    },
    [promotionPosition, settlePromotion],
  );

  const choosePromotion = useCallback(
    (pieceType: PieceType): void => {
      const request = promotionRequestRef.current;
      if (request === null || request.signal.aborted) {
        setPromotionStatus('There is no current promotion request to commit.');
        return;
      }

      const { intent } = request;
      if (
        intent.source.kind !== 'board' ||
        intent.targetSquare === null ||
        promotionPosition.revision !== intent.basePositionRevision ||
        !piecesMatch(
          promotionPosition.value[intent.source.square],
          intent.piece,
        )
      ) {
        settlePromotion(request, {
          reason: 'The controlled position changed before promotion choice.',
          status: 'rejected',
        });
        setPromotionStatus(
          'The consumer rejected a stale chooser result; position is unchanged.',
        );
        return;
      }

      const nextRevision = promotionPosition.revision + 1;
      const promotedPiece = Object.freeze({
        ...(intent.piece.id === undefined ? {} : { id: intent.piece.id }),
        pieceType,
      });
      setPromotionPosition({
        committedIntentId: intent.intentId,
        revision: nextRevision,
        transition: {
          from: intent.source.square,
          fromRevision: promotionPosition.revision,
          promotion: pieceType,
          to: intent.targetSquare,
          toRevision: nextRevision,
        },
        value: movePiece(
          promotionPosition.value,
          intent.source.square,
          intent.targetSquare,
          promotedPiece,
        ),
      });
      settlePromotion(request, { status: 'accepted' });
      setPromotionStatus(
        `The consumer committed ${pieceType} at g8 with the matching intent and exact promotion transition.`,
      );
    },
    [promotionPosition, settlePromotion],
  );

  useEffect(
    () => () => {
      const request = promotionRequestRef.current;
      if (request !== null) {
        request.signal.removeEventListener('abort', request.onAbort);
        promotionRequestRef.current = null;
        request.resolve({
          reason: 'Promotion example unmounted.',
          status: 'rejected',
        });
      }
    },
    [],
  );

  useEffect(() => {
    if (pendingPromotion !== null) {
      AccessibilityInfo.announceForAccessibility(
        'Promotion required. Choose queen, rook, bishop, or knight below the board.',
      );
    }
  }, [pendingPromotion]);

  const [premovePosition, setPremovePosition] = useState<DemoPosition>({
    revision: 0,
    value: PREMOVE_START,
  });
  const [premoveSelection, setPremoveSelection] = useState<ControlledSelection>(
    () => emptySelection(0),
  );
  const [premoveAnnotations, setPremoveAnnotations] =
    useState<ControlledAnnotations>(() => emptyAnnotations(0));
  const [queuedPremove, setQueuedPremove] = useState<QueuedPremove | null>(
    null,
  );
  const [premoveStatus, setPremoveStatus] = useState(
    'Select e2 and then e4. The consumer will queue and annotate the premove without opening a move request.',
  );

  const clearPremovePresentation = useCallback((): void => {
    setQueuedPremove(null);
    setPremoveSelection((current) => emptySelection(current.revision + 1));
    setPremoveAnnotations((current) => emptyAnnotations(current.revision + 1));
  }, []);

  const onPremoveSquareActivate = useCallback<OnSquareActivate>(
    (intent) => {
      if (
        intent.boardId !== PREMOVE_BOARD_ID ||
        intent.basePositionRevision !== premovePosition.revision ||
        intent.baseSelectionRevision !== premoveSelection.revision
      ) {
        return;
      }

      if (
        intent.action === 'clear-selection' ||
        premoveSelection.selectedSquare === intent.square
      ) {
        setPremoveSelection(emptySelection(premoveSelection.revision + 1));
        setPremoveStatus('The consumer cleared its staged premove source.');
        return;
      }

      if (premoveSelection.selectedSquare === null) {
        const piece = premovePosition.value[intent.square];
        if (
          intent.square !== PREMOVE_SOURCE ||
          piece?.id !== 'premove-white-pawn'
        ) {
          setPremoveStatus(
            'This focused recipe queues only the white pawn from e2.',
          );
          return;
        }
        setPremoveSelection({
          destinationSquares: Object.freeze([PREMOVE_TARGET]),
          revision: premoveSelection.revision + 1,
          selectedSquare: PREMOVE_SOURCE,
        });
        setPremoveStatus(
          'The source and destination highlight are controlled consumer selection.',
        );
        return;
      }

      if (
        premoveSelection.selectedSquare !== PREMOVE_SOURCE ||
        intent.square !== PREMOVE_TARGET
      ) {
        setPremoveStatus('Choose e4 to finish this focused premove recipe.');
        return;
      }

      const piece = premovePosition.value[PREMOVE_SOURCE];
      if (piece === undefined) {
        setPremoveStatus(
          'The source disappeared before the premove was queued.',
        );
        return;
      }
      const annotationId = `premove:${intent.intentId}`;
      setQueuedPremove(
        Object.freeze({
          annotationId,
          piece: Object.freeze({
            ...(piece.id === undefined ? {} : { id: piece.id }),
            pieceType: piece.pieceType,
          }),
          queuedAtRevision: premovePosition.revision,
          sourceSquare: PREMOVE_SOURCE,
          targetSquare: PREMOVE_TARGET,
        }),
      );
      setPremoveSelection(emptySelection(premoveSelection.revision + 1));
      setPremoveAnnotations({
        revision: premoveAnnotations.revision + 1,
        value: Object.freeze([
          Object.freeze({
            color: '#7755cc',
            from: PREMOVE_SOURCE,
            id: annotationId,
            layer: 'abovePieces' as const,
            to: PREMOVE_TARGET,
            type: 'arrow' as const,
          }),
        ]),
      });
      setPremoveStatus(
        'Queued in consumer state. No onMoveRequest exists on this board, so no board commit timeout is running.',
      );
    },
    [premoveAnnotations.revision, premovePosition, premoveSelection],
  );

  const publishOpponentUpdate = useCallback((): void => {
    const pawn = premovePosition.value.e7;
    if (pawn?.id !== 'premove-black-pawn') {
      setPremoveStatus('The opponent update has already been published.');
      return;
    }
    const nextRevision = premovePosition.revision + 1;
    setPremovePosition({
      revision: nextRevision,
      transition: {
        from: 'e7',
        fromRevision: premovePosition.revision,
        to: 'e5',
        toRevision: nextRevision,
      },
      value: movePiece(premovePosition.value, 'e7', 'e5', pawn),
    });
    setPremoveStatus(
      'The opponent published a newer controlled revision. The queued premove remains consumer data and must now be revalidated.',
    );
  }, [premovePosition]);

  const applyQueuedPremove = useCallback((): void => {
    const queued = queuedPremove;
    if (queued === null) {
      setPremoveStatus(
        'Queue a premove before asking the consumer to apply it.',
      );
      return;
    }
    if (premovePosition.revision <= queued.queuedAtRevision) {
      setPremoveStatus(
        'Publish the simulated opponent update before revalidating the premove.',
      );
      return;
    }
    const sourcePiece = premovePosition.value[queued.sourceSquare];
    if (
      !piecesMatch(sourcePiece, queued.piece) ||
      premovePosition.value[queued.targetSquare] !== undefined
    ) {
      clearPremovePresentation();
      setPremoveStatus(
        'The consumer discarded the stale premove because its current source or target no longer matches.',
      );
      return;
    }

    const nextRevision = premovePosition.revision + 1;
    setPremovePosition({
      revision: nextRevision,
      transition: {
        from: queued.sourceSquare,
        fromRevision: premovePosition.revision,
        to: queued.targetSquare,
        toRevision: nextRevision,
      },
      value: movePiece(
        premovePosition.value,
        queued.sourceSquare,
        queued.targetSquare,
        queued.piece,
      ),
    });
    clearPremovePresentation();
    setPremoveStatus(
      'The consumer revalidated against the current revision and published the premove as a fresh external controlled update.',
    );
  }, [clearPremovePresentation, premovePosition, queuedPremove]);

  const invalidatePremoveSource = useCallback((): void => {
    const value: Record<string, Readonly<PieceData>> = {};
    for (const [square, piece] of Object.entries(premovePosition.value)) {
      if (piece !== undefined && square !== PREMOVE_SOURCE) {
        value[square] = piece;
      }
    }
    setPremovePosition({
      revision: premovePosition.revision + 1,
      value: Object.freeze(value),
    });
    setPremoveStatus(
      'A simulated external update removed the queued source. Applying now will revalidate and discard the premove.',
    );
  }, [premovePosition]);

  return (
    <ScrollView
      contentContainerStyle={styles.content}
      contentInsetAdjustmentBehavior="automatic"
      style={styles.screen}
    >
      <Text style={styles.eyebrow}>PHASE 5 · RULES-OWNED WORKFLOWS</Text>
      <Text style={styles.title}>Promotion and premoves stay outside</Text>
      <Text style={styles.description}>
        The board emits coordinates and renders controlled state. This route
        deliberately keeps promotion choice, premove queuing, and every rules
        decision in the consumer.
      </Text>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Consumer-owned promotion</Text>
        <Text style={styles.sectionBody}>
          Drag g7 to g8 or use the board actions. The request remains pending
          while these ordinary app buttons choose the piece. Cancelling the move
          aborts the chooser and makes a late result inert.
        </Text>
        <View style={styles.board}>
          <Chessboard
            actionsRef={promotionActionsRef}
            accessibility={{
              boardHint:
                'Choose the pawn on g7, then g8. Choose the promotion piece with the buttons below.',
              boardLabel: 'Consumer-owned promotion board',
            }}
            boardId={PROMOTION_BOARD_ID}
            moveRequestTimeouts={{ commitMs: 1_500, decisionMs: 30_000 }}
            onMoveRequest={onPromotionMoveRequest}
            position={promotionPosition}
          />
        </View>
        <Text accessibilityLiveRegion="polite" style={styles.status}>
          Revision {promotionPosition.revision} · chooser:{' '}
          {pendingPromotion === null ? 'closed' : 'waiting'}
          {`\n`}
          {promotionStatus}
        </Text>
        {pendingPromotion === null ? null : (
          <View style={styles.choiceGrid}>
            {PROMOTION_CHOICES.map(({ label, pieceType }) =>
              actionButton(label, () => {
                choosePromotion(pieceType);
              }),
            )}
          </View>
        )}
        <View style={styles.controls}>
          {actionButton(
            'Cancel pending promotion',
            () => {
              const cancelled =
                promotionActionsRef.current?.cancelMove() ?? false;
              if (!cancelled) {
                setPromotionStatus('There is no current move to cancel.');
              }
            },
            true,
          )}
          {actionButton(
            'Reset promotion board',
            () => {
              promotionActionsRef.current?.cancelMove();
              setPromotionPosition((current) => ({
                revision: current.revision + 1,
                value: PROMOTION_START,
              }));
              setPromotionStatus(
                'The consumer published a fresh reset revision.',
              );
            },
            true,
          )}
        </View>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Consumer-owned premove queue</Text>
        <Text style={styles.sectionBody}>
          Activate e2 and then e4. This board intentionally has no
          onMoveRequest: controlled selection stages the squares and a
          controlled arrow presents the queue.
        </Text>
        <View style={styles.board}>
          <Chessboard
            accessibility={{
              boardHint:
                'Activate e2, then e4 to queue a premove in consumer state.',
              boardLabel: 'Consumer-owned premove board',
            }}
            annotations={premoveAnnotations}
            boardId={PREMOVE_BOARD_ID}
            onSquareActivate={onPremoveSquareActivate}
            position={premovePosition}
            selection={premoveSelection}
          />
        </View>
        <Text style={styles.status}>
          Position revision {premovePosition.revision} · selection revision{' '}
          {premoveSelection.revision} · annotation revision{' '}
          {premoveAnnotations.revision}
          {`\n`}
          Queue:{' '}
          {queuedPremove === null
            ? 'empty'
            : `${queuedPremove.sourceSquare} → ${queuedPremove.targetSquare} from revision ${String(queuedPremove.queuedAtRevision)}`}
          {`\n`}
          {premoveStatus}
        </Text>
        <View style={styles.controls}>
          {actionButton('Publish opponent e7 → e5', publishOpponentUpdate)}
          {actionButton('Revalidate and apply premove', applyQueuedPremove)}
          {actionButton(
            'Publish source-invalidating update',
            invalidatePremoveSource,
            true,
          )}
          {actionButton(
            'Clear queued premove',
            () => {
              clearPremovePresentation();
              setPremoveStatus(
                'The consumer cleared its queue, selection, and annotation.',
              );
            },
            true,
          )}
          {actionButton(
            'Reset premove board',
            () => {
              setPremovePosition((current) => ({
                revision: current.revision + 1,
                value: PREMOVE_START,
              }));
              clearPremovePresentation();
              setPremoveStatus(
                'The consumer reset every controlled premove domain.',
              );
            },
            true,
          )}
        </View>
      </View>

      <Text style={styles.boundary}>
        This is integration guidance, not a chess engine. The promotion path
        uses the request AbortSignal and exact intent correlation. The premove
        path never reports an accepted request that waits indefinitely; after an
        opponent update it validates its own queue against the latest controlled
        position and publishes an ordinary external revision.
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
    flexGrow: 1,
    justifyContent: 'center',
    minHeight: 48,
    minWidth: 120,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  buttonText: {
    color: '#ffffff',
    fontSize: 14,
    fontWeight: '700',
    textAlign: 'center',
  },
  choiceGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  content: {
    alignItems: 'center',
    gap: 20,
    paddingHorizontal: 20,
    paddingVertical: 28,
  },
  controls: {
    gap: 8,
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
  secondaryButton: {
    alignItems: 'center',
    backgroundColor: '#eee8de',
    borderColor: '#c9bba8',
    borderRadius: 10,
    borderWidth: StyleSheet.hairlineWidth,
    justifyContent: 'center',
    minHeight: 48,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  secondaryButtonText: {
    color: '#4f463b',
    fontSize: 14,
    fontWeight: '700',
    textAlign: 'center',
  },
  section: {
    backgroundColor: '#ffffff',
    borderColor: '#d9d0c3',
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    gap: 12,
    maxWidth: 520,
    padding: 16,
    width: '100%',
  },
  sectionBody: {
    color: '#665c4d',
    fontSize: 14,
    lineHeight: 21,
  },
  sectionTitle: {
    color: '#1e1b17',
    fontSize: 20,
    fontWeight: '700',
  },
  status: {
    color: '#665c4d',
    fontSize: 14,
    lineHeight: 21,
  },
  title: {
    color: '#1e1b17',
    fontSize: 30,
    fontWeight: '700',
    letterSpacing: -0.7,
    maxWidth: 520,
    width: '100%',
  },
});
