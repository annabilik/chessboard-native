import {
  Chessboard,
  ChessboardProvider,
  SparePiece,
  type OnMoveRequest,
  type SquareId,
} from '@vibechess/chessboard-native';
import { defaultPieceRenderers } from '@vibechess/chessboard-native/pieces';
import { useCallback, useState } from 'react';
import { ScrollView, StatusBar, StyleSheet, Text, View } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';

const AUDIT_BOARD_LABEL = 'Accessibility audit board, white orientation';
const AUDIT_BOARD_HINT =
  'Swipe up or down through squares, or use directional accessibility actions.';
const INTERACTION_BOARD_LABEL = 'Interaction test board, white orientation';
const INTERACTION_POSITION = Object.freeze({
  revision: 7,
  value: Object.freeze({
    d4: Object.freeze({ id: 'interaction-knight', pieceType: 'wN' }),
  }),
});
const INTERACTION_SPARE = Object.freeze({
  id: 'clipped-white-queen',
  pieceType: 'wQ',
});
const rejectAuditMove: OnMoveRequest = () => ({
  reason: 'Native audit fixture never commits moves.',
  status: 'rejected',
});

interface AppProps {
  readonly fixture?: 'accessibility' | 'interaction' | 'interaction-lifecycle';
}

function AccessibilityFixture() {
  return (
    <View style={styles.auditContent}>
      <Text style={styles.title}>Native accessibility audit</Text>
      <Text style={styles.description}>
        Packed release · one controlled accessibility surface
      </Text>
      <View style={styles.board}>
        <Chessboard
          accessibility={{
            boardHint: AUDIT_BOARD_HINT,
            boardLabel: AUDIT_BOARD_LABEL,
          }}
          boardId="native-accessibility-audit"
          interactionPermissions={{ accessibility: true, drag: true }}
          onMoveRequest={rejectAuditMove}
          pieceRenderers={defaultPieceRenderers}
          position={{
            revision: 0,
            value: { d4: { pieceType: 'wN' } },
          }}
          reduceMotion="always"
          selection={{ selectedSquare: 'd4' }}
        />
      </View>
    </View>
  );
}

function InteractionStatus({
  abortCount,
  callbackCount,
  decision,
  lastSource,
  lastTarget,
}: {
  readonly abortCount: number;
  readonly callbackCount: number;
  readonly decision: 'aborted' | 'none' | 'pending' | 'rejected';
  readonly lastSource: string;
  readonly lastTarget: SquareId | null;
}) {
  return (
    <View style={styles.interactionStatus}>
      <Text style={styles.title}>Native interaction fixture</Text>
      <Text
        accessibilityLabel={`Callback count: ${String(callbackCount)}`}
        testID="interaction:callback-count"
      >
        Callback count: {callbackCount}
      </Text>
      <Text
        accessibilityLabel={`Abort count: ${String(abortCount)}`}
        testID="interaction:abort-count"
      >
        Abort count: {abortCount}
      </Text>
      <Text
        accessibilityLabel={`Last target: ${lastTarget ?? 'none'}`}
        testID="interaction:last-target"
      >
        Last target: {lastTarget ?? 'none'}
      </Text>
      <Text
        accessibilityLabel={`Last source: ${lastSource}`}
        testID="interaction:last-source"
      >
        Last source: {lastSource}
      </Text>
      <Text
        accessibilityLabel={`Position revision: ${String(INTERACTION_POSITION.revision)}`}
        testID="interaction:position-revision"
      >
        Position revision: {INTERACTION_POSITION.revision}
      </Text>
      <Text
        accessibilityLabel={`Decision: ${decision}`}
        testID="interaction:decision"
      >
        Decision: {decision}
      </Text>
    </View>
  );
}

