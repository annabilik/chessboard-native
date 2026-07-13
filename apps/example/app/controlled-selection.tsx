import {
  Chessboard,
  type ControlledPosition,
  type ControlledSelection,
  type MoveIntent,
  type OnMoveRequest,
  type OnSquareActivate,
  type PieceData,
  type PositionObject,
  type SquareId,
} from '@vibechess/chessboard-native';
import { useCallback, useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';

const INITIAL_POSITION: PositionObject = Object.freeze({
  b1: Object.freeze({ id: 'white-knight', pieceType: 'wN' }),
  e2: Object.freeze({ id: 'white-pawn', pieceType: 'wP' }),
  e7: Object.freeze({ id: 'black-pawn', pieceType: 'bP' }),
  h8: Object.freeze({ id: 'black-rook', pieceType: 'bR' }),
});

const DESTINATIONS: Readonly<Partial<Record<SquareId, readonly SquareId[]>>> =
  Object.freeze({
    b1: Object.freeze(['a3', 'c3']),
    e2: Object.freeze(['e3', 'e4']),
    e7: Object.freeze(['e5', 'e6']),
    h8: Object.freeze(['h6', 'h7']),
  });

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

function applyMove(
  current: Readonly<DemoPosition>,
  intent: Readonly<MoveIntent>,
): Readonly<DemoPosition> | null {
  if (
    intent.source.kind !== 'board' ||
    intent.targetSquare === null ||
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
  value[intent.targetSquare] = intent.piece;

  return Object.freeze({
    committedIntentId: intent.intentId,
    revision: current.revision + 1,
    value: Object.freeze(value),
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
  const [position, setPosition] = useState<DemoPosition>({
    revision: 0,
    value: INITIAL_POSITION,
  });
  const [selection, setSelection] = useState<ControlledSelection>({
    destinationSquares: [],
    disabledSquares: DISABLED_SQUARES,
    revision: 0,
    selectedSquare: null,
  });
  const [status, setStatus] = useState(
    'Tap any square. Piece squares publish the example destinations from the consumer store.',
  );

  const onSquareActivate = useCallback<OnSquareActivate>(
    (intent) => {
      if (intent.baseSelectionRevision !== selection.revision) {
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

      const destinationSquares = DESTINATIONS[intent.square] ?? [];
      setSelection({
        destinationSquares,
        disabledSquares: DISABLED_SQUARES,
        revision: selection.revision + 1,
        selectedSquare: intent.square,
      });
      setStatus(
        `${intent.input} activation selected ${intent.square}; the consumer published ${String(destinationSquares.length)} destination${destinationSquares.length === 1 ? '' : 's'}.`,
      );
    },
    [selection],
  );

  const onMoveRequest = useCallback<OnMoveRequest>(
    (intent) => {
      const nextPosition = applyMove(position, intent);
      if (nextPosition === null) {
        setStatus('The consumer rejected an obsolete or unsupported request.');
        return { status: 'rejected', reason: 'Example request is obsolete' };
      }

      setPosition(nextPosition);
      setSelection((current) => clearedSelection(current));
      setStatus(
        `${intent.input} destination ${intent.targetSquare ?? 'off board'} emitted one move request. The consumer committed it and cleared selection.`,
      );
      return { status: 'accepted' };
    },
    [position],
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
        destination move request; it never mutates either store value.
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
        This route contains no chess engine. Its destination table is hard-coded
        demo data. c3 is both a destination and disabled, showing that disabled
        presentation wins and activation is blocked. Activating the selected
        square again is a consumer policy that clears it.
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
