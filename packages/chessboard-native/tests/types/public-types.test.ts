import { StyleSheet } from 'react-native';

import { defaultAnnotationStyle, defaultTheme } from '../../src/index';
import type {
  AnnotationDraft,
  AnnotationOperation,
  AnnotationStyle,
  AnnotationsProp,
  ArrowAnnotation,
  BoardActionAccessibilityContext,
  BoardAnnotation,
  BoardDimensions,
  BoardSquare,
  BoardTransition,
  CanDragPiece,
  ChessboardAccessibility,
  ChessboardProps,
  ChessboardProviderProps,
  ChessboardStyles,
  ChessboardTheme,
  ControlledAnnotations,
  ControlledPosition,
  ControlledSelection,
  FenPieceCode,
  InteractionPermissions,
  MoveDecision,
  MoveIntent,
  MoveOutcomeAccessibilityContext,
  MoveRequestTimeouts,
  MoveSource,
  OnMoveRequest,
  OnSquareActivate,
  PieceData,
  PieceInteractionContext,
  PieceRenderers,
  PositionObject,
  PositionProp,
  ReduceMotion,
  SelectionProp,
  SquareAccessibilityContext,
  SquareActivationIntent,
  SquareRenderer,
  SquareRendererProps,
  SquareStyles,
} from '../../src/index';

