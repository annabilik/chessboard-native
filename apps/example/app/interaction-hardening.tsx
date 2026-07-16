import {
  Chessboard,
  ChessboardProvider,
  SparePiece,
  type ControlledPosition,
  type MoveIntent,
  type OnMoveRequest,
  type PieceData,
  type PieceRenderer,
  type PieceRenderers,
  type PositionObject,
} from '@vibechess/chessboard-native';
import { defaultPieceRenderers } from '@vibechess/chessboard-native/pieces';
import {
  Profiler,
  createContext,
  memo,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ProfilerOnRenderCallback,
  type RefObject,
} from 'react';
import {
  AppState,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';

const BOARD_ID = 'interaction-hardening-board';

const INITIAL_POSITION = Object.freeze({
  a1: Object.freeze({ id: 'white-rook', pieceType: 'wR' }),
  b1: Object.freeze({ id: 'white-knight', pieceType: 'wN' }),
  e2: Object.freeze({ id: 'white-pawn', pieceType: 'wP' }),
  e7: Object.freeze({ id: 'black-pawn', pieceType: 'bP' }),
  g8: Object.freeze({ id: 'black-knight', pieceType: 'bN' }),
  h8: Object.freeze({ id: 'black-rook', pieceType: 'bR' }),
}) satisfies PositionObject;

const SPARE_PIECE = Object.freeze({
  pieceType: 'wQ',
}) satisfies PieceData;

type DemoPosition = Omit<ControlledPosition, 'value'> & {
  readonly value: PositionObject;
};

interface InteractionCounters {
  appStateChanges: number;
  boardCommits: number;
  moveRequests: number;
  pieceRendererCalls: number;
  scrollEvents: number;
}

const EMPTY_COUNTERS: Readonly<InteractionCounters> = Object.freeze({
  appStateChanges: 0,
  boardCommits: 0,
  moveRequests: 0,
  pieceRendererCalls: 0,
  scrollEvents: 0,
});

const MetricsContext = createContext<RefObject<InteractionCounters> | null>(
  null,
);

const InstrumentedPiece: PieceRenderer = (props) => {
  const metrics = useContext(MetricsContext);
  if (metrics !== null) {
    metrics.current.pieceRendererCalls += 1;
  }

  const DefaultRenderer = defaultPieceRenderers[props.piece.pieceType];
  return DefaultRenderer === undefined ? null : <DefaultRenderer {...props} />;
};

const instrumentedPieceRenderers = Object.freeze(
  Object.fromEntries(
    Object.keys(defaultPieceRenderers).map((pieceType) => [
      pieceType,
      InstrumentedPiece,
    ]),
  ),
) satisfies PieceRenderers;

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
): Readonly<DemoPosition> | null {
  if (
    intent.boardId !== BOARD_ID ||
    intent.basePositionRevision !== current.revision
  ) {
    return null;
  }

  if (
    intent.source.kind === 'board' &&
    !piecesMatch(current.value[intent.source.square], intent.piece)
  ) {
    return null;
  }
  if (
    intent.source.kind === 'spare' &&
    (!piecesMatch(SPARE_PIECE, intent.piece) || intent.targetSquare === null)
  ) {
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

interface InstrumentedBoardProps {
  readonly metrics: RefObject<InteractionCounters>;
}

const InstrumentedBoard = memo(function InstrumentedBoard({
  metrics,
}: InstrumentedBoardProps) {
  const [position, setPosition] = useState<DemoPosition>({
    revision: 0,
    value: INITIAL_POSITION,
  });
  const [status, setStatus] = useState(
    'Drag a board piece or the clipped queen palette source.',
  );

  const onMoveRequest = useCallback<OnMoveRequest>(
    (intent) => {
      metrics.current.moveRequests += 1;
      const next = applyIntent(position, intent);
      const accepted = next !== null;
      if (next !== null) {
        setPosition(next);
      }
      setStatus(
        accepted
          ? `Committed ${intent.source.kind === 'board' ? intent.source.square : intent.source.spareId} → ${intent.targetSquare ?? 'off board'}.`
          : 'Rejected a stale or unsupported request.',
      );

      return accepted
        ? { status: 'accepted' }
        : { status: 'rejected', reason: 'Request is not current' };
    },
    [metrics, position],
  );
  const onRender = useCallback<ProfilerOnRenderCallback>(() => {
    metrics.current.boardCommits += 1;
  }, [metrics]);

  return (
    <View style={styles.boardCard}>
      <Text style={styles.cardTitle}>Board inside a vertical ScrollView</Text>
      <Text style={styles.instructions}>
        Swipe from empty board space to scroll. Drag from a piece to keep the
        move interaction. Continuous pointer frames should not invoke the
        consumer callback or rerender custom piece artwork.
      </Text>
      <Profiler id="interaction-board" onRender={onRender}>
        <Chessboard
          accessibility={{
            boardLabel: 'Interaction-hardening board, white orientation',
          }}
          boardId={BOARD_ID}
          onMoveRequest={onMoveRequest}
          pieceRenderers={instrumentedPieceRenderers}
          position={position}
          reduceMotion="always"
        />
      </Profiler>
      <Text style={styles.status}>
        Controlled revision {position.revision}
        {`\n`}
        {status}
      </Text>
    </View>
  );
});

export default function InteractionHardeningExample() {
  const metrics = useRef<InteractionCounters>({ ...EMPTY_COUNTERS });
  const [snapshot, setSnapshot] =
    useState<Readonly<InteractionCounters>>(EMPTY_COUNTERS);
  const [geometryRevision, setGeometryRevision] = useState(0);
  const [boardMounted, setBoardMounted] = useState(true);
  const [appState, setAppState] = useState(AppState.currentState);

  useEffect(() => {
    const subscription = AppState.addEventListener('change', (nextState) => {
      metrics.current.appStateChanges += 1;
      setAppState(nextState);
    });
    return () => {
      subscription.remove();
    };
  }, []);

  const refreshSnapshot = useCallback(() => {
    setSnapshot({ ...metrics.current });
  }, []);

  return (
    <ScrollView
      contentContainerStyle={styles.content}
      contentInsetAdjustmentBehavior="automatic"
      onScroll={() => {
        metrics.current.scrollEvents += 1;
      }}
      scrollEventThrottle={16}
      style={styles.screen}
    >
      <Text style={styles.eyebrow}>PHASE 2 · INTERACTION HARDENING</Text>
      <Text style={styles.title}>Native arbitration and cancellation lab</Text>
      <Text style={styles.description}>
        This route keeps the component fully controlled while exercising a
        standard React Native ScrollView, a clipping palette, provider-level
        overlay projection, geometry invalidation, unmount cleanup, and app
        lifecycle cancellation.
      </Text>

      <MetricsContext.Provider value={metrics}>
        <ChessboardProvider geometryRevision={geometryRevision}>
          <View style={styles.clippedPalette}>
            <Text style={styles.cardTitle}>Clipped source palette</Text>
            <Text style={styles.instructions}>
              This card deliberately uses overflow hidden. Drag the queen out of
              the card and onto the board; the provider-level pointerless
              overlay remains outside this source clipping boundary.
            </Text>
            <View style={styles.paletteViewport}>
              <SparePiece
                accessibilityLabel="Clipped white queen spare piece"
                piece={SPARE_PIECE}
                pieceRenderers={instrumentedPieceRenderers}
                size={68}
                spareId="clipped-white-queen"
                style={styles.sparePiece}
                targetBoardId={BOARD_ID}
              />
            </View>
          </View>

          {boardMounted ? (
            <InstrumentedBoard metrics={metrics} />
          ) : (
            <View style={styles.unmountedCard}>
              <Text style={styles.cardTitle}>Board unmounted</Text>
              <Text style={styles.instructions}>
                Any active gesture, pending callback work, overlay lease, or
                stale native terminal signal must now be inert.
              </Text>
            </View>
          )}
        </ChessboardProvider>
      </MetricsContext.Provider>

      <View style={styles.controlsCard}>
        <Text style={styles.cardTitle}>Cancellation controls</Text>
        <Text style={styles.instructions}>
          Increment geometry after ancestor scrolling or transforms that do not
          emit a board layout event. Backgrounding the app must also cancel
          active interaction work before a late release can emit.
        </Text>
        <View style={styles.controls}>
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
          <Pressable
            accessibilityRole="button"
            onPress={() => {
              setBoardMounted((current) => !current);
            }}
            style={styles.secondaryButton}
          >
            <Text style={styles.secondaryButtonText}>
              {boardMounted ? 'Unmount board' : 'Remount board'}
            </Text>
          </Pressable>
        </View>
        <Text style={styles.status}>
          Geometry revision {geometryRevision} · AppState {appState}
        </Text>
      </View>

      <View style={styles.metricsCard}>
        <Text style={styles.cardTitle}>App-owned evidence counters</Text>
        <Text style={styles.instructions}>
          Take a baseline, perform a long drag, then refresh. Pointer-frame
          movement should add neither board commits nor consumer move callbacks;
          activation and release may add bounded renderer/commit work.
        </Text>
        <View style={styles.metricGrid}>
          <Metric label="Board subtree commits" value={snapshot.boardCommits} />
          <Metric
            label="Piece renderer calls"
            value={snapshot.pieceRendererCalls}
          />
          <Metric label="Move callbacks" value={snapshot.moveRequests} />
          <Metric label="Scroll events" value={snapshot.scrollEvents} />
          <Metric label="AppState changes" value={snapshot.appStateChanges} />
        </View>
        <Pressable
          accessibilityRole="button"
          onPress={refreshSnapshot}
          style={styles.primaryButton}
        >
          <Text style={styles.primaryButtonText}>Refresh counter snapshot</Text>
        </Pressable>
      </View>

      <Text style={styles.boundary}>
        The provider overlay fixes clipping inside a source palette; consumers
        should still place the provider above any ancestor that intentionally
        clips the entire interaction region. The library arbitrates native
        scrolling but never programmatically auto-scrolls an ancestor.
      </Text>
    </ScrollView>
  );
}

function Metric({
  label,
  value,
}: {
  readonly label: string;
  readonly value: number;
}) {
  return (
    <View style={styles.metric}>
      <Text style={styles.metricValue}>{value}</Text>
      <Text style={styles.metricLabel}>{label}</Text>
    </View>
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
  clippedPalette: {
    backgroundColor: '#eee7da',
    borderColor: '#9d8262',
    borderRadius: 12,
    borderWidth: 1,
    gap: 12,
    maxWidth: 520,
    overflow: 'hidden',
    padding: 16,
    width: '100%',
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
  metric: {
    backgroundColor: '#f7f4ee',
    borderRadius: 10,
    flexBasis: '47%',
    flexGrow: 1,
    minHeight: 92,
    padding: 12,
  },
  metricGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  metricLabel: {
    color: '#665c4d',
    fontSize: 13,
    lineHeight: 18,
  },
  metricValue: {
    color: '#236a5b',
    fontSize: 26,
    fontWeight: '800',
  },
  metricsCard: {
    backgroundColor: '#ffffff',
    borderColor: '#d9d0c3',
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    gap: 12,
    maxWidth: 520,
    padding: 16,
    width: '100%',
  },
  paletteViewport: {
    alignItems: 'center',
    alignSelf: 'flex-start',
    backgroundColor: '#d6c7b3',
    borderRadius: 10,
    height: 58,
    justifyContent: 'flex-start',
    overflow: 'hidden',
    width: 92,
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
  sparePiece: {
    backgroundColor: '#ffffff',
    borderColor: '#9d8262',
    borderRadius: 10,
    borderWidth: 1,
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
  unmountedCard: {
    backgroundColor: '#fff9ef',
    borderColor: '#c9a969',
    borderRadius: 12,
    borderWidth: 1,
    gap: 8,
    maxWidth: 520,
    minHeight: 140,
    padding: 16,
    width: '100%',
  },
});
