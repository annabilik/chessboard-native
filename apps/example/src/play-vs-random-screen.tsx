import {
  Chessboard,
  type PieceData,
  type ControlledPosition,
  type OnMoveRequest,
  type OnSquareActivate,
  type PlainSelection,
  type PositionObject,
} from '@vibechess/chessboard-native';
import { Chess, type Move, type Square } from 'chess.js';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { applyVerboseMove, positionFromChess } from './chess-demo';

const COMPUTER_REPLY_DELAY_MS = 450;

type DemoPosition = Omit<ControlledPosition, 'value'> & {
  readonly value: PositionObject;
};

function describeGame(chess: Chess): string {
  if (chess.isCheckmate()) {
    return chess.turn() === 'w'
      ? 'Checkmate — the computer wins.'
      : 'Checkmate — you win.';
  }
  if (chess.isDraw()) {
    return 'Draw.';
  }
  const side = chess.turn() === 'w' ? 'White' : 'Black';
  return chess.isCheck() ? `${side} to move, check.` : `${side} to move.`;
}

export default function PlayVsRandomScreen() {
  const [chess] = useState(() => new Chess());
  const [position, setPosition] = useState<DemoPosition>(() => ({
    revision: 0,
    value: positionFromChess(chess),
  }));
  const [selection, setSelection] = useState<PlainSelection | undefined>(
    undefined,
  );
  const [status, setStatus] = useState('White to move.');
  const [computerThinking, setComputerThinking] = useState(false);
  const revisionRef = useRef(0);
  const replyTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const replyGenerationRef = useRef(0);
  const computerThinkingRef = useRef(false);

  useEffect(
    () => () => {
      replyGenerationRef.current += 1;
      computerThinkingRef.current = false;
      if (replyTimeoutRef.current !== null) {
        clearTimeout(replyTimeoutRef.current);
      }
    },
    [],
  );

  const publish = useCallback((move: Move, committedIntentId?: string) => {
    revisionRef.current += 1;
    setPosition((current) => ({
      revision: revisionRef.current,
      value: applyVerboseMove(current.value, move),
      ...(committedIntentId === undefined ? {} : { committedIntentId }),
    }));
  }, []);

  const scheduleComputerReply = useCallback(
    (expectedRevision: number) => {
      if (replyTimeoutRef.current !== null) {
        clearTimeout(replyTimeoutRef.current);
      }
      const generation = replyGenerationRef.current + 1;
      replyGenerationRef.current = generation;
      computerThinkingRef.current = true;
      setComputerThinking(true);
      replyTimeoutRef.current = setTimeout(() => {
        if (replyGenerationRef.current !== generation) {
          return;
        }
        replyTimeoutRef.current = null;
        if (
          revisionRef.current !== expectedRevision ||
          chess.turn() !== 'b' ||
          chess.isGameOver()
        ) {
          computerThinkingRef.current = false;
          setComputerThinking(false);
          setStatus(describeGame(chess));
          return;
        }
        const replies = chess.moves({ verbose: true });
        if (replies.length === 0) {
          computerThinkingRef.current = false;
          setComputerThinking(false);
          setStatus(describeGame(chess));
          return;
        }
        const reply = replies[Math.floor(Math.random() * replies.length)];
        const played = chess.move(reply.san);
        publish(played);
        computerThinkingRef.current = false;
        setComputerThinking(false);
        setStatus(describeGame(chess));
      }, COMPUTER_REPLY_DELAY_MS);
    },
    [chess, publish],
  );

  // chess.js is the rules engine: it validates the intent, and the accepted
  // decision only permits pending presentation. The next controlled position,
  // correlated through committedIntentId, is the actual commit.
  const onMoveRequest: OnMoveRequest = useCallback(
    (intent) => {
      if (intent.source.kind !== 'board' || intent.targetSquare === null) {
        return { status: 'rejected', reason: 'Move a board piece.' };
      }
      if (
        computerThinkingRef.current ||
        chess.turn() !== 'w' ||
        !intent.piece.pieceType.startsWith('w')
      ) {
        return {
          status: 'rejected',
          reason: 'You play White. Wait for the computer reply.',
        };
      }
      if (intent.basePositionRevision !== revisionRef.current) {
        return { status: 'rejected', reason: 'Stale position.' };
      }
      try {
        const move = chess.move({
          from: intent.source.square,
          to: intent.targetSquare,
          promotion: 'q',
        });
        setSelection(undefined);
        publish(move, intent.intentId);
        setStatus(describeGame(chess));
        if (!chess.isGameOver()) {
          const expectedRevision = revisionRef.current;
          setStatus(`${describeGame(chess)} Computer thinking…`);
          scheduleComputerReply(expectedRevision);
        }
        return { status: 'accepted' };
      } catch {
        return { status: 'rejected', reason: 'Illegal move.' };
      }
    },
    [chess, publish, scheduleComputerReply],
  );

  // Tapping a piece publishes its chess.js legal destinations as controlled
  // selection; tapping a published destination then routes to onMoveRequest.
  const onSquareActivate = useCallback<OnSquareActivate>(
    (intent) => {
      if (intent.action === 'clear-selection' || intent.piece === null) {
        setSelection(undefined);
        return;
      }
      if (
        computerThinkingRef.current ||
        chess.turn() !== 'w' ||
        !intent.piece.pieceType.startsWith('w')
      ) {
        setSelection(undefined);
        return;
      }
      const destinations = chess
        .moves({ square: intent.square as Square, verbose: true })
        .map((move) => move.to);
      setSelection({
        destinationSquares: destinations,
        selectedSquare: intent.square,
      });
    },
    [chess],
  );

  const onNewGame = useCallback(() => {
    replyGenerationRef.current += 1;
    if (replyTimeoutRef.current !== null) {
      clearTimeout(replyTimeoutRef.current);
      replyTimeoutRef.current = null;
    }
    computerThinkingRef.current = false;
    setComputerThinking(false);
    chess.reset();
    revisionRef.current += 1;
    setPosition({
      revision: revisionRef.current,
      value: positionFromChess(chess),
    });
    setSelection(undefined);
    setStatus('White to move.');
  }, [chess]);

  return (
    <ScrollView contentContainerStyle={styles.content} style={styles.screen}>
      <Text style={styles.title}>Play vs random (chess.js)</Text>
      <Text style={styles.description}>
        chess.js owns the rules. Drag a piece, or tap it to see its legal moves
        and tap a destination. Illegal moves snap back; pawns promote to a queen
        for simplicity. You always play White; input is locked while the
        computer chooses a random legal Black move.
      </Text>
      <Text style={styles.status}>{status}</Text>
      <View style={styles.boardFrame}>
        <Chessboard
          boardId="play-vs-random"
          canDragPiece={({ piece }: { readonly piece: PieceData }) =>
            !computerThinking &&
            chess.turn() === 'w' &&
            piece.pieceType.startsWith('w')
          }
          interactionPermissions={{
            accessibility: !computerThinking,
            drag: !computerThinking,
          }}
          onMoveRequest={onMoveRequest}
          onSquareActivate={onSquareActivate}
          position={position}
          {...(selection === undefined ? {} : { selection })}
        />
      </View>
      <Pressable
        accessibilityRole="button"
        onPress={onNewGame}
        style={styles.button}
      >
        <Text style={styles.buttonText}>New game</Text>
      </Pressable>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  boardFrame: {
    alignSelf: 'center',
    maxWidth: 520,
    width: '100%',
  },
  button: {
    alignItems: 'center',
    alignSelf: 'center',
    backgroundColor: '#236a5b',
    borderRadius: 8,
    minHeight: 48,
    justifyContent: 'center',
    paddingHorizontal: 20,
    paddingVertical: 12,
  },
  buttonText: {
    color: '#ffffff',
    fontSize: 15,
    fontWeight: '700',
  },
  content: {
    flexGrow: 1,
    gap: 12,
    padding: 20,
  },
  description: {
    color: '#4e4b45',
    fontSize: 15,
    lineHeight: 21,
  },
  screen: {
    backgroundColor: '#f4f1eb',
  },
  status: {
    color: '#1d1c19',
    fontSize: 16,
    fontWeight: '600',
  },
  title: {
    color: '#1d1c19',
    fontSize: 24,
    fontWeight: '700',
  },
});
