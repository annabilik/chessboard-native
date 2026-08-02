import {
  type BoardOrientation,
  type BoardTransition,
  Chessboard,
  type OnMoveRequest,
  type PositionObject,
  type ReduceMotion,
} from '@vibechess/chessboard-native';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

interface DemoPosition {
  readonly committedIntentId?: string;
  readonly revision: number;
  readonly value: PositionObject;
  readonly transition?: BoardTransition;
}

type DemoTransition = Omit<BoardTransition, 'fromRevision' | 'toRevision'>;

const MOVE_START: PositionObject = Object.freeze({
  a1: Object.freeze({ id: 'move-rook', pieceType: 'wR' }),
});
const MOVE_END: PositionObject = Object.freeze({
  b1: Object.freeze({ id: 'move-rook', pieceType: 'wR' }),
});
const ENTER_EXIT_START: PositionObject = Object.freeze({
  e1: Object.freeze({ id: 'exiting-bishop', pieceType: 'wB' }),
});
const ENTER_EXIT_END: PositionObject = Object.freeze({
  d1: Object.freeze({ id: 'entering-queen', pieceType: 'wQ' }),
});
const CAPTURE_START: PositionObject = Object.freeze({
  a1: Object.freeze({ id: 'capture-rook', pieceType: 'wR' }),
  c1: Object.freeze({ id: 'captured-knight', pieceType: 'bN' }),
});
const CAPTURE_END: PositionObject = Object.freeze({
  c1: Object.freeze({ id: 'capture-rook', pieceType: 'wR' }),
});

const AMBIGUOUS_STEPS: readonly PositionObject[] = Object.freeze([
  Object.freeze({
    a1: Object.freeze({ pieceType: 'wR' }),
    c1: Object.freeze({ pieceType: 'wR' }),
  }),
  Object.freeze({
    b1: Object.freeze({ pieceType: 'wR' }),
    d1: Object.freeze({ pieceType: 'wR' }),
  }),
]);

function nextPosition(
  current: DemoPosition,
  steps: readonly PositionObject[],
  nextIndex: number,
): DemoPosition {
  return {
    revision: current.revision + 1,
    value: steps[nextIndex] ?? Object.freeze({}),
  };
}

function nextHintedPosition(
  current: DemoPosition,
  value: PositionObject,
  transition: DemoTransition,
): DemoPosition {
  const nextRevision = current.revision + 1;
  return {
    revision: nextRevision,
    transition: {
      ...transition,
      fromRevision: current.revision,
      toRevision: nextRevision,
    },
    value,
  };
}

const PROMOTION_START: PositionObject = Object.freeze({
  a1: Object.freeze({ id: 'promotion-white-king', pieceType: 'wK' }),
  a8: Object.freeze({ id: 'promotion-black-king', pieceType: 'bK' }),
  g7: Object.freeze({ id: 'promoting-pawn', pieceType: 'wP' }),
});
const PROMOTION_END: PositionObject = Object.freeze({
  a1: PROMOTION_START.a1,
  a8: PROMOTION_START.a8,
  g8: Object.freeze({ id: 'promoting-pawn', pieceType: 'wQ' }),
});
const CASTLING_START: PositionObject = Object.freeze({
  a8: Object.freeze({ id: 'castling-black-king', pieceType: 'bK' }),
  e1: Object.freeze({ id: 'castle-king', pieceType: 'wK' }),
  h1: Object.freeze({ id: 'castle-rook', pieceType: 'wR' }),
});
const CASTLING_END: PositionObject = Object.freeze({
  a8: CASTLING_START.a8,
  f1: Object.freeze({ id: 'castle-rook', pieceType: 'wR' }),
  g1: Object.freeze({ id: 'castle-king', pieceType: 'wK' }),
});
const EN_PASSANT_START: PositionObject = Object.freeze({
  a1: Object.freeze({ id: 'en-passant-white-king', pieceType: 'wK' }),
  d5: Object.freeze({ id: 'en-passant-victim', pieceType: 'bP' }),
  e5: Object.freeze({ id: 'en-passant-pawn', pieceType: 'wP' }),
  h8: Object.freeze({ id: 'en-passant-black-king', pieceType: 'bK' }),
});
const EN_PASSANT_END: PositionObject = Object.freeze({
  a1: EN_PASSANT_START.a1,
  d6: Object.freeze({ id: 'en-passant-pawn', pieceType: 'wP' }),
  h8: EN_PASSANT_START.h8,
});

