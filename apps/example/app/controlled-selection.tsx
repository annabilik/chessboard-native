import {
  Chessboard,
  type ControlledPosition,
  type ControlledSelection,
  type OnMoveRequest,
  type OnSquareActivate,
  type PieceData,
  type PositionObject,
  type SquareId,
} from '@vibechess/chessboard-native';
import { Chess, type Move, type Square } from 'chess.js';
import { useCallback, useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';

import { applyVerboseMove, positionFromChess } from '../src/chess-demo';

const DISABLED_SQUARES = Object.freeze(['c3'] satisfies readonly SquareId[]);

type DemoPosition = ControlledPosition & {
  readonly value: PositionObject;
};

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

function commitMove(
  current: Readonly<DemoPosition>,
  move: Readonly<Move>,
  committedIntentId: string,
): Readonly<DemoPosition> {
  return Object.freeze({
    committedIntentId,
    revision: current.revision + 1,
    value: applyVerboseMove(current.value, move),
  });
}

function clearedSelection(
  current: Readonly<ControlledSelection>,
): ControlledSelection {
  return {
    destinationSquares: [],
    disabledSquares: DISABLED_SQUARES,
    revision: current.revision + 1,
    selectedSquare: null,
  };
}

export default function ControlledSelectionExample() {
  const [chess] = useState(() => new Chess());
  const [position, setPosition] = useState<DemoPosition>(() => ({
    revision: 0,
    value: positionFromChess(chess),
  }));
  const [selection, setSelection] = useState<ControlledSelection>({
    destinationSquares: [],
    disabledSquares: DISABLED_SQUARES,
    revision: 0,
    selectedSquare: null,
  });
  const [status, setStatus] = useState(
    'White to move. Select a white piece to publish its chess.js legal destinations.',
  );

  const onSquareActivate = useCallback<OnSquareActivate>(
    (intent) => {
      if (
        intent.basePositionRevision !== position.revision ||
        intent.baseSelectionRevision !== selection.revision
      ) {
        return;
      }

      if (
        intent.action === 'clear-selection' ||
        selection.selectedSquare === intent.square
      ) {
        setSelection(clearedSelection(selection));
        setStatus(
          `${intent.input} activation asked the consumer to clear ${selection.selectedSquare ?? 'selection'}.`,
        );
        return;
      }

      const piece = position.value[intent.square];
      if (piece?.pieceType.startsWith(chess.turn()) !== true) {
        setSelection(clearedSelection(selection));
        setStatus(
          `${intent.square} does not contain a ${chess.turn() === 'w' ? 'White' : 'Black'} piece that can move now.`,
        );
        return;
      }

      const destinationSquares = chess
        .moves({ square: intent.square as Square, verbose: true })
        .map((move) => move.to);
      setSelection({
        destinationSquares: Object.freeze(destinationSquares),
        disabledSquares: DISABLED_SQUARES,
        revision: selection.revision + 1,
        selectedSquare: intent.square,
      });
      setStatus(
        `${intent.input} activation selected ${intent.square}; chess.js published ${String(destinationSquares.length)} legal destination${destinationSquares.length === 1 ? '' : 's'}.`,
      );
    },
    [chess, position, selection],
  );

  const onMoveRequest = useCallback<OnMoveRequest>(
    (intent) => {
      if (
        intent.source.kind !== 'board' ||
        intent.targetSquare === null ||
        intent.basePositionRevision !== position.revision ||
        !piecesMatch(position.value[intent.source.square], intent.piece) ||
        DISABLED_SQUARES.includes(intent.targetSquare)
      ) {
        setStatus('The consumer rejected an obsolete or unsupported request.');
        return { status: 'rejected', reason: 'Example request is obsolete' };
      }

      let move: Move;
      try {
        move = chess.move({
          from: intent.source.square,
          promotion: 'q',
          to: intent.targetSquare,
        });
      } catch {
        setStatus('chess.js rejected the requested move as illegal.');
        return { status: 'rejected', reason: 'Illegal chess move' };
      }

      const nextPosition = commitMove(position, move, intent.intentId);
      setPosition(nextPosition);
      setSelection((current) => clearedSelection(current));
      setStatus(
        `${intent.input} submitted ${move.san}. chess.js accepted it; the consumer committed revision ${String(nextPosition.revision)} and cleared selection.`,
      );
      return { status: 'accepted' };
    },
    [chess, position],
  );
  const destinationSummary =
    selection.destinationSquares === undefined ||
    selection.destinationSquares.length === 0
      ? 'none'
      : selection.destinationSquares.join(', ');

  return (
    <ScrollView
      contentContainerStyle={styles.content}
      contentInsetAdjustmentBehavior="automatic"
      style={styles.screen}
    >
      <Text style={styles.eyebrow}>PHASE 2 · CONTROLLED SELECTION</Text>
      <Text style={styles.title}>Tap intents, not hidden state</Text>
      <Text style={styles.description}>
        Selection, destinations, disabled squares, and position all come from
        revisioned consumer state. The board emits one square activation or one
        destination move request; chess.js derives and validates the chess data,
        while the board never mutates either store value.
      </Text>

      <View style={styles.board}>
        <Chessboard
          accessibility={{
            boardHint:
              'Navigate to a square and activate it. Selected destinations submit a move request.',
            boardLabel: 'Controlled selection example, white orientation',
          }}
          boardId="controlled-selection"
          interactionPermissions={{ accessibility: true, drag: false }}
          onMoveRequest={onMoveRequest}
          onSquareActivate={onSquareActivate}
          position={position}
          reduceMotion="always"
          selection={selection}
        />
      </View>

      <View style={styles.card}>
        <Text style={styles.cardTitle}>Consumer state</Text>
        <Text style={styles.status}>
          Position revision {position.revision} · selection revision{' '}
          {selection.revision}
          {`\n`}
          Selected: {selection.selectedSquare ?? 'none'} · destinations:{' '}
          {destinationSummary}
          {`\n`}
          {status}
        </Text>
      </View>

      <Text style={styles.boundary}>
        chess.js runs only in this private example app; the published board
        remains rules-free. c3 is a legal b1-knight destination but an explicit
        consumer policy disables it, showing that policy presentation wins and
        activation is blocked. Activating the selected square again is another
        consumer policy that clears it.
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
  card: {
    backgroundColor: '#ffffff',
    borderColor: '#d9d0c3',
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    gap: 10,
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
    fontWeight: '700',
    letterSpacing: -0.7,
    maxWidth: 520,
    width: '100%',
  },
});
