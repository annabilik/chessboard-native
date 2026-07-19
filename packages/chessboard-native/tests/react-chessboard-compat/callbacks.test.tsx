import type {
  AnnotationStyle,
  MoveIntent,
  PieceRenderers,
  PieceInteractionContext,
  SquareRenderer,
  SquareActivationIntent,
  SquarePressContext,
} from '../../src/public-types';
import { resolveSquareStyle } from '../../src/render/style-resolution';
import {
  createReactChessboardProps,
  REACT_CHESSBOARD_DEFAULT_POSITION,
} from '../../src/react-chessboard-compat/adapter';
import type { ReactChessboardOptions } from '../../src/react-chessboard-compat/types';

type PieceDropCallback = NonNullable<ReactChessboardOptions['onPieceDrop']>;
type PieceHandlerCallback = NonNullable<ReactChessboardOptions['onPieceClick']>;
type CanDragPieceCallback = NonNullable<ReactChessboardOptions['canDragPiece']>;
type SquareHandlerCallback = NonNullable<
  ReactChessboardOptions['onSquareClick']
>;

function mockPieceDrop(implementation: PieceDropCallback) {
  return jest.fn<ReturnType<PieceDropCallback>, Parameters<PieceDropCallback>>(
    implementation,
  );
}

function mockPieceHandler() {
  return jest.fn<
    ReturnType<PieceHandlerCallback>,
    Parameters<PieceHandlerCallback>
  >();
}

function mockCanDragPiece(implementation: CanDragPieceCallback) {
  return jest.fn<
    ReturnType<CanDragPieceCallback>,
    Parameters<CanDragPieceCallback>
  >(implementation);
}

function mockSquareHandler() {
  return jest.fn<
    ReturnType<SquareHandlerCallback>,
    Parameters<SquareHandlerCallback>
  >();
}

const BOARD_PIECE_CONTEXT = Object.freeze({
  basePositionRevision: 4,
  boardId: 'compat-board',
  piece: Object.freeze({ id: 'white-knight', pieceType: 'wN' }),
  source: Object.freeze({ kind: 'board' as const, square: 'b1' }),
}) satisfies Readonly<PieceInteractionContext>;

const SPARE_PIECE_CONTEXT = Object.freeze({
  basePositionRevision: 4,
  boardId: 'compat-board',
  piece: Object.freeze({ id: 'palette-queen', pieceType: 'wQ' }),
  source: Object.freeze({ kind: 'spare' as const, spareId: 'white-queen' }),
}) satisfies Readonly<PieceInteractionContext>;

const BOARD_MOVE = Object.freeze({
  basePositionRevision: 4,
  boardId: 'compat-board',
  input: 'drag' as const,
  intentId: 'board-move',
  piece: Object.freeze({ id: 'white-pawn', pieceType: 'wP' }),
  source: Object.freeze({ kind: 'board' as const, square: 'e2' }),
  targetSquare: 'e4',
}) satisfies Readonly<MoveIntent>;

const SPARE_REMOVAL = Object.freeze({
  basePositionRevision: 4,
  boardId: 'compat-board',
  input: 'drag' as const,
  intentId: 'spare-off-board',
  piece: Object.freeze({ id: 'palette-queen', pieceType: 'wQ' }),
  source: Object.freeze({ kind: 'spare' as const, spareId: 'white-queen' }),
  targetSquare: null,
}) satisfies Readonly<MoveIntent>;

const SQUARE_ACTIVATION = Object.freeze({
  action: 'activate' as const,
  basePositionRevision: 4,
  baseSelectionRevision: null,
  boardId: 'compat-board',
  input: 'touch' as const,
  intentId: 'activate-e4',
  isDestination: false,
  piece: Object.freeze({ id: 'black-pawn', pieceType: 'bP' }),
  selectedSquare: null,
  square: 'e4',
}) satisfies Readonly<SquareActivationIntent>;

const OCCUPIED_PRESS = Object.freeze({
  basePositionRevision: 4,
  boardId: 'compat-board',
  piece: Object.freeze({ id: 'black-pawn', pieceType: 'bP' }),
  square: 'e4',
}) satisfies Readonly<SquarePressContext>;

const EMPTY_PRESS = Object.freeze({
  basePositionRevision: 4,
  boardId: 'compat-board',
  piece: null,
  square: 'a3',
}) satisfies Readonly<SquarePressContext>;

const MOVE_REQUEST_CONTEXT = Object.freeze({
  signal: new AbortController().signal,
});