describe('public data contracts', () => {
  it('publishes one complete immutable native default theme', () => {
    expect(Object.keys(defaultTheme).sort()).toEqual([
      'board',
      'darkSquare',
      'darkSquareNotation',
      'destinationSquare',
      'disabledSquare',
      'fileNotation',
      'lightSquare',
      'lightSquareNotation',
      'piece',
      'rankNotation',
      'selectedSquare',
      'square',
    ]);
    expect(Object.isFrozen(defaultTheme)).toBe(true);
    expect(
      Object.values(defaultTheme).every((style) => Object.isFrozen(style)),
    ).toBe(true);
  });

  it('[PARITY-EXPORT-SQUARE-DATA-TYPE] exposes canonical square identity and parity', () => {
    const square = {
      isLight: true,
      square: 'e4',
    } satisfies BoardSquare;

    expect(square).toEqual({ isLight: true, square: 'e4' });
  });

  it('[PARITY-EXPORT-PIECE-DATA-TYPE] supports open piece names and optional consumer identity', () => {
    const standard = { pieceType: 'wN' } satisfies PieceData;
    const custom = {
      id: 'dragon-1',
      pieceType: 'redDragon',
    } satisfies PieceData;

    expect(standard.pieceType).toBe('wN');
    expect(custom.id).toBe('dragon-1');
  });

  it('[PARITY-EXPORT-DRAGGING-PIECE-DATA-TYPE] distinguishes board and spare move sources', () => {
    const board = { kind: 'board', square: 'b1' } satisfies MoveSource;
    const spare = {
      kind: 'spare',
      spareId: 'palette-knight',
    } satisfies MoveSource;
    const intent = {
      basePositionRevision: 7,
      boardId: 'analysis',
      input: 'drag',
      intentId: 'move-8',
      piece: { id: 'white-knight', pieceType: 'wN' },
      source: board,
      targetSquare: 'c3',
    } satisfies MoveIntent;

    expect(board.kind).toBe('board');
    expect(spare.kind).toBe('spare');
    expect(intent.basePositionRevision).toBe(7);
  });

  it('[PARITY-EXPORT-POSITION-DATA-TYPE] exposes a deeply readonly object position', () => {
    const position: PositionObject = {
      a1: { id: 'rook-1', pieceType: 'wR' },
      e8: { pieceType: 'bK' },
    };

    expect(Object.keys(position)).toEqual(['a1', 'e8']);
    expect(position['a1']?.pieceType).toBe('wR');
    expect(position['e4']).toBeUndefined();
  });

  it('[PARITY-EXPORT-SQUARE-HANDLER-ARGS] carries controlled activation context', () => {
    const activation = {
      action: 'activate',
      basePositionRevision: 3,
      baseSelectionRevision: 5,
      boardId: 'main',
      input: 'accessibility',
      intentId: 'activation-1',
      isDestination: true,
      piece: { pieceType: 'bQ' },
      selectedSquare: 'd8',
      square: 'h4',
    } satisfies SquareActivationIntent;
    const onSquareActivate: OnSquareActivate = (intent) => {
      expect(intent).toBe(activation);
    };

    expect(activation.input).toBe('accessibility');
    expect(activation.isDestination).toBe(true);
    onSquareActivate(activation);
  });

  it('[PARITY-EXPORT-PIECE-HANDLER-ARGS] carries source and revision context', () => {
    const context = {
      basePositionRevision: 11,
      boardId: 'editor',
      piece: { pieceType: 'wQ' },
      source: { kind: 'spare', spareId: 'white-queen' },
    } satisfies PieceInteractionContext;

    expect(context.source.kind).toBe('spare');
  });

  it('[PARITY-EXPORT-PIECE-DROP-HANDLER-ARGS] permits an off-board target without committing it', () => {
    const removal = {
      basePositionRevision: 2,
      boardId: 'editor',
      input: 'keyboard',
      intentId: 'remove-1',
      piece: { pieceType: 'bP' },
      source: { kind: 'board', square: 'a2' },
      targetSquare: null,
    } satisfies MoveIntent;

    expect(removal.targetSquare).toBeNull();
  });

  it('[PARITY-EXPORT-SQUARE-RENDERER] keeps custom square rendering visual-only', () => {
    const renderer: SquareRenderer = (props) => {
      expect(props.state.isDropTarget).toBe(false);
      return null;
    };

    expect(
      renderer({
        boardId: 'diagram',
        piece: null,
        size: 40,
        square: 'a1',
        state: {
          isDestination: false,
          isDisabled: false,
          isDropTarget: false,
          isPendingSource: false,
          isPendingTarget: false,
          isPressed: false,
          isSelected: false,
        },
        style: {},
      }),
    ).toBeNull();
  });

  it('[PARITY-EXPORT-PIECE-RENDER-OBJECT] keys visual renderers by an open piece vocabulary', () => {
    const renderers = {
      redDragon: () => null,
      wP: () => null,
    } satisfies PieceRenderers;

    expect(renderers.wP()).toBeNull();
    expect(renderers.redDragon()).toBeNull();
  });

  it('[PARITY-EXPORT-FEN-PIECE-STRING] keeps all twelve standard FEN piece codes', () => {
    const pieces = [
      'p',
      'r',
      'n',
      'b',
      'q',
      'k',
      'P',
      'R',
      'N',
      'B',
      'Q',
      'K',
    ] as const satisfies readonly FenPieceCode[];

    expect(pieces).toHaveLength(12);
    // @ts-expect-error FEN piece placement has no `x` piece code.
    const invalidPiece = 'x' satisfies FenPieceCode;
    expect(invalidPiece).toBe('x');
  });

  it('models plain and revisioned controlled domains without a second value source', () => {
    const transition = {
      capturedSquare: 'd5',
      from: 'e5',
      fromRevision: 4,
      to: 'd6',
      toRevision: 5,
    } satisfies BoardTransition;
    const position = {
      committedIntentId: 'move-5',
      revision: 5,
      transition,
      value: { d6: { id: 'pawn', pieceType: 'wP' } },
    } satisfies ControlledPosition;
    const selection = {
      destinationSquares: ['d6'],
      disabledSquares: [],
      revision: 9,
      selectedSquare: 'e5',
    } satisfies ControlledSelection;

    const positionProps: readonly PositionProp[] = [
      position,
      '8/8/8/8/8/8/8/8',
    ];
    const selectionProps: readonly SelectionProp[] = [
      selection,
      { selectedSquare: null },
    ];

    expect(positionProps).toHaveLength(2);
    expect(selectionProps).toHaveLength(2);
    expect(position.transition).toBe(transition);
  });

  it('requires direct board identity and position props and discriminates selection tiers', () => {
    const nativeStyles = StyleSheet.create({
      board: { borderRadius: 8 },
      darkSquare: { backgroundColor: '#76543a' },
      destinationSquare: { boxShadow: 'inset 0 0 0 2px green' },
      disabledSquare: { opacity: 0.4 },
      fileNotation: { fontSize: 11 },
      piece: { opacity: 0.9 },
      selectedSquare: { boxShadow: 'inset 0 0 0 2px orange' },
      square: { borderWidth: 1 },
    });
    const theme = {
      darkSquare: nativeStyles.darkSquare,
      destinationSquare: nativeStyles.destinationSquare,
      piece: nativeStyles.piece,
    } satisfies ChessboardTheme;
    const styles = {
      board: [false, nativeStyles.board],
      disabledSquare: nativeStyles.disabledSquare,
      fileNotation: nativeStyles.fileNotation,
      selectedSquare: nativeStyles.selectedSquare,
    } satisfies ChessboardStyles;
    const squareStyles = {
      a1: [nativeStyles.square, null],
    } satisfies SquareStyles;
    const pieceRenderers = {
      wK: () => null,
    } satisfies PieceRenderers;
    const accessibility = {
      boardHint: 'Navigate the board.',
      boardLabel: 'Analysis board, black orientation',
    } satisfies ChessboardAccessibility;
    const annotationStyle = {
      ...defaultAnnotationStyle,
      arrowStartOffset: 0.25,
    } satisfies AnnotationStyle;
    const canDragPiece: CanDragPiece = (context) =>
      context.piece.pieceType === 'wK';
    const interactionPermissions = {
      accessibility: true,
      drag: true,
    } satisfies InteractionPermissions;
    const onMoveRequest: OnMoveRequest = () => ({ status: 'accepted' });
    const onSquareActivate: OnSquareActivate = () => undefined;
    const props = {
      accessibility,
      annotations: [],
      annotationStyle,
      boardId: 'diagram',
      canDragPiece,
      dimensions: { columns: 8, rows: 8 },
      interactionPermissions,
      moveRequestTimeouts: { commitMs: 1_500, decisionMs: 10_000 },
      onMoveRequest,
      onSquareActivate,
      orientation: 'black',
      pieceRenderers,
      position: '8/8/8/8/8/8/8/8',
      reduceMotion: 'always',
      selection: { selectedSquare: null },
      showNotation: false,
      squareStyles,
      styles,
      theme,
    } satisfies ChessboardProps;
    const revisioned = {
      revision: 4,
      selectedSquare: 'e4',
    } satisfies SelectionProp;

    // @ts-expect-error Chessboard identity is required.
    const missingBoardId: ChessboardProps = { position: {} };
    // @ts-expect-error A canonical position is required.
    const missingPosition: ChessboardProps = { boardId: 'diagram' };
    const malformedRevision: SelectionProp = {
      // @ts-expect-error A malformed revision cannot typecheck through the plain selection tier.
      revision: '4',
      selectedSquare: null,
    };
    const nestedSelection: SelectionProp = {
      revision: 4,
      // @ts-expect-error Selection uses an inline revision, not a nested value envelope.
      value: { selectedSquare: null },
    };

    expect(props.boardId).toBe('diagram');
    expect(props.canDragPiece).toBe(canDragPiece);
    expect(props.accessibility).toBe(accessibility);
    expect(props.annotationStyle).toBe(annotationStyle);
    expect(props.interactionPermissions).toBe(interactionPermissions);
    expect(props.onMoveRequest).toBe(onMoveRequest);
    expect(props.onSquareActivate).toBe(onSquareActivate);
    expect(props.orientation).toBe('black');
    expect(props.pieceRenderers).toBe(pieceRenderers);
    expect(props.reduceMotion).toBe('always');
    expect(props.showNotation).toBe(false);
    expect(props.squareStyles).toBe(squareStyles);
    expect(props.styles).toBe(styles);
    expect(props.theme).toBe(theme);
    expect(revisioned.revision).toBe(4);
    expect(missingBoardId).toEqual(expect.any(Object));
    expect(missingPosition).toEqual(expect.any(Object));
    expect(malformedRevision).toEqual(expect.any(Object));
    expect(nestedSelection).toEqual(expect.any(Object));
  });

  it('models annotation snapshots, drafts, tools, and deltas', () => {
    const annotations = [
      {
        color: '#ffaa00',
        from: 'g1',
        id: 'plan-a',
        layer: 'abovePieces',
        to: 'f3',
        type: 'arrow',
      },
      {
        color: '#4caf50',
        id: 'focus-e4',
        shape: 'border',
        square: 'e4',
        type: 'square',
      },
    ] as const satisfies readonly BoardAnnotation[];
    const controlled = {
      revision: 12,
      value: annotations,
    } satisfies ControlledAnnotations;
    const draft = {
      color: '#f44336',
      from: 'b1',
      to: 'c3',
      type: 'arrow',
    } satisfies AnnotationDraft;
    const operation = {
      annotation: draft,
      baseAnnotationRevision: 12,
      boardId: 'analysis',
      input: 'touch',
      matchingIdsAtBase: [],
      operationId: 'annotation-13',
      type: 'toggle',
    } satisfies AnnotationOperation;

    const annotationProps: readonly AnnotationsProp[] = [
      annotations,
      controlled,
    ];

    expect(annotationProps).toHaveLength(2);
    expect(operation.type).toBe('toggle');
  });

  it('models cancellable decisions, timeouts, reduced motion, and accessibility formatters', () => {
    const decision = { status: 'accepted' } satisfies MoveDecision;
    const callback: OnMoveRequest = (_intent, context) => {
      expect(context.signal).toBeDefined();
      return decision;
    };
    const timeouts = {
      commitMs: 1_500,
      decisionMs: 10_000,
    } satisfies MoveRequestTimeouts;
    const dimensions = { columns: 8, rows: 8 } satisfies BoardDimensions;
    const reduceMotion = 'system' satisfies ReduceMotion;
    const accessibility: ChessboardAccessibility = {
      formatActionLabel: (context: BoardActionAccessibilityContext) =>
        `${context.action} ${context.square}`,
      formatMoveOutcome: (context: MoveOutcomeAccessibilityContext) =>
        context.outcome,
      formatSquareValue: (context: SquareAccessibilityContext) =>
        context.square,
    };

    expect(callback).toEqual(expect.any(Function));
    expect(timeouts).toEqual({ commitMs: 1_500, decisionMs: 10_000 });
    expect(dimensions.rows).toBe(8);
    expect(reduceMotion).toBe('system');
    expect(accessibility.formatActionLabel).toEqual(expect.any(Function));
  });

  it('exposes a layout-neutral controlled provider contract', () => {
    const provider = {
      children: null,
      geometryRevision: 4,
    } satisfies ChessboardProviderProps;

    expect(provider.geometryRevision).toBe(4);
  });

  it('rejects contradictory, mutable, and event-owning contract shapes at compile time', () => {
    const persistent = {
      color: '#ffaa00',
      from: 'a1',
      id: 'consumer-id',
      to: 'h8',
      type: 'arrow',
    } satisfies ArrowAnnotation;
    // @ts-expect-error Persistent annotations cannot be reused as transient drafts.
    const invalidDraft: AnnotationDraft = persistent;
    const invalidContracts = () => {
      const interaction: PieceInteractionContext = {
        basePositionRevision: 1,
        boardId: 'analysis',
        piece: { pieceType: 'wP' },
        source: { kind: 'board', square: 'e2' },
        // @ts-expect-error Source square identity has exactly one authoritative field.
        square: 'e4',
      };
      const rendererState = {
        isDestination: false,
        isDisabled: false,
        isDropTarget: false,
        isPendingSource: false,
        isPendingTarget: false,
        isPressed: false,
        isSelected: false,
      } as const;
      const rendererProps: SquareRendererProps = {
        boardId: 'analysis',
        piece: null,
        size: 40,
        square: 'e4',
        state: rendererState,
        style: {},
        // @ts-expect-error Visual renderer inputs never expose event handlers.
        onPress: () => undefined,
      };
      // @ts-expect-error Move intents require a board-generated intent ID.
      const moveWithoutIdentity: MoveIntent = {
        basePositionRevision: 1,
        boardId: 'analysis',
        input: 'drag',
        piece: { pieceType: 'wP' },
        source: { kind: 'board', square: 'e2' },
        targetSquare: 'e4',
      };

      return { interaction, moveWithoutIdentity, rendererProps };
    };
    const mutateSnapshots = (
      position: PositionObject,
      piece: PieceData,
    ): void => {
      // @ts-expect-error Position entries are readonly consumer snapshots.
      position['e4'] = { pieceType: 'wP' };
      // @ts-expect-error Piece data is readonly consumer state.
      piece.pieceType = 'bP';
    };

    expect(invalidDraft).toBe(persistent);
    expect(invalidContracts).toEqual(expect.any(Function));
    expect(mutateSnapshots).toEqual(expect.any(Function));
  });
});