const CONTINUITY_STEPS: readonly PositionObject[] = Object.freeze([
  Object.freeze({
    a1: Object.freeze({ id: 'continuity-runner', pieceType: 'wR' }),
  }),
  Object.freeze({
    b1: Object.freeze({ id: 'continuity-runner', pieceType: 'wR' }),
  }),
  Object.freeze({
    c1: Object.freeze({ id: 'continuity-runner', pieceType: 'wR' }),
  }),
]);

const HANDOFF_START: PositionObject = Object.freeze({
  a1: Object.freeze({ id: 'handoff-runner', pieceType: 'wR' }),
});

interface TransitionPrimitiveProps {
  readonly afterDescription: string;
  readonly beforeDescription: string;
  readonly boardId: string;
  readonly end: PositionObject;
  readonly forwardLabel: string;
  readonly reduceMotion: ReduceMotion;
  readonly reverseLabel: string;
  readonly start: PositionObject;
  readonly title: string;
  readonly transitionDurationMs: number;
}

function TransitionPrimitive({
  afterDescription,
  beforeDescription,
  boardId,
  end,
  forwardLabel,
  reduceMotion,
  reverseLabel,
  start,
  title,
  transitionDurationMs,
}: TransitionPrimitiveProps) {
  const [position, setPosition] = useState<DemoPosition>({
    revision: 1,
    value: start,
  });
  const forward = position.value === start;

  return (
    <View style={styles.transitionExample}>
      <Text style={styles.exampleTitle}>{title}</Text>
      <View style={styles.boardCard}>
        <Chessboard
          boardId={boardId}
          dimensions={{ columns: 5, rows: 1 }}
          position={position}
          reduceMotion={reduceMotion}
          showNotation={false}
          transitionDurationMs={transitionDurationMs}
        />
      </View>
      <Text style={styles.caption}>
        {forward ? beforeDescription : afterDescription}
      </Text>
      <Pressable
        accessibilityRole="button"
        onPress={() => {
          setPosition((current) => ({
            revision: current.revision + 1,
            value: current.value === start ? end : start,
          }));
        }}
        style={styles.primaryButton}
      >
        <Text style={styles.primaryButtonText}>
          {forward ? forwardLabel : reverseLabel}
        </Text>
      </Pressable>
    </View>
  );
}

