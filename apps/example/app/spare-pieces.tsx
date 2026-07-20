import {
  Chessboard,
  ChessboardProvider,
  defaultPieceRenderers,
  SparePiece,
  type BoardDimensions,
  type BoardOrientation,
  type ControlledPosition,
  type MoveIntent,
  type OnMoveRequest,
  type PieceData,
  type PieceRenderer,
  type PieceRenderers,
  type PositionObject,
} from '@vibechess/chessboard-native';
import { useCallback, useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

const BOARD_ID = 'spare-piece-editor';
const CONTROL_BOARD_ID = 'spare-piece-unrelated-control';

const WIDE_DIMENSIONS = Object.freeze({
  columns: 5,
  rows: 3,
}) satisfies BoardDimensions;
const TALL_DIMENSIONS = Object.freeze({
  columns: 3,
  rows: 5,
}) satisfies BoardDimensions;
const CONTROL_DIMENSIONS = Object.freeze({
  columns: 2,
  rows: 2,
}) satisfies BoardDimensions;

const WIDE_POSITION = Object.freeze({
  a1: Object.freeze({ id: 'white-king', pieceType: 'wK' }),
  c2: Object.freeze({ id: 'guide', pieceType: 'fairy' }),
  e3: Object.freeze({ id: 'black-king', pieceType: 'bK' }),
}) satisfies PositionObject;
const TALL_POSITION = Object.freeze({
  a1: Object.freeze({ id: 'white-king', pieceType: 'wK' }),
  b3: Object.freeze({ id: 'guide', pieceType: 'fairy' }),
  c5: Object.freeze({ id: 'black-king', pieceType: 'bK' }),
}) satisfies PositionObject;
const CONTROL_POSITION = Object.freeze({
  a1: Object.freeze({ id: 'control-white-king', pieceType: 'wK' }),
  b2: Object.freeze({ id: 'control-black-king', pieceType: 'bK' }),
}) satisfies PositionObject;

const Fairy: PieceRenderer = ({ size }) => (
  <View
    style={{
      alignItems: 'center',
      height: size,
      justifyContent: 'center',
      width: size,
    }}
  >
    <Text style={{ color: '#432a73', fontSize: size * 0.55 }}>F</Text>
  </View>
);

const EDITOR_RENDERERS = Object.freeze({
  ...defaultPieceRenderers,
  fairy: Fairy,
}) satisfies PieceRenderers;

function createPalette(
  generation: number,
): Readonly<Record<string, Readonly<PieceData>>> {
  return Object.freeze({
    'black-knight': Object.freeze({
      id: `black-knight-offer-${String(generation)}`,
      pieceType: 'bN',
    }),
    fairy: Object.freeze({
      id: `fairy-offer-${String(generation)}`,
      pieceType: 'fairy',
    }),
  });
}

type DemoPosition = Omit<ControlledPosition, 'value'> & {
  readonly value: PositionObject;
};

type DecisionMode = 'accept' | 'reject';

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
  palette: Readonly<Record<string, Readonly<PieceData>>>,
): Readonly<DemoPosition> | null {
  if (
    intent.boardId !== BOARD_ID ||
    intent.basePositionRevision !== current.revision
  ) {
    return null;
  }

  if (intent.source.kind === 'spare') {
    const palettePiece = palette[intent.source.spareId];
    if (
      !piecesMatch(palettePiece, intent.piece) ||
      intent.targetSquare === null
    ) {
      return null;
    }
  } else if (!piecesMatch(current.value[intent.source.square], intent.piece)) {
    return null;
  }

  const value: Record<string, Readonly<PieceData>> = {};
  for (const [square, piece] of Object.entries(current.value)) {
    if (
      piece !== undefined &&
      (intent.source.kind === 'spare' || square !== intent.source.square)
    ) {
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

function sourceLabel(intent: Readonly<MoveIntent>): string {
  return intent.source.kind === 'spare'
    ? `spare ${intent.source.spareId}`
    : `board square ${intent.source.square}`;
}

export default function SparePiecesExample() {
  const [dimensions, setDimensions] =
    useState<BoardDimensions>(WIDE_DIMENSIONS);
  const [orientation, setOrientation] = useState<BoardOrientation>('black');
  const [offerGeneration, setOfferGeneration] = useState(1);
  const [position, setPosition] = useState<DemoPosition>({
    revision: 0,
    value: WIDE_POSITION,
  });
  const [decisionMode, setDecisionMode] = useState<DecisionMode>('accept');
  const [status, setStatus] = useState(
    'Select a spare, then tap a square, drag it directly, or use the board actions menu.',
  );
  const palette = useMemo(
    () => createPalette(offerGeneration),
    [offerGeneration],
  );

  const onMoveRequest = useCallback<OnMoveRequest>(
    (intent) => {
      if (decisionMode === 'reject') {
        setStatus(
          `Consumer rejected ${sourceLabel(intent)} → ${intent.targetSquare ?? 'off board'}; the controlled position is unchanged.`,
        );
        return { status: 'rejected', reason: 'Example rejection mode' };
      }

      const next = applyIntent(position, intent, palette);
      if (next === null) {
        setStatus(
          `Consumer rejected an obsolete, unknown, or off-board spare request from ${sourceLabel(intent)}.`,
        );
        return { status: 'rejected', reason: 'Request is not current' };
      }

      setPosition(next);
      if (intent.source.kind === 'spare') {
        setOfferGeneration((current) => current + 1);
      }
      setStatus(
        `Committed ${sourceLabel(intent)} → ${intent.targetSquare ?? 'off board'} as controlled revision ${String(next.revision)}.`,
      );
      return { status: 'accepted' };
    },
    [decisionMode, palette, position],
  );

  const onControlMoveRequest = useCallback<OnMoveRequest>((intent) => {
    const spareLeak = intent.source.kind === 'spare';
    setStatus(
      spareLeak
        ? 'Isolation failure: the unrelated control board received a spare placement request.'
        : 'The unrelated control board rejected its local test move; its position remains unchanged.',
    );
    return {
      status: 'rejected',
      reason: spareLeak
        ? 'A targeted spare leaked to the unrelated board'
        : 'The control board is intentionally non-mutating',
    };
  }, []);

  const switchDimensions = useCallback((): void => {
    const nextIsTall = dimensions.columns === WIDE_DIMENSIONS.columns;
    const nextDimensions = nextIsTall ? TALL_DIMENSIONS : WIDE_DIMENSIONS;
    const nextValue = nextIsTall ? TALL_POSITION : WIDE_POSITION;
    setDimensions(nextDimensions);
    setPosition((current) => ({
      revision: current.revision + 1,
      value: nextValue,
    }));
    setOfferGeneration((current) => current + 1);
    setStatus(
      `Consumer atomically published the ${String(nextDimensions.columns)}×${String(nextDimensions.rows)} preset and a compatible object position.`,
    );
  }, [dimensions.columns]);

  return (
    <ScrollView
      contentContainerStyle={styles.content}
      contentInsetAdjustmentBehavior="automatic"
      style={styles.screen}
    >
      <Text style={styles.eyebrow}>PHASE 5 · VARIANT EDITOR HARDENING</Text>
      <Text style={styles.title}>Controlled variant position editor</Text>
      <Text style={styles.description}>
        This rectangular, rules-free board combines a custom piece vocabulary,
        reusable spare offers, orientation changes, and dimension presets. Every
        piece edit is still a move request against the consumer's current
        controlled revision.
      </Text>

      <ChessboardProvider>
        <View style={styles.paletteCard}>
          <Text style={styles.cardTitle}>Reusable palette</Text>
          <Text style={styles.instructions}>
            Tap a spare and then tap a board square, drag it directly, or use
            the board's Place selected spare accessibility action. Each offered
            piece has a fresh stable ID; after a successful placement the
            palette publishes the next reusable offer.
          </Text>
          <View style={styles.paletteRow}>
            <View style={styles.spareOption}>
              <SparePiece
                accessibilityHint="Select this custom fairy offer for placement on the editor board."
                accessibilityLabel="Fairy spare piece"
                piece={palette.fairy}
                pieceRenderers={EDITOR_RENDERERS}
                size={64}
                spareId="fairy"
                style={styles.sparePiece}
                targetBoardId={BOARD_ID}
              />
              <Text style={styles.spareLabel}>Fairy</Text>
            </View>
            <View style={styles.spareOption}>
              <SparePiece
                accessibilityHint="Select this reusable knight for placement on the editor board."
                accessibilityLabel="Black knight spare piece"
                piece={palette['black-knight'] ?? { pieceType: 'bN' }}
                pieceRenderers={EDITOR_RENDERERS}
                size={64}
                spareId="black-knight"
                style={styles.sparePiece}
                targetBoardId={BOARD_ID}
              />
              <Text style={styles.spareLabel}>Black knight</Text>
            </View>
          </View>
        </View>

        <View style={styles.boardCard}>
          <Text style={styles.cardTitle}>Position editor</Text>
          <Chessboard
            accessibility={{
              boardHint:
                'Tap a selected spare onto a square, or navigate to a destination and use the actions menu to place or cancel it.',
              boardLabel: `Variant editor board, ${orientation} orientation`,
            }}
            boardId={BOARD_ID}
            dimensions={dimensions}
            onMoveRequest={onMoveRequest}
            orientation={orientation}
            pieceRenderers={EDITOR_RENDERERS}
            position={position}
            reduceMotion="always"
          />
          <Text style={styles.status}>
            {dimensions.columns}×{dimensions.rows} · {orientation} orientation ·
            revision {position.revision} · next decision: {decisionMode}
            {`\n`}
            {status}
          </Text>
        </View>

        <View style={styles.controlBoardCard}>
          <Text style={styles.cardTitle}>Unrelated control board</Text>
          <Text style={styles.instructions}>
            This non-mutating board has its own rejecting move callback, shares
            the provider, and is not the palette's named target. After selecting
            a spare, it must never expose place or cancel-spare actions.
          </Text>
          <View style={styles.controlBoard}>
            <Chessboard
              accessibility={{
                boardHint:
                  'Confirm that selected spare actions remain exclusive to the named variant editor board.',
                boardLabel: 'Unrelated control board, white orientation',
              }}
              boardId={CONTROL_BOARD_ID}
              dimensions={CONTROL_DIMENSIONS}
              interactionPermissions={{ accessibility: true, drag: false }}
              onMoveRequest={onControlMoveRequest}
              pieceRenderers={EDITOR_RENDERERS}
              position={CONTROL_POSITION}
              reduceMotion="always"
            />
          </View>
        </View>
      </ChessboardProvider>

      <View style={styles.controlsCard}>
        <Text style={styles.cardTitle}>Consumer controls</Text>
        <View style={styles.controls}>
          <Pressable
            accessibilityRole="button"
            onPress={() => {
              setDecisionMode((current) =>
                current === 'accept' ? 'reject' : 'accept',
              );
            }}
            style={styles.primaryButton}
          >
            <Text style={styles.primaryButtonText}>Toggle accept / reject</Text>
          </Pressable>
          <Pressable
            accessibilityRole="button"
            onPress={() => {
              setOrientation((current) =>
                current === 'white' ? 'black' : 'white',
              );
              setStatus(
                'Consumer changed presentation orientation; canonical square IDs and position state were not rewritten.',
              );
            }}
            style={styles.secondaryButton}
          >
            <Text style={styles.secondaryButtonText}>Toggle orientation</Text>
          </Pressable>
          <Pressable
            accessibilityRole="button"
            onPress={switchDimensions}
            style={styles.secondaryButton}
          >
            <Text style={styles.secondaryButtonText}>
              Switch 5×3 / 3×5 preset
            </Text>
          </Pressable>
          <Pressable
            accessibilityRole="button"
            onPress={() => {
              setPosition((current) => ({
                revision: current.revision + 1,
                value:
                  dimensions.columns === WIDE_DIMENSIONS.columns
                    ? WIDE_POSITION
                    : TALL_POSITION,
              }));
              setOfferGeneration((current) => current + 1);
              setStatus(
                'Consumer published an unrelated controlled reset; no component-owned position was restored.',
              );
            }}
            style={styles.secondaryButton}
          >
            <Text style={styles.secondaryButtonText}>
              Reset controlled position
            </Text>
          </Pressable>
        </View>
      </View>

      <Text style={styles.boundary}>
        Variant positions use sparse object positions; FEN remains 8×8-only.
        Dimension changes publish a compatible object position and newer
        revision together. Board moves preserve stable IDs, while every reusable
        palette offer receives a fresh ID before it can be placed.
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
  boundary: {
    color: '#665c4d',
    fontSize: 14,
    lineHeight: 21,
    maxWidth: 520,
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
  controlsCard: {
    backgroundColor: '#ffffff',
    borderColor: '#d9d0c3',
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    gap: 12,
    maxWidth: 520,
    padding: 16,
    width: '100%',
  },
  controlBoard: {
    alignSelf: 'center',
    maxWidth: 240,
    width: '100%',
  },
  controlBoardCard: {
    backgroundColor: '#ffffff',
    borderColor: '#d9d0c3',
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    gap: 12,
    maxWidth: 520,
    padding: 14,
    width: '100%',
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
  instructions: {
    color: '#665c4d',
    fontSize: 14,
    lineHeight: 21,
  },
  paletteCard: {
    backgroundColor: '#eee7da',
    borderColor: '#d9d0c3',
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    gap: 12,
    maxWidth: 520,
    padding: 16,
    width: '100%',
  },
  paletteRow: {
    flexDirection: 'row',
    gap: 20,
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
  screen: {
    backgroundColor: '#f7f4ee',
  },
  secondaryButton: {
    alignItems: 'center',
    borderColor: '#2f5f4f',
    borderRadius: 10,
    borderWidth: 1,
    justifyContent: 'center',
    minHeight: 48,
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  secondaryButtonText: {
    color: '#2f5f4f',
    fontSize: 15,
    fontWeight: '700',
  },
  spareLabel: {
    color: '#3f392f',
    fontSize: 13,
    fontWeight: '600',
  },
  spareOption: {
    alignItems: 'center',
    gap: 6,
  },
  sparePiece: {
    backgroundColor: '#ffffff',
    borderColor: '#b9ac9a',
    borderRadius: 10,
    borderWidth: StyleSheet.hairlineWidth,
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
    letterSpacing: -0.7,
    maxWidth: 520,
    width: '100%',
  },
});
