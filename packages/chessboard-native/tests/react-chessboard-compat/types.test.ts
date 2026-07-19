import { defaultAnnotationStyle } from '../../src';
import { Chessboard } from '../../src/react-chessboard-compat';
import type {
  ReactChessboardArrow,
  ReactChessboardOptions,
  ReactChessboardProps,
} from '../../src/react-chessboard-compat';

const assertUnsupportedWebOnlyOptions = (): void => {
  const options: ReactChessboardOptions = {
    // @ts-expect-error Native views do not discover or scroll DOM ancestors.
    allowAutoScroll: true,
    // @ts-expect-error Native has no pointer-hover square event.
    onMouseOutSquare: () => undefined,
    // @ts-expect-error Native has no pointer-hover square event.
    onMouseOverSquare: () => undefined,
    // @ts-expect-error Native annotation gestures replace right-click.
    onSquareRightClick: () => undefined,
  };

  void options;
};

const assertCompatTypesAreSubpathOnly = (): void => {
  // @ts-expect-error Compatibility options are exported only from the subpath.
  const options: import('../../src').ReactChessboardOptions = {};
  // @ts-expect-error Compatibility arrows are exported only from the subpath.
  const arrow: import('../../src').ReactChessboardArrow = {
    color: '#ffaa00',
    endSquare: 'e4',
    startSquare: 'e2',
  };
  // @ts-expect-error Compatibility props are exported only from the subpath.
  const props: import('../../src').ReactChessboardProps = {};

  void [arrow, options, props];
};