export default function TransitionsRoute() {
  const [durationMs, setDurationMs] = useState(600);
  const [reduceMotion, setReduceMotion] = useState<ReduceMotion>('never');
  const [ambiguousIndex, setAmbiguousIndex] = useState(0);
  const [ambiguousPosition, setAmbiguousPosition] = useState<DemoPosition>({
    revision: 1,
    value: AMBIGUOUS_STEPS[0] ?? Object.freeze({}),
  });
  const [promotionForward, setPromotionForward] = useState(true);
  const [promotionPosition, setPromotionPosition] = useState<DemoPosition>({
    revision: 1,
    value: PROMOTION_START,
  });
  const [castlingForward, setCastlingForward] = useState(true);
  const [castlingPosition, setCastlingPosition] = useState<DemoPosition>({
    revision: 1,
    value: CASTLING_START,
  });
  const [enPassantForward, setEnPassantForward] = useState(true);
  const [enPassantPosition, setEnPassantPosition] = useState<DemoPosition>({
    revision: 1,
    value: EN_PASSANT_START,
  });
  const [continuityPosition, setContinuityPosition] = useState<DemoPosition>({
    revision: 1,
    value: CONTINUITY_STEPS[0] ?? Object.freeze({}),
  });
  const [continuityOrientation, setContinuityOrientation] =
    useState<BoardOrientation>('white');
  const [compactContinuityBoard, setCompactContinuityBoard] = useState(false);
  const continuityStep = useRef(0);
  const continuityTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [handoffPosition, setHandoffPosition] = useState<DemoPosition>({
    revision: 1,
    value: HANDOFF_START,
  });
  const handoffRequest = useRef<Readonly<{
    readonly cancel: () => void;
  }> | null>(null);

  useEffect(
    () => () => {
      if (continuityTimer.current !== null) {
        clearTimeout(continuityTimer.current);
      }
      handoffRequest.current?.cancel();
    },
    [],
  );

  const publishRapidSequence = useCallback((): void => {
    if (continuityTimer.current !== null) {
      clearTimeout(continuityTimer.current);
    }
    const firstIndex = (continuityStep.current + 1) % CONTINUITY_STEPS.length;
    const secondIndex = (firstIndex + 1) % CONTINUITY_STEPS.length;
    continuityStep.current = firstIndex;
    setContinuityPosition((current) => ({
      revision: current.revision + 1,
      value: CONTINUITY_STEPS[firstIndex] ?? Object.freeze({}),
    }));
    continuityTimer.current = setTimeout(
      () => {
        continuityStep.current = secondIndex;
        setContinuityPosition((current) => ({
          revision: current.revision + 1,
          value: CONTINUITY_STEPS[secondIndex] ?? Object.freeze({}),
        }));
        continuityTimer.current = null;
      },
      Math.max(80, durationMs * 0.55),
    );
  }, [durationMs]);

  const requestHandoffMove = useCallback<OnMoveRequest>(
    (intent, { signal }) => {
      const targetSquare = intent.targetSquare;
      if (targetSquare === null) {
        return {
          reason: 'Drop on the board for this demo.',
          status: 'rejected',
        };
      }
      if (signal.aborted) {
        return {
          reason: 'The move request was cancelled.',
          status: 'rejected',
        };
      }
      handoffRequest.current?.cancel();
      let timer: ReturnType<typeof setTimeout> | null = null;
      const cancel = (): void => {
        if (timer !== null) {
          clearTimeout(timer);
          timer = null;
        }
        signal.removeEventListener('abort', cancel);
        if (handoffRequest.current?.cancel === cancel) {
          handoffRequest.current = null;
        }
      };
      handoffRequest.current = Object.freeze({ cancel });
      signal.addEventListener('abort', cancel, { once: true });
      timer = setTimeout(() => {
        signal.removeEventListener('abort', cancel);
        timer = null;
        if (handoffRequest.current?.cancel === cancel) {
          handoffRequest.current = null;
        }
        if (signal.aborted) {
          return;
        }
        setHandoffPosition((current) => {
          if (current.revision !== intent.basePositionRevision) {
            return current;
          }
          const value: Record<string, { id?: string; pieceType: string }> = {};
          const sourceSquare =
            intent.source.kind === 'board' ? intent.source.square : null;
          for (const [square, piece] of Object.entries(current.value)) {
            if (piece !== undefined && square !== sourceSquare) {
              value[square] = piece;
            }
          }
          value[targetSquare] = intent.piece;
          return {
            committedIntentId: intent.intentId,
            revision: current.revision + 1,
            value: Object.freeze(value),
          };
        });
      }, 700);
      return { status: 'accepted' };
    },
    [],
  );

  return (
    <SafeAreaView style={styles.screen}>
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.eyebrow}>PHASE 3 · CONTROLLED TRANSITIONS</Text>
        <Text style={styles.title}>Mounted transition lab</Text>
        <Text style={styles.description}>
          Every button publishes a new consumer-owned revision. The board
          animates detached presentation operations while the latest position
          remains authoritative. Compact rectangular fixtures isolate rendering
          and request mechanics and are rules-free; the full-board special-move
          fixtures below use validated chess positions.
        </Text>

        <View style={styles.controls}>
          {[0, 300, 600, 1_200].map((duration) => (
            <Pressable
              accessibilityRole="button"
              accessibilityState={{ selected: durationMs === duration }}
              key={duration}
              onPress={() => {
                setDurationMs(duration);
              }}
              style={[
                styles.controlButton,
                durationMs === duration ? styles.controlButtonActive : null,
              ]}
            >
              <Text
                style={[
                  styles.controlText,
                  durationMs === duration ? styles.controlTextActive : null,
                ]}
              >
                {duration} ms
              </Text>
            </Pressable>
          ))}
          {(['system', 'always', 'never'] as const).map((policy) => (
            <Pressable
              accessibilityRole="button"
              accessibilityState={{ selected: reduceMotion === policy }}
              key={policy}
              onPress={() => {
                setReduceMotion(policy);
              }}
              style={[
                styles.controlButton,
                reduceMotion === policy ? styles.controlButtonActive : null,
              ]}
            >
              <Text
                style={[
                  styles.controlText,
                  reduceMotion === policy ? styles.controlTextActive : null,
                ]}
              >
                Motion: {policy}
              </Text>
            </Pressable>
          ))}
        </View>

        <Text style={styles.sectionTitle}>
          Interruption and geometry rebase
        </Text>
        <View
          style={[
            styles.boardCard,
            compactContinuityBoard ? styles.compactBoardCard : null,
          ]}
        >
          <Chessboard
            boardId="transition-continuity"
            dimensions={{ columns: 3, rows: 1 }}
            orientation={continuityOrientation}
            position={continuityPosition}
            reduceMotion={reduceMotion}
            showNotation={false}
            transitionDurationMs={durationMs}
          />
        </View>
        <Text style={styles.caption}>
          Each run publishes two cyclic positions. With motion enabled, the
          second update arrives 55% through the first segment and receives a
          full new duration. Flip orientation or resize during motion to rebase
          over only the original segment's remaining time.
        </Text>
        <View style={styles.controls}>
          <Pressable
            accessibilityRole="button"
            onPress={publishRapidSequence}
            style={styles.controlButton}
          >
            <Text style={styles.controlText}>Run two rapid updates</Text>
          </Pressable>
          <Pressable
            accessibilityRole="button"
            onPress={() => {
              setContinuityOrientation((current) =>
                current === 'white' ? 'black' : 'white',
              );
            }}
            style={styles.controlButton}
          >
            <Text style={styles.controlText}>
              Orientation: {continuityOrientation}
            </Text>
          </Pressable>
          <Pressable
            accessibilityRole="button"
            onPress={() => {
              setCompactContinuityBoard((current) => !current);
            }}
            style={styles.controlButton}
          >
            <Text style={styles.controlText}>
              Width: {compactContinuityBoard ? 'compact' : 'full'}
            </Text>
          </Pressable>
        </View>

        <Text style={styles.sectionTitle}>Pending-to-commit handoff</Text>
        <View style={styles.boardCard}>
          <Chessboard
            boardId="transition-handoff"
            dimensions={{ columns: 2, rows: 1 }}
            moveRequestTimeouts={{ commitMs: 2_000, decisionMs: 2_000 }}
            onMoveRequest={requestHandoffMove}
            position={handoffPosition}
            reduceMotion={reduceMotion}
            showNotation={false}
            transitionDurationMs={durationMs}
          />
        </View>
        <Text style={styles.caption}>
          Drag the rook, or use the board's accessible move actions. The demo
          accepts immediately and publishes the exactly correlated controlled
          commit after 700 ms. With motion enabled, the pending target
          crossfades in place instead of replaying from its source.
        </Text>

        <Text style={styles.sectionTitle}>Basic controlled transitions</Text>
        <Text style={styles.caption}>
          Each strip publishes one isolated position change. The compact boards
          are rules-free, while the move and capture below still use legal rook
          geometry.
        </Text>
        <TransitionPrimitive
          afterDescription="After: the same rook is on b1. Its stable ID produces one move operation."
          beforeDescription="Before: a white rook is on a1. Publish the next revision to move it one clear square."
          boardId="transition-basic-move"
          end={MOVE_END}
          forwardLabel="Move rook a1 → b1"
          reduceMotion={reduceMotion}
          reverseLabel="Replay rook b1 → a1"
          start={MOVE_START}
          title="1. Ordinary move"
          transitionDurationMs={durationMs}
        />
        <TransitionPrimitive
          afterDescription="After: the bishop exited e1 and the queen entered d1. Their different IDs produce independent exit and enter fades."
          beforeDescription="Before: a bishop is on e1. The next external position removes it and independently adds a queen on d1."
          boardId="transition-basic-enter-exit"
          end={ENTER_EXIT_END}
          forwardLabel="Publish bishop exit + queen entry"
          reduceMotion={reduceMotion}
          reverseLabel="Replay entry and exit in reverse"
          start={ENTER_EXIT_START}
          title="2. Independent enter and exit"
          transitionDurationMs={durationMs}
        />
        <TransitionPrimitive
          afterDescription="After: the rook is on c1 and the captured knight has exited from that destination."
          beforeDescription="Before: a white rook is on a1, a black knight is on c1, and b1 is clear."
          boardId="transition-basic-capture"
          end={CAPTURE_END}
          forwardLabel="Rook a1 captures knight on c1"
          reduceMotion={reduceMotion}
          reverseLabel="Replay capture in reverse"
          start={CAPTURE_START}
          title="3. Rook capture geometry"
          transitionDurationMs={durationMs}
        />

        <Text style={styles.sectionTitle}>
          Synthetic ambiguous identity replacement
        </Text>
        <View style={styles.boardCard}>
          <Chessboard
            boardId="transition-ambiguous"
            dimensions={{ columns: 4, rows: 1 }}
            position={ambiguousPosition}
            reduceMotion={reduceMotion}
            showNotation={false}
            transitionDurationMs={durationMs}
          />
        </View>
        <Text style={styles.caption}>
          Anonymous identical rooks have no authoritative pairing, so the old
          actors fade out and the new actors fade in. Both rooks relocate in one
          external revision: this is intentionally a synthetic position diff,
          not one legal chess ply.
        </Text>
        <Pressable
          accessibilityRole="button"
          onPress={() => {
            const nextIndex = (ambiguousIndex + 1) % AMBIGUOUS_STEPS.length;
            setAmbiguousIndex(nextIndex);
            setAmbiguousPosition((current) =>
              nextPosition(current, AMBIGUOUS_STEPS, nextIndex),
            );
          }}
          style={styles.primaryButton}
        >
          <Text style={styles.primaryButtonText}>
            Toggle ambiguous controlled revision
          </Text>
        </Pressable>

        <Text style={styles.sectionTitle}>Explicit promotion</Text>
        <View style={styles.boardCard}>
          <Chessboard
            boardId="transition-promotion"
            position={promotionPosition}
            reduceMotion={reduceMotion}
            transitionDurationMs={durationMs}
          />
        </View>
        <Text style={styles.caption}>
          The old pawn and authoritative promoted piece share one path and
          crossfade without a shadow position. The reverse demonstrates replay
          choreography. Both kings are present, and the forward move is the
          legal promotion g7-g8=Q+.
        </Text>
        <Pressable
          accessibilityRole="button"
          onPress={() => {
            setPromotionPosition((current) =>
              current.value.g7 !== undefined
                ? nextHintedPosition(current, PROMOTION_END, {
                    from: 'g7',
                    promotion: 'wQ',
                    to: 'g8',
                  })
                : nextHintedPosition(current, PROMOTION_START, {
                    from: 'g8',
                    promotion: 'wP',
                    to: 'g7',
                  }),
            );
            setPromotionForward((current) => !current);
          }}
          style={styles.primaryButton}
        >
          <Text style={styles.primaryButtonText}>
            {promotionForward ? 'Promote pawn' : 'Replay in reverse'}
          </Text>
        </Pressable>

        <Text style={styles.sectionTitle}>Coordinated castling</Text>
        <View style={styles.boardCard}>
          <Chessboard
            boardId="transition-castling"
            position={castlingPosition}
            reduceMotion={reduceMotion}
            transitionDurationMs={durationMs}
          />
        </View>
        <Text style={styles.caption}>
          The king move and explicit rookMove are detached actors on the same
          board-local clock. This minimal legal fixture assumes White retains
          kingside castling rights; both kings are present and the path is clear
          and unattacked. No intermediate semantic position is created.
        </Text>
        <Pressable
          accessibilityRole="button"
          onPress={() => {
            setCastlingPosition((current) =>
              current.value.e1 !== undefined
                ? nextHintedPosition(current, CASTLING_END, {
                    from: 'e1',
                    rookMove: { from: 'h1', to: 'f1' },
                    to: 'g1',
                  })
                : nextHintedPosition(current, CASTLING_START, {
                    from: 'g1',
                    rookMove: { from: 'f1', to: 'h1' },
                    to: 'e1',
                  }),
            );
            setCastlingForward((current) => !current);
          }}
          style={styles.primaryButton}
        >
          <Text style={styles.primaryButtonText}>
            {castlingForward ? 'Castle kingside' : 'Reset with both actors'}
          </Text>
        </Pressable>

        <Text style={styles.sectionTitle}>Off-target capture (en passant)</Text>
        <View style={styles.boardCard}>
          <Chessboard
            boardId="transition-en-passant"
            position={enPassantPosition}
            reduceMotion={reduceMotion}
            transitionDurationMs={durationMs}
          />
        </View>
        <Text style={styles.caption}>
          This minimal legal fixture assumes Black has just played d7-d5.
          capturedSquare identifies the victim on d5 while the white pawn moves
          from e5 to d6, so the off-target capture animates correctly.
        </Text>
        <Pressable
          accessibilityRole="button"
          onPress={() => {
            setEnPassantPosition((current) =>
              current.value.d5 !== undefined
                ? nextHintedPosition(current, EN_PASSANT_END, {
                    capturedSquare: 'd5',
                    from: 'e5',
                    to: 'd6',
                  })
                : {
                    revision: current.revision + 1,
                    value: EN_PASSANT_START,
                  },
            );
            setEnPassantForward((current) => !current);
          }}
          style={styles.primaryButton}
        >
          <Text style={styles.primaryButtonText}>
            {enPassantForward ? 'Capture en passant' : 'Reset position'}
          </Text>
        </Pressable>

        <Text style={styles.note}>
          Every lab still renders the latest controlled position. Continuity
          samples and pending handoffs are presentation-only and become inert
          when reduced motion requests an immediate settle.
        </Text>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: {
    backgroundColor: '#f7f4ee',
    flex: 1,
  },
  content: {
    alignItems: 'center',
    paddingBottom: 64,
    paddingHorizontal: 24,
    paddingTop: 28,
  },
  eyebrow: {
    color: '#665c4d',
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 1.1,
    maxWidth: 560,
    width: '100%',
  },
  title: {
    color: '#1e1b17',
    fontSize: 30,
    fontWeight: '700',
    marginTop: 8,
    maxWidth: 560,
    width: '100%',
  },
  description: {
    color: '#665c4d',
    fontSize: 16,
    lineHeight: 24,
    marginTop: 12,
    maxWidth: 560,
    width: '100%',
  },
  controls: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 20,
    maxWidth: 560,
    width: '100%',
  },
  controlButton: {
    backgroundColor: '#e7dfd2',
    borderRadius: 999,
    paddingHorizontal: 14,
    paddingVertical: 9,
  },
  controlButtonActive: {
    backgroundColor: '#236a5b',
  },
  controlText: {
    color: '#1e1b17',
    fontSize: 14,
    fontWeight: '700',
  },
  controlTextActive: {
    color: '#ffffff',
  },
  sectionTitle: {
    color: '#1e1b17',
    fontSize: 20,
    fontWeight: '700',
    marginBottom: 10,
    marginTop: 32,
    maxWidth: 560,
    width: '100%',
  },
  boardCard: {
    backgroundColor: '#ffffff',
    borderRadius: 14,
    maxWidth: 560,
    overflow: 'hidden',
    width: '100%',
  },
  compactBoardCard: {
    maxWidth: 320,
  },
  transitionExample: {
    marginTop: 20,
    maxWidth: 560,
    width: '100%',
  },
  exampleTitle: {
    color: '#1e1b17',
    fontSize: 16,
    fontWeight: '700',
    marginBottom: 8,
    width: '100%',
  },
  caption: {
    color: '#665c4d',
    fontSize: 14,
    lineHeight: 20,
    marginTop: 10,
    maxWidth: 560,
    width: '100%',
  },
  primaryButton: {
    backgroundColor: '#1e1b17',
    borderRadius: 10,
    marginTop: 14,
    maxWidth: 560,
    paddingHorizontal: 18,
    paddingVertical: 12,
    width: '100%',
  },
  primaryButtonText: {
    color: '#ffffff',
    fontSize: 15,
    fontWeight: '700',
    textAlign: 'center',
  },
  note: {
    color: '#665c4d',
    fontSize: 14,
    lineHeight: 21,
    marginTop: 32,
    maxWidth: 560,
    width: '100%',
  },
});