describe('react-chessboard compatibility callback adapter', () => {
  it('[PARITY-OPTION-ON-PIECE-CLICK] translates board and spare presses to immutable detached payloads', () => {
    const onPieceClick = mockPieceHandler();
    const props = createReactChessboardProps({ onPieceClick });

    props.onPiecePress?.(BOARD_PIECE_CONTEXT);
    props.onPiecePress?.(SPARE_PIECE_CONTEXT);

    expect(onPieceClick).toHaveBeenCalledTimes(2);
    expect(onPieceClick.mock.calls.map(([payload]) => payload)).toEqual([
      {
        isSparePiece: false,
        piece: { pieceType: 'wN' },
        square: 'b1',
      },
      {
        isSparePiece: true,
        piece: { pieceType: 'wQ' },
        square: 'wQ',
      },
    ]);
    for (const [payload] of onPieceClick.mock.calls) {
      expect(Object.isFrozen(payload)).toBe(true);
      expect(Object.isFrozen(payload.piece)).toBe(true);
    }
    expect(onPieceClick.mock.calls[0]?.[0]).not.toBe(BOARD_PIECE_CONTEXT);
    expect(onPieceClick.mock.calls[0]?.[0]?.piece).not.toBe(
      BOARD_PIECE_CONTEXT.piece,
    );
    expect(onPieceClick.mock.calls[1]?.[0]?.piece).not.toBe(
      SPARE_PIECE_CONTEXT.piece,
    );
  });

  it('[PARITY-OPTION-ON-PIECE-DRAG] translates a spare drag to one immutable detached payload', () => {
    const onPieceDrag = mockPieceHandler();
    const props = createReactChessboardProps({ onPieceDrag });

    props.onPieceDragStart?.(SPARE_PIECE_CONTEXT);

    expect(onPieceDrag).toHaveBeenCalledTimes(1);
    const payload = onPieceDrag.mock.calls[0]?.[0];
    expect(payload).toEqual({
      isSparePiece: true,
      piece: { pieceType: 'wQ' },
      square: null,
    });
    expect(payload?.piece).not.toBe(SPARE_PIECE_CONTEXT.piece);
    expect(Object.isFrozen(payload)).toBe(true);
    expect(Object.isFrozen(payload?.piece)).toBe(true);
  });

  it('[PARITY-OPTION-ON-PIECE-DROP] translates board and spare off-board intents without leaking native identity', () => {
    const onPieceDrop = mockPieceDrop(() => false);
    const props = createReactChessboardProps({ onPieceDrop });

    void props.onMoveRequest?.(BOARD_MOVE, MOVE_REQUEST_CONTEXT);
    void props.onMoveRequest?.(SPARE_REMOVAL, MOVE_REQUEST_CONTEXT);

    expect(onPieceDrop).toHaveBeenCalledTimes(2);
    expect(onPieceDrop.mock.calls.map(([payload]) => payload)).toEqual([
      {
        piece: {
          isSparePiece: false,
          pieceType: 'wP',
          position: 'e2',
        },
        sourceSquare: 'e2',
        targetSquare: 'e4',
      },
      {
        piece: {
          isSparePiece: true,
          pieceType: 'wQ',
          position: 'wQ',
        },
        sourceSquare: 'wQ',
        targetSquare: null,
      },
    ]);
    for (const [payload] of onPieceDrop.mock.calls) {
      expect(Object.isFrozen(payload)).toBe(true);
      expect(Object.isFrozen(payload.piece)).toBe(true);
    }
    expect(onPieceDrop.mock.calls[0]?.[0]?.piece).not.toBe(BOARD_MOVE.piece);
    expect(onPieceDrop.mock.calls[1]?.[0]?.piece).not.toBe(SPARE_REMOVAL.piece);
  });

  it('[PARITY-OPTION-ON-SQUARE-CLICK] translates activation to one immutable square payload', () => {
    const onSquareClick = mockSquareHandler();
    const props = createReactChessboardProps({ onSquareClick });

    props.onSquareActivate?.(SQUARE_ACTIVATION);

    expect(onSquareClick).toHaveBeenCalledTimes(1);
    const payload = onSquareClick.mock.calls[0]?.[0];
    expect(payload).toEqual({ piece: { pieceType: 'bP' }, square: 'e4' });
    expect(payload?.piece).not.toBe(SQUARE_ACTIVATION.piece);
    expect(Object.isFrozen(payload)).toBe(true);
    expect(Object.isFrozen(payload?.piece)).toBe(true);
  });

  it('[PARITY-OPTION-ON-SQUARE-MOUSE-DOWN] maps native press-in without manufacturing an event', () => {
    const onSquareMouseDown = mockSquareHandler();
    const props = createReactChessboardProps({ onSquareMouseDown });

    props.onSquarePressIn?.(OCCUPIED_PRESS);

    expect(onSquareMouseDown).toHaveBeenCalledTimes(1);
    expect(onSquareMouseDown.mock.calls[0]).toHaveLength(1);
    const payload = onSquareMouseDown.mock.calls[0]?.[0];
    expect(payload).toEqual({ piece: { pieceType: 'bP' }, square: 'e4' });
    expect(Object.isFrozen(payload)).toBe(true);
    expect(Object.isFrozen(payload?.piece)).toBe(true);
  });

  it('[PARITY-OPTION-ON-SQUARE-MOUSE-UP] maps native press-out with an empty-square payload', () => {
    const onSquareMouseUp = mockSquareHandler();
    const props = createReactChessboardProps({ onSquareMouseUp });

    props.onSquarePressOut?.(EMPTY_PRESS);

    expect(onSquareMouseUp).toHaveBeenCalledTimes(1);
    expect(onSquareMouseUp.mock.calls[0]).toHaveLength(1);
    const payload = onSquareMouseUp.mock.calls[0]?.[0];
    expect(payload).toEqual({ piece: null, square: 'a3' });
    expect(Object.isFrozen(payload)).toBe(true);
  });

  it('[PARITY-BEHAVIOR-B22] invokes the current drop callback exactly once and accepts only strict true', () => {
    const accepted = mockPieceDrop(() => true);
    const rejected = mockPieceDrop(() => false);
    const thrown = mockPieceDrop(() => {
      throw new Error('consumer failure');
    });
    const invalid = jest.fn(() => 'truthy');
    const invalidCallback = invalid as unknown as PieceDropCallback;

    expect(
      createReactChessboardProps({ onPieceDrop: accepted }).onMoveRequest?.(
        BOARD_MOVE,
        MOVE_REQUEST_CONTEXT,
      ),
    ).toEqual({ status: 'accepted' });
    expect(
      createReactChessboardProps({ onPieceDrop: rejected }).onMoveRequest?.(
        BOARD_MOVE,
        MOVE_REQUEST_CONTEXT,
      ),
    ).toEqual({ status: 'rejected' });
    expect(
      createReactChessboardProps({ onPieceDrop: thrown }).onMoveRequest?.(
        BOARD_MOVE,
        MOVE_REQUEST_CONTEXT,
      ),
    ).toEqual({ status: 'rejected' });
    expect(
      createReactChessboardProps({
        onPieceDrop: invalidCallback,
      }).onMoveRequest?.(BOARD_MOVE, MOVE_REQUEST_CONTEXT),
    ).toEqual({ status: 'rejected' });

    expect(accepted).toHaveBeenCalledTimes(1);
    expect(rejected).toHaveBeenCalledTimes(1);
    expect(thrown).toHaveBeenCalledTimes(1);
    expect(invalid).toHaveBeenCalledTimes(1);

    const stale = mockPieceDrop(() => true);
    const current = mockPieceDrop(() => false);
    createReactChessboardProps({ onPieceDrop: stale });
    const replacement = createReactChessboardProps({ onPieceDrop: current });

    expect(
      replacement.onMoveRequest?.(BOARD_MOVE, MOVE_REQUEST_CONTEXT),
    ).toEqual({ status: 'rejected' });
    expect(stale).not.toHaveBeenCalled();
    expect(current).toHaveBeenCalledTimes(1);
  });

  it('maps static compatibility defaults without enabling callback surfaces', () => {
    const props = createReactChessboardProps();

    expect(props).toMatchObject({
      annotations: [],
      boardId: 'chessboard',
      dimensions: { columns: 8, rows: 8 },
      gesture: { activationDistance: 1, allowDragOffBoard: true },
      orientation: 'white',
      position: REACT_CHESSBOARD_DEFAULT_POSITION,
      reduceMotion: 'system',
      showNotation: true,
      styles: {},
      transitionDurationMs: 300,
    });
    expect(props.onMoveRequest).toBeUndefined();
    expect(props.onPiecePress).toBeUndefined();
    expect(props.onSquareActivate).toBeUndefined();
    expect(Object.isFrozen(props.annotations)).toBe(true);
  });

  it('defaults nonstandard dimensions to an empty compatible position', () => {
    const props = createReactChessboardProps({
      chessboardColumns: 6,
      chessboardRows: 5,
    });

    expect(props.dimensions).toEqual({ columns: 6, rows: 5 });
    expect(props.position).toEqual({});
    expect(Object.isFrozen(props.position)).toBe(true);
  });

  it('uses the upstream spare pseudo-square for the synchronous drag gate', () => {
    const canDragPiece = mockCanDragPiece(() => true);
    const props = createReactChessboardProps({ canDragPiece });

    expect(props.canDragPiece?.(SPARE_PIECE_CONTEXT)).toBe(true);
    expect(canDragPiece).toHaveBeenCalledWith({
      isSparePiece: true,
      piece: { pieceType: 'wQ' },
      square: 'wQ',
    });
  });

  it('maps every static native option and preserves base-before-tone square precedence', () => {
    const position = Object.freeze({
      a1: Object.freeze({ pieceType: 'wR' }),
    });
    const pieces = Object.freeze({}) satisfies PieceRenderers;
    const squareRenderer: SquareRenderer = () => null;
    const arrowOptions = Object.freeze({
      activeArrowWidthMultiplier: 0.8,
      activeOpacity: 0.4,
      arrowLengthReducerDenominator: 7,
      arrowStartOffset: 0.1,
      arrowWidthDenominator: 4,
      color: '#111111',
      opacity: 0.7,
      sameTargetArrowLengthReducerDenominator: 3,
      secondaryColor: '#222222',
      tertiaryColor: '#333333',
    }) satisfies AnnotationStyle;
    const squareStyles = Object.freeze({
      a1: Object.freeze({ borderColor: '#abcdef' }),
    });
    const onPieceDrop = mockPieceDrop(() => false);

    const props = createReactChessboardProps({
      allowDragOffBoard: false,
      allowDragging: false,
      allowDrawingArrows: false,
      alphaNotationStyle: { fontWeight: '700' },
      animationDurationInMs: 175,
      arrowOptions,
      boardOrientation: 'black',
      boardStyle: { backgroundColor: '#101010' },
      chessboardColumns: 7,
      chessboardRows: 5,
      clearArrowsOnClick: false,
      clearArrowsOnPositionChange: false,
      darkSquareNotationStyle: { color: '#dddddd' },
      darkSquareStyle: { backgroundColor: '#333333' },
      dragActivationDistance: 6,
      draggingPieceGhostStyle: { opacity: 0.25 },
      draggingPieceStyle: { opacity: 0.9 },
      dropSquareStyle: { borderColor: '#ff0000' },
      id: 'mapped-options',
      lightSquareNotationStyle: { color: '#222222' },
      lightSquareStyle: { backgroundColor: '#eeeeee' },
      numericNotationStyle: { fontWeight: '600' },
      onArrowsChange: () => undefined,
      onPieceDrop,
      pieces,
      position,
      showAnimations: false,
      showNotation: false,
      squareRenderer,
      squareStyle: { backgroundColor: '#ff00ff' },
      squareStyles,
    });

    expect(props).toMatchObject({
      annotationPolicies: {
        clearOnBoardPress: false,
        clearOnPositionChange: false,
      },
      boardId: 'mapped-options',
      dimensions: { columns: 7, rows: 5 },
      gesture: { activationDistance: 6, allowDragOffBoard: false },
      interactionPermissions: { accessibility: true, drag: false },
      orientation: 'black',
      reduceMotion: 'always',
      showNotation: false,
      transitionDurationMs: 175,
    });
    expect(props.annotationStyle).toBe(arrowOptions);
    expect(props.annotationTool).toBeUndefined();
    expect(props.pieceRenderers).toBe(pieces);
    expect(props.position).toBe(position);
    expect(props.renderSquare).toBe(squareRenderer);
    expect(props.squareStyles).toBe(squareStyles);
    expect(props.styles).toEqual({
      board: { backgroundColor: '#101010' },
      darkSquare: { backgroundColor: '#333333' },
      darkSquareNotation: { color: '#dddddd' },
      draggingPiece: { opacity: 0.9 },
      draggingPieceGhost: { opacity: 0.25 },
      dropTarget: { borderColor: '#ff0000' },
      fileNotation: { fontWeight: '700' },
      lightSquare: { backgroundColor: '#eeeeee' },
      lightSquareNotation: { color: '#222222' },
      rankNotation: { fontWeight: '600' },
      square: { backgroundColor: '#ff00ff' },
    });
    expect(
      resolveSquareStyle({
        isLight: true,
        square: 'a1',
        styles: props.styles,
      }),
    ).toEqual(
      expect.objectContaining({
        backgroundColor: '#eeeeee',
      }),
    );
  });

  it.each([
    'allowAutoScroll',
    'onMouseOutSquare',
    'onMouseOverSquare',
    'onSquareRightClick',
  ] as const)('rejects unsupported runtime option %s', (option) => {
    const options: ReactChessboardOptions = {};
    Object.defineProperty(options, option, {
      value: option === 'allowAutoScroll' ? true : jest.fn(),
    });
    expect(() => createReactChessboardProps(options)).toThrow(
      `compatibility option "${option}" is unavailable`,
    );
  });
});