describe('react-chessboard compatibility public types', () => {
  it('[PARITY-EXPORT-CHESSBOARD-OPTIONS] accepts every supported compatibility option with native values', () => {
    const callbackCalls: string[] = [];
    const arrow = Object.freeze({
      color: '#ffaa00',
      endSquare: 'e4',
      startSquare: 'e2',
    }) satisfies ReactChessboardArrow;
    const options = {
      allowDragOffBoard: false,
      allowDragging: true,
      allowDrawingArrows: true,
      alphaNotationStyle: { color: '#101010', fontWeight: '700' },
      animationDurationInMs: 180,
      arrowOptions: defaultAnnotationStyle,
      arrows: Object.freeze([arrow]),
      boardOrientation: 'black',
      boardStyle: [{ backgroundColor: '#f0d9b5' }, { opacity: 0.98 }],
      canDragPiece: ({ isSparePiece, piece, square }) =>
        !isSparePiece && piece.pieceType === 'wP' && square === 'a2',
      chessboardColumns: 6,
      chessboardRows: 7,
      clearArrowsOnClick: true,
      clearArrowsOnPositionChange: false,
      darkSquareNotationStyle: { color: '#ffffff', fontSize: 11 },
      darkSquareStyle: { backgroundColor: '#769656' },
      dragActivationDistance: 5,
      draggingPieceGhostStyle: { opacity: 0.35 },
      draggingPieceStyle: { transform: [{ scale: 1.08 }] },
      dropSquareStyle: { borderColor: '#36c', borderWidth: 2 },
      id: 'compat-board',
      lightSquareNotationStyle: { color: '#303030', fontSize: 11 },
      lightSquareStyle: { backgroundColor: '#eeeed2' },
      numericNotationStyle: { color: '#202020', fontWeight: '600' },
      onArrowsChange: ({ arrows }) => {
        callbackCalls.push(`arrows:${String(arrows.length)}`);
      },
      onPieceClick: ({ piece, square }) => {
        callbackCalls.push(`click:${piece.pieceType}:${square ?? 'spare'}`);
      },
      onPieceDrag: ({ piece, square }) => {
        callbackCalls.push(`drag:${piece.pieceType}:${square ?? 'spare'}`);
      },
      onPieceDrop: ({ piece, sourceSquare, targetSquare }) => {
        callbackCalls.push(
          `drop:${piece.pieceType}:${sourceSquare}:${targetSquare ?? 'off'}`,
        );
        return targetSquare !== null;
      },
      onSquareClick: ({ piece, square }) => {
        callbackCalls.push(`square:${piece?.pieceType ?? 'empty'}:${square}`);
      },
      onSquareMouseDown: ({ square }) => {
        callbackCalls.push(`down:${square}`);
      },
      onSquareMouseUp: ({ square }) => {
        callbackCalls.push(`up:${square}`);
      },
      pieces: {
        wP: (rendererProps) => {
          void rendererProps.style;
          return null;
        },
      },
      position: { a2: { pieceType: 'wP' } },
      showAnimations: true,
      showNotation: true,
      squareRenderer: (rendererProps) => {
        void rendererProps.style;
        return null;
      },
      squareStyle: { opacity: 0.96 },
      squareStyles: { a2: { backgroundColor: '#f6f669' } },
    } satisfies ReactChessboardOptions;
    const props = { options } satisfies ReactChessboardProps;
    const pieceArgs = {
      isSparePiece: false,
      piece: { pieceType: 'wP' },
      square: 'a2',
    } as const;
    const squareArgs = {
      piece: { pieceType: 'wP' },
      square: 'a2',
    } as const;

    expect(Object.keys(options).sort()).toEqual([
      'allowDragOffBoard',
      'allowDragging',
      'allowDrawingArrows',
      'alphaNotationStyle',
      'animationDurationInMs',
      'arrowOptions',
      'arrows',
      'boardOrientation',
      'boardStyle',
      'canDragPiece',
      'chessboardColumns',
      'chessboardRows',
      'clearArrowsOnClick',
      'clearArrowsOnPositionChange',
      'darkSquareNotationStyle',
      'darkSquareStyle',
      'dragActivationDistance',
      'draggingPieceGhostStyle',
      'draggingPieceStyle',
      'dropSquareStyle',
      'id',
      'lightSquareNotationStyle',
      'lightSquareStyle',
      'numericNotationStyle',
      'onArrowsChange',
      'onPieceClick',
      'onPieceDrag',
      'onPieceDrop',
      'onSquareClick',
      'onSquareMouseDown',
      'onSquareMouseUp',
      'pieces',
      'position',
      'showAnimations',
      'showNotation',
      'squareRenderer',
      'squareStyle',
      'squareStyles',
    ]);
    expect(typeof Chessboard).toBe('function');
    expect(props.options).toBe(options);
    expect(options.canDragPiece(pieceArgs)).toBe(true);
    options.onArrowsChange({ arrows: [arrow] });
    options.onPieceClick(pieceArgs);
    options.onPieceDrag(pieceArgs);
    expect(
      options.onPieceDrop({
        piece: {
          isSparePiece: false,
          pieceType: 'wP',
          position: 'a2',
        },
        sourceSquare: 'a2',
        targetSquare: 'a3',
      }),
    ).toBe(true);
    options.onSquareClick(squareArgs);
    options.onSquareMouseDown(squareArgs);
    options.onSquareMouseUp(squareArgs);
    expect(callbackCalls).toEqual([
      'arrows:1',
      'click:wP:a2',
      'drag:wP:a2',
      'drop:wP:a2:a3',
      'square:wP:a2',
      'down:a2',
      'up:a2',
    ]);
  });

  it('[PARITY-EXPORT-ARROW] exports readonly upstream-shaped arrows on the subpath', () => {
    const arrow: ReactChessboardArrow = Object.freeze({
      color: '#ff0000',
      endSquare: 'h8',
      startSquare: 'a1',
    });
    const arrows: NonNullable<ReactChessboardOptions['arrows']> = Object.freeze(
      [arrow],
    );
    const props = { options: { arrows } } satisfies ReactChessboardProps;

    expect(props.options.arrows).toEqual([
      { color: '#ff0000', endSquare: 'h8', startSquare: 'a1' },
    ]);
    expect(Object.isFrozen(arrow)).toBe(true);
    expect(Object.isFrozen(arrows)).toBe(true);
  });

  it('rejects unsupported web-only options and keeps compatibility names off the root entry', () => {
    expect(assertUnsupportedWebOnlyOptions).toEqual(expect.any(Function));
    expect(assertCompatTypesAreSubpathOnly).toEqual(expect.any(Function));
  });
});