function InteractionFixture({
  pendingUntilAbort = false,
}: {
  readonly pendingUntilAbort?: boolean;
}) {
  const [abortCount, setAbortCount] = useState(0);
  const [callbackCount, setCallbackCount] = useState(0);
  const [decision, setDecision] = useState<
    'aborted' | 'none' | 'pending' | 'rejected'
  >('none');
  const [lastSource, setLastSource] = useState('none');
  const [lastTarget, setLastTarget] = useState<SquareId | null>(null);
  const rejectMove = useCallback<OnMoveRequest>(
    (intent, context) => {
      setCallbackCount((count) => count + 1);
      setLastSource(
        intent.source.kind === 'board'
          ? `board:${intent.source.square}`
          : `spare:${intent.source.spareId}`,
      );
      setLastTarget(intent.targetSquare);
      if (!pendingUntilAbort) {
        setDecision('rejected');
        return {
          reason: 'Native interaction fixture deliberately rejects every move.',
          status: 'rejected',
        };
      }

      setDecision('pending');
      return new Promise((resolve) => {
        const abort = () => {
          setAbortCount((count) => count + 1);
          setDecision('aborted');
          resolve({
            reason: 'Native lifecycle fixture observed cancellation.',
            status: 'rejected',
          });
        };
        if (context.signal.aborted) {
          abort();
          return;
        }
        context.signal.addEventListener('abort', abort, { once: true });
      });
    },
    [pendingUntilAbort],
  );

  return (
    <View style={styles.interactionContent}>
      <InteractionStatus
        abortCount={abortCount}
        callbackCount={callbackCount}
        decision={decision}
        lastSource={lastSource}
        lastTarget={lastTarget}
      />
      <ScrollView
        contentContainerStyle={styles.interactionScrollContent}
        testID="interaction:scroll"
      >
        <ChessboardProvider>
          <View style={styles.scrollLead} />
          <View style={styles.board} testID="interaction:board-host">
            <Chessboard
              accessibility={{
                boardLabel: INTERACTION_BOARD_LABEL,
              }}
              boardId="native-interaction"
              interactionPermissions={{ accessibility: true, drag: true }}
              onMoveRequest={rejectMove}
              pieceRenderers={defaultPieceRenderers}
              position={INTERACTION_POSITION}
              reduceMotion="always"
            />
          </View>
          <View
            style={styles.clippedPalette}
            testID="interaction:clipped-palette"
          >
            <SparePiece
              accessibilityLabel="Clipped white queen spare"
              piece={INTERACTION_SPARE}
              pieceRenderers={defaultPieceRenderers}
              size={56}
              spareId="clipped-white-queen"
              targetBoardId="native-interaction"
            />
          </View>
          <Text style={styles.scrollInstructions}>
            Drag the knight from d4 to d5 or the clipped queen to e2. Swiping
            from an empty square must scroll this parent instead.
          </Text>
          <View style={styles.scrollTail} />
        </ChessboardProvider>
      </ScrollView>
    </View>
  );
}

export default function App({ fixture = 'accessibility' }: AppProps) {
  return (
    <GestureHandlerRootView style={styles.root}>
      <StatusBar barStyle="dark-content" />
      {fixture === 'interaction' || fixture === 'interaction-lifecycle' ? (
        <InteractionFixture
          pendingUntilAbort={fixture === 'interaction-lifecycle'}
        />
      ) : (
        <AccessibilityFixture />
      )}
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({
  root: {
    backgroundColor: '#f7f3ec',
    flex: 1,
  },
  auditContent: {
    alignItems: 'center',
    flex: 1,
    justifyContent: 'center',
    padding: 24,
  },
  title: {
    color: '#282520',
    fontSize: 24,
    fontWeight: '700',
  },
  description: {
    color: '#5d574f',
    fontSize: 14,
    marginBottom: 24,
    marginTop: 6,
  },
  board: {
    maxWidth: 480,
    width: '100%',
  },
  clippedPalette: {
    alignItems: 'center',
    alignSelf: 'stretch',
    backgroundColor: '#e3d8c7',
    borderRadius: 12,
    height: 76,
    justifyContent: 'center',
    marginTop: 16,
    maxWidth: 480,
    overflow: 'hidden',
    paddingHorizontal: 12,
  },
  interactionContent: {
    flex: 1,
  },
  interactionScrollContent: {
    alignItems: 'center',
    paddingHorizontal: 24,
  },
  interactionStatus: {
    borderBottomColor: '#d7d0c5',
    borderBottomWidth: StyleSheet.hairlineWidth,
    gap: 2,
    paddingBottom: 12,
    paddingHorizontal: 24,
    paddingTop: 16,
  },
  scrollInstructions: {
    color: '#5d574f',
    marginTop: 20,
    maxWidth: 480,
    textAlign: 'center',
  },
  scrollLead: {
    height: 16,
  },
  scrollTail: {
    height: 720,
  },
});
