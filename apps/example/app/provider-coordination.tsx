import {
  Chessboard,
  ChessboardProvider,
  type ControlledPosition,
  type MoveIntent,
  type OnMoveRequest,
  type PieceData,
  type PositionObject,
} from '@vibechess/chessboard-native';
import { useCallback, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

const MAIN_POSITION = Object.freeze({
  a1: Object.freeze({ id: 'main-rook', pieceType: 'wR' }),
  e2: Object.freeze({ id: 'main-pawn', pieceType: 'wP' }),
  e7: Object.freeze({ id: 'main-target', pieceType: 'bP' }),
  h8: Object.freeze({ id: 'main-king', pieceType: 'bK' }),
}) satisfies PositionObject;

const VARIATION_POSITION = Object.freeze({
  b1: Object.freeze({ id: 'variation-knight', pieceType: 'wN' }),
  d4: Object.freeze({ id: 'variation-queen', pieceType: 'wQ' }),
  f6: Object.freeze({ id: 'variation-bishop', pieceType: 'bB' }),
  g8: Object.freeze({ id: 'variation-king', pieceType: 'bK' }),
}) satisfies PositionObject;

type DemoPosition = Omit<ControlledPosition, 'value'> & {
  readonly value: PositionObject;
};

interface ControlledBoardDemo {
  readonly onMoveRequest: OnMoveRequest;
  readonly position: DemoPosition;
  readonly reset: () => void;
  readonly status: string;
}

function piecesMatch(
  current: Readonly<PieceData> | undefined,
  requested: Readonly<PieceData>,
): boolean {
  return (
    current !== undefined &&
    current.id === requested.id &&
    current.pieceType === requested.pieceType
  );
}

function applyIntent(
  boardId: string,
  current: Readonly<DemoPosition>,
  intent: Readonly<MoveIntent>,
): Readonly<DemoPosition> | null {
  if (
    intent.boardId !== boardId ||
    intent.source.kind !== 'board' ||
    intent.basePositionRevision !== current.revision ||
    !piecesMatch(current.value[intent.source.square], intent.piece)
  ) {
    return null;
  }

  const value: Record<string, Readonly<PieceData>> = {};
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

function useControlledBoard(
  boardId: string,
  label: string,
  initialValue: PositionObject,
): ControlledBoardDemo {
  const [position, setPosition] = useState<DemoPosition>({
    revision: 0,
    value: initialValue,
  });
  const [status, setStatus] = useState(
    `${label} has its own controlled revision and callback.`,
  );

  const onMoveRequest = useCallback<OnMoveRequest>(
    (intent) => {
      const next = applyIntent(boardId, position, intent);
      if (next === null) {
        setStatus(`${label} rejected an obsolete or foreign request.`);
        return { status: 'rejected', reason: 'Request is not current' };
      }

      setPosition(next);
      setStatus(
        `${label} committed ${intent.source.kind === 'board' ? intent.source.square : intent.source.spareId} → ${intent.targetSquare ?? 'off board'} at revision ${String(next.revision)}.`,
      );
      return { status: 'accepted' };
    },
    [boardId, label, position],
  );

  const reset = useCallback(() => {
    setPosition((current) => ({
      revision: current.revision + 1,
      value: initialValue,
    }));
    setStatus(`${label} published an independent controlled reset.`);
  }, [initialValue, label]);

  return { onMoveRequest, position, reset, status };
}

export default function ProviderCoordinationExample() {
  const [geometryRevision, setGeometryRevision] = useState(0);
  const main = useControlledBoard('provider-main', 'Main board', MAIN_POSITION);
  const variation = useControlledBoard(
    'provider-variation',
    'Variation board',
    VARIATION_POSITION,
  );

  return (
    <ScrollView
      contentContainerStyle={styles.content}
      contentInsetAdjustmentBehavior="automatic"
      style={styles.screen}
    >
      <Text style={styles.eyebrow}>PHASE 2 · PROVIDER COORDINATION</Text>
      <Text style={styles.title}>Shared gesture plumbing, isolated state</Text>
      <Text style={styles.description}>
        Both boards reuse one explicit provider and its shared pointerless drag
        overlay. Position, revision, callback, virtual cursor, and accessibility
        value remain board-local and consumer controlled.
      </Text>

      <View style={styles.providerRegion}>
        <ChessboardProvider geometryRevision={geometryRevision}>
          <View style={styles.boardCard}>
            <Text style={styles.boardTitle}>Main · white orientation</Text>
            <Chessboard
              accessibility={{
                boardLabel: 'Provider main board, white orientation',
              }}
              boardId="provider-main"
              onMoveRequest={main.onMoveRequest}
              position={main.position}
              reduceMotion="always"
            />
            <Text style={styles.status}>
              Revision {main.position.revision}
              {`\n`}
              {main.status}
            </Text>
            <Pressable
              accessibilityRole="button"
              onPress={main.reset}
              style={styles.secondaryButton}
            >
              <Text style={styles.secondaryButtonText}>Reset main only</Text>
            </Pressable>
          </View>

          <View style={styles.boardCard}>
            <Text style={styles.boardTitle}>Variation · black orientation</Text>
            <Chessboard
              accessibility={{
                boardLabel: 'Provider variation board, black orientation',
              }}
              boardId="provider-variation"
              onMoveRequest={variation.onMoveRequest}
              orientation="black"
              position={variation.position}
              reduceMotion="always"
            />
            <Text style={styles.status}>
              Revision {variation.position.revision}
              {`\n`}
              {variation.status}
            </Text>
            <Pressable
              accessibilityRole="button"
              onPress={variation.reset}
              style={styles.secondaryButton}
            >
              <Text style={styles.secondaryButtonText}>
                Reset variation only
              </Text>
            </Pressable>
          </View>
        </ChessboardProvider>
      </View>

      <View style={styles.card}>
        <Text style={styles.cardTitle}>Provider geometry epoch</Text>
        <Text style={styles.status}>
          Revision {geometryRevision}. Increment this after an ancestor scroll,
          transform, or other programmatic geometry change that native board
          layout events cannot observe.
        </Text>
        <Pressable
          accessibilityRole="button"
          onPress={() => {
            setGeometryRevision((current) => current + 1);
          }}
          style={styles.primaryButton}
        >
          <Text style={styles.primaryButtonText}>
            Invalidate provider geometry
          </Text>
        </Pressable>
      </View>

      <Text style={styles.boundary}>
        Cached window bounds are hover hints only. Release verification always
        remeasures and rejects stale board, geometry, and interaction epochs.
        This route isolates the provider registry itself; the spare-piece editor
        route exercises the public external-source API built on that resolver.
      </Text>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  boardCard: {
    backgroundColor: '#ffffff',
    borderColor: '#d9d0c3',
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    gap: 12,
    maxWidth: 520,
    padding: 14,
    width: '100%',
  },
  boardTitle: {
    color: '#1e1b17',
    fontSize: 18,
    fontWeight: '700',
  },
  boundary: {
    color: '#665c4d',
    fontSize: 14,
    lineHeight: 21,
    maxWidth: 520,
    width: '100%',
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
  primaryButton: {
    alignItems: 'center',
    backgroundColor: '#2f5f4f',
    borderRadius: 10,
    justifyContent: 'center',
    minHeight: 48,
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  primaryButtonText: {
    color: '#ffffff',
    fontSize: 15,
    fontWeight: '700',
  },
  providerRegion: {
    gap: 20,
    maxWidth: 520,
    width: '100%',
  },
  screen: {
    backgroundColor: '#f7f4ee',
  },
  secondaryButton: {
    alignItems: 'center',
    borderColor: '#2f5f4f',
    borderRadius: 10,
    borderWidth: 1,
    justifyContent: 'center',
    minHeight: 44,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  secondaryButtonText: {
    color: '#2f5f4f',
    fontSize: 14,
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
