import { act, fireEvent, render, waitFor } from '@testing-library/react-native';
import { useState, type ReactElement } from 'react';
import {
  AccessibilityInfo,
  AppState,
  View,
  type AppStateStatus,
} from 'react-native';
import { State } from 'react-native-gesture-handler';
import {
  fireGestureHandler,
  getByGestureTestId,
} from 'react-native-gesture-handler/jest-utils';
import { getAnimatedStyle } from 'react-native-reanimated';
import type { TestInstance } from 'test-renderer';

import {
  Chessboard,
  ChessboardProvider,
  SparePiece,
  type BoardDimensions,
  type BoardOrientation,
  type CanDragPiece,
  type ControlledPosition,
  type MoveDecision,
  type OnMoveRequest,
  type OnPieceDragStart,
  type OnPiecePress,
  type OnSquareActivate,
  type PieceData,
  type PieceRendererProps,
  type PieceRenderers,
} from '../src';
import {
  useChessboardProvider,
  type ChessboardProviderRuntime,
} from '../src/internal/provider-context';
import { getSparePieceGestureTestId } from '../src/render/spare-piece-gesture-layer';
import { getBoardGestureTestIds } from '../src/render/board-gesture-layer';

type SpareRenderResult = Awaited<ReturnType<typeof render>>;

const BOARD_SIZE = 200;
const BOARD_BOUNDS = Object.freeze({
  height: BOARD_SIZE,
  width: BOARD_SIZE,
  x: 100,
  y: 200,
});
const SPARE_PIECE = Object.freeze({ id: 'reserve-knight', pieceType: 'wN' });

interface PanCallbacks {
  readonly onBegin?: (event: Readonly<Record<string, number>>) => void;
  readonly onEnd?: (
    event: Readonly<Record<string, number>>,
    success: boolean,
  ) => void;
  readonly onFinalize?: (
    event: Readonly<Record<string, number>>,
    success: boolean,
  ) => void;
  readonly onStart?: (event: Readonly<Record<string, number>>) => void;
  readonly onUpdate?: (event: Readonly<Record<string, number>>) => void;
}

interface TapCallbacks {
  readonly onBegin?: (event: Readonly<Record<string, number>>) => void;
  readonly onEnd?: (
    event: Readonly<Record<string, number>>,
    success: boolean,
  ) => void;
  readonly onFinalize?: (
    event: Readonly<Record<string, number>>,
    success: boolean,
  ) => void;
}

interface MeasureInWindowView {
  readonly measureInWindow: (
    callback: (x: number, y: number, width: number, height: number) => void,
  ) => void;
}

function boardByLabel(result: SpareRenderResult, label: string): TestInstance {
  const board = result
    .queryAllByRole('adjustable', { includeHiddenElements: true })
    .find((candidate) => candidate.props['accessibilityLabel'] === label);
  if (board === undefined) {
    throw new Error(`Expected adjustable board labelled "${label}".`);
  }
  return board;
}

function actionNames(board: TestInstance): string[] {
  const actions = board.props['accessibilityActions'] as
    readonly Readonly<{ name: string }>[] | undefined;
  return actions?.map(({ name }) => name) ?? [];
}

async function accessibilityAction(
  board: TestInstance,
  actionName: string,
): Promise<void> {
  await fireEvent(board, 'accessibilityAction', {
    nativeEvent: { actionName },
  });
}

function mockBoardWindowBounds(
  bounds = BOARD_BOUNDS,
): jest.SpyInstance<void, Parameters<MeasureInWindowView['measureInWindow']>> {
  const prototype = (View as unknown as { prototype: MeasureInWindowView })
    .prototype;
  return jest
    .spyOn(prototype, 'measureInWindow')
    .mockImplementation((callback) => {
      callback(bounds.x, bounds.y, bounds.width, bounds.height);
    });
}

async function measureBoard(board: TestInstance): Promise<void> {
  await fireEvent(board, 'layout', {
    nativeEvent: {
      layout: { height: BOARD_SIZE, width: BOARD_SIZE, x: 0, y: 0 },
    },
  });
}

async function tapBoard(
  boardId: string,
  point: Readonly<{ x: number; y: number }>,
): Promise<void> {
  const tap = getByGestureTestId(getBoardGestureTestIds(boardId).tap);
  await act(() => {
    fireGestureHandler(tap, [
      { state: State.BEGAN, ...point },
      { state: State.END, ...point },
    ]);
  });
  await act(async () => {
    await Promise.resolve();
  });
}

function boardTapCallbacks(boardId: string): Readonly<TapCallbacks> {
  const tap = getByGestureTestId(getBoardGestureTestIds(boardId).tap);
  return (tap as unknown as Readonly<{ handlers: Readonly<TapCallbacks> }>)
    .handlers;
}

function sparePanCallbacks(spareId: string): Readonly<PanCallbacks> {
  const pan = sparePan(spareId);
  return (pan as Readonly<{ handlers: Readonly<PanCallbacks> }>).handlers;
}

function sparePan(spareId: string): unknown {
  return getByGestureTestId(getSparePieceGestureTestId(spareId));
}

function gestureConfig(gesture: unknown): Readonly<Record<string, unknown>> {
  return (gesture as Readonly<{ config: Readonly<Record<string, unknown>> }>)
    .config;
}

async function beginSpareDrag(
  spareId: string,
): Promise<Readonly<PanCallbacks>> {
  const callbacks = sparePanCallbacks(spareId);
  await startSpareDrag(callbacks);
  return callbacks;
}

async function startSpareDrag(
  callbacks: Readonly<PanCallbacks>,
): Promise<void> {
  await act(() => {
    callbacks.onBegin?.({ absoluteX: 24, absoluteY: 24, x: 24, y: 24 });
    callbacks.onStart?.({ absoluteX: 36, absoluteY: 24, x: 36, y: 24 });
  });
}

async function releaseSpareDrag(
  callbacks: Readonly<PanCallbacks>,
  point: Readonly<{ x: number; y: number }>,
  windowPoint: Readonly<{ x: number; y: number }> = point,
): Promise<void> {
  await act(() => {
    const event = {
      absoluteX: windowPoint.x,
      absoluteY: windowPoint.y,
      x: point.x,
      y: point.y,
    };
    callbacks.onEnd?.(event, true);
    callbacks.onFinalize?.(event, true);
  });
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });
}

function providerOverlayId(boardId: string): string {
  return `chessboard-native:${boardId}:provider-drag-overlay`;
}

function moveRequestMock(
  decision: MoveDecision = { status: 'rejected' },
): jest.MockedFunction<OnMoveRequest> {
  return jest.fn<ReturnType<OnMoveRequest>, Parameters<OnMoveRequest>>(
    () => decision,
  );
}

function renderTarget(options: {
  readonly activationDistance?: number;
  readonly allowDragOffBoard?: boolean;
  readonly canDragPiece?: CanDragPiece;
  readonly disabled?: boolean;
  readonly dimensions?: BoardDimensions;
  readonly geometryRevision?: number;
  readonly interactionPermissions?: Readonly<{
    accessibility?: boolean;
    drag?: boolean;
  }>;
  readonly onMoveRequest?: OnMoveRequest;
  readonly onPieceDragStart?: OnPieceDragStart;
  readonly onPiecePress?: OnPiecePress;
  readonly orientation?: BoardOrientation;
  readonly positionRevision?: number;
  readonly runtimeRef?: { current: ChessboardProviderRuntime | null };
  readonly showBoard?: boolean;
  readonly showSpare?: boolean;
  readonly size?: number;
  readonly spareId?: string;
  readonly sparePieceRenderers?: PieceRenderers;
  readonly targetBoardId?: string;
}): ReactElement {
  const targetBoardId = options.targetBoardId ?? 'target-board';
  return (
    <ChessboardProvider geometryRevision={options.geometryRevision ?? 0}>
      {options.runtimeRef === undefined ? null : (
        <ProviderRuntimeProbe runtimeRef={options.runtimeRef} />
      )}
      {options.showSpare === false ? null : (
        <SparePiece
          disabled={options.disabled ?? false}
          piece={SPARE_PIECE}
          {...(options.sparePieceRenderers === undefined
            ? {}
            : { pieceRenderers: options.sparePieceRenderers })}
          {...(options.size === undefined ? {} : { size: options.size })}
          spareId={options.spareId ?? 'reserve'}
          targetBoardId={targetBoardId}
        />
      )}
      {options.showBoard === false ? null : (
        <Chessboard
          accessibility={{ boardLabel: 'target board' }}
          boardId={targetBoardId}
          {...(options.canDragPiece === undefined
            ? {}
            : { canDragPiece: options.canDragPiece })}
          dimensions={options.dimensions ?? { columns: 2, rows: 2 }}
          {...(options.activationDistance === undefined &&
          options.allowDragOffBoard === undefined
            ? {}
            : {
                gesture: {
                  ...(options.activationDistance === undefined
                    ? {}
                    : { activationDistance: options.activationDistance }),
                  ...(options.allowDragOffBoard === undefined
                    ? {}
                    : { allowDragOffBoard: options.allowDragOffBoard }),
                },
              })}
          {...(options.interactionPermissions === undefined
            ? {}
            : { interactionPermissions: options.interactionPermissions })}
          {...(options.onMoveRequest === undefined
            ? {}
            : { onMoveRequest: options.onMoveRequest })}
          {...(options.onPieceDragStart === undefined
            ? {}
            : { onPieceDragStart: options.onPieceDragStart })}
          {...(options.onPiecePress === undefined
            ? {}
            : { onPiecePress: options.onPiecePress })}
          orientation={options.orientation ?? 'white'}
          position={{ revision: options.positionRevision ?? 1, value: {} }}
          reduceMotion="never"
        />
      )}
    </ChessboardProvider>
  );
}

function ProviderRuntimeProbe({
  runtimeRef,
}: {
  readonly runtimeRef: { current: ChessboardProviderRuntime | null };
}): null {
  runtimeRef.current = useChessboardProvider().runtime;
  return null;
}

describe('SparePiece', () => {
  it('requires an explicit provider shared with its named target board', async () => {
    await expect(
      render(
        <SparePiece
          piece={SPARE_PIECE}
          spareId="orphan"
          targetBoardId="missing-target"
        />,
      ),
    ).rejects.toThrow(
      'SparePiece requires an explicit ChessboardProvider around both the source and its target board.',
    );
  });

  it('[PARITY-EXPORT-SPARE-PIECE] exports an accessible, decorative-renderer-safe external piece source', async () => {
    const renderPiece = jest.fn<ReactElement, [PieceRendererProps]>((props) => (
      <View
        accessibilityLabel="decorative renderer"
        accessibilityRole="image"
        testID={`spare-visual:${props.source.kind}:${props.square ?? 'null'}`}
      />
    ));
    const renderers = Object.freeze({
      wN: renderPiece,
    }) satisfies PieceRenderers;
    const announce = jest
      .spyOn(AccessibilityInfo, 'announceForAccessibility')
      .mockImplementation(() => undefined);
    const result = await render(
      <ChessboardProvider>
        <SparePiece
          accessibilityHint="Choose or drag the reserve knight"
          accessibilityLabel="reserve knight"
          piece={SPARE_PIECE}
          pieceRenderers={renderers}
          size={64}
          spareId="rendered-reserve"
          style={{ opacity: 0.75 }}
          targetBoardId="render-target"
        />
      </ChessboardProvider>,
    );

    expect(typeof SparePiece).toBe('function');
    const button = result.getByRole('button', {
      includeHiddenElements: true,
      name: 'reserve knight',
    });
    expect(button).toHaveProp(
      'accessibilityHint',
      'Choose or drag the reserve knight',
    );
    expect(button).toHaveProp('accessibilityState', {
      disabled: false,
      selected: false,
    });
    expect(
      result.getByTestId('chessboard-native:spare:rendered-reserve', {
        includeHiddenElements: true,
      }),
    ).toHaveStyle({ height: 64, opacity: 0.75, width: 64 });
    expect(renderPiece.mock.calls.at(-1)?.[0]).toEqual({
      boardId: 'render-target',
      piece: { id: 'reserve-knight', pieceType: 'wN' },
      size: 64,
      source: { kind: 'spare', spareId: 'rendered-reserve' },
      square: null,
      state: {
        isDragging: false,
        isGhost: false,
        isPending: false,
        isPressed: false,
        isTransitioning: false,
      },
      style: { opacity: 0.75 },
    });
    const visual = result.getByTestId('spare-visual:spare:null', {
      includeHiddenElements: true,
    });
    expect(visual.parent).toHaveProp('accessibilityElementsHidden', true);
    expect(visual.parent).toHaveProp('accessible', false);
    expect(visual.parent).toHaveProp(
      'importantForAccessibility',
      'no-hide-descendants',
    );

    await fireEvent.press(button);
    expect(result.getByRole('button', { name: 'reserve knight' })).toHaveProp(
      'accessibilityState',
      { disabled: false, selected: true },
    );
    expect(announce).toHaveBeenCalledWith(
      'reserve knight selected for render-target.',
    );
  });

  it.each(['constructor', 'toString', '__proto__'])(
    'uses an own-key-safe default label for custom piece type %s',
    async (pieceType) => {
      const result = await render(
        <ChessboardProvider>
          <SparePiece
            piece={{ pieceType }}
            spareId={`custom-${pieceType}`}
            targetBoardId="custom-target"
          />
        </ChessboardProvider>,
      );

      expect(
        result.getByRole('button', {
          includeHiddenElements: true,
          name: `${pieceType} piece spare`,
        }),
      ).toBeDefined();
    },
  );

  it('snapshots each own spare-piece field once into a detached frozen value', async () => {
    let pieceTypeReads = 0;
    let idReads = 0;
    let currentPieceType = 'custom';
    let currentId = 'custom-actor';
    const piece: Record<string, unknown> = {};
    Object.defineProperty(piece, 'pieceType', {
      enumerable: true,
      get: () => {
        pieceTypeReads += 1;
        return currentPieceType;
      },
    });
    Object.defineProperty(piece, 'id', {
      enumerable: true,
      get: () => {
        idReads += 1;
        return currentId;
      },
    });
    const renderPiece = jest.fn<ReactElement, [PieceRendererProps]>(() => (
      <View />
    ));
    const renderers = Object.freeze({ custom: renderPiece });
    await render(
      <ChessboardProvider>
        <SparePiece
          piece={piece as Readonly<{ pieceType: string }>}
          pieceRenderers={renderers}
          spareId="snapshot-source"
          targetBoardId="snapshot-target"
        />
      </ChessboardProvider>,
    );

    expect(pieceTypeReads).toBe(1);
    expect(idReads).toBe(1);
    currentPieceType = 'changed';
    currentId = 'changed-actor';
    expect(renderPiece.mock.calls.at(-1)?.[0].piece).toEqual({
      id: 'custom-actor',
      pieceType: 'custom',
    });
    expect(Object.isFrozen(renderPiece.mock.calls.at(-1)?.[0].piece)).toBe(
      true,
    );
  });

  it('ignores inherited spare-piece ids', async () => {
    let idReads = 0;
    const prototype = Object.defineProperty({}, 'id', {
      get: () => {
        idReads += 1;
        throw new Error('inherited id should not be read');
      },
    });
    const piece = Object.assign(Object.create(prototype), {
      pieceType: 'custom',
    }) as Readonly<PieceData>;
    const renderPiece = jest.fn<ReactElement, [PieceRendererProps]>(() => (
      <View />
    ));
    const renderers = Object.freeze({ custom: renderPiece });
    await render(
      <ChessboardProvider>
        <SparePiece
          piece={piece}
          pieceRenderers={renderers}
          spareId="inherited-id-source"
          targetBoardId="inherited-id-target"
        />
      </ChessboardProvider>,
    );

    expect(idReads).toBe(0);
    expect(renderPiece.mock.calls.at(-1)?.[0].piece).toEqual({
      pieceType: 'custom',
    });
  });

  it('rejects inherited piece types at the public spare boundary', async () => {
    const inherited = Object.create({ pieceType: 'wQ' }) as Readonly<PieceData>;
    await expect(
      render(
        <ChessboardProvider>
          <SparePiece
            piece={inherited}
            spareId="inherited-piece"
            targetBoardId="target"
          />
        </ChessboardProvider>,
      ),
    ).rejects.toThrow('SparePiece piece.pieceType must be a string.');
  });

  it('[PARITY-BEHAVIOR-B03] composes an accessible spare selection with only its named board control', async () => {
    const targetMove = moveRequestMock();
    const otherMove = moveRequestMock();
    const result = await render(
      <ChessboardProvider>
        <SparePiece
          piece={SPARE_PIECE}
          spareId="named-reserve"
          targetBoardId="right"
        />
        <Chessboard
          accessibility={{ boardLabel: 'left board' }}
          boardId="left"
          dimensions={{ columns: 2, rows: 2 }}
          onMoveRequest={otherMove}
          position={{ revision: 3, value: {} }}
          reduceMotion="never"
        />
        <Chessboard
          accessibility={{ boardLabel: 'right board' }}
          annotations={{ revision: 2, value: [] }}
          annotationTool={{ color: '#ef4444', type: 'arrow' }}
          boardId="right"
          dimensions={{ columns: 2, rows: 2 }}
          onAnnotationOperation={jest.fn()}
          onMoveRequest={targetMove}
          position={{ revision: 8, value: {} }}
          reduceMotion="never"
        />
      </ChessboardProvider>,
    );
    const spare = result.getByRole('button');
    const left = boardByLabel(result, 'left board');
    const right = boardByLabel(result, 'right board');
    await measureBoard(right);
    expect(actionNames(boardByLabel(result, 'right board'))).toContain(
      'start-arrow',
    );
    await accessibilityAction(
      boardByLabel(result, 'right board'),
      'start-arrow',
    );
    expect(actionNames(boardByLabel(result, 'right board'))).toContain(
      'cancel-annotation',
    );

    await fireEvent.press(spare);
    expect(actionNames(left)).not.toContain('place-spare');
    expect(actionNames(left)).not.toContain('cancel-spare');
    expect(actionNames(right)).toEqual(
      expect.arrayContaining(['place-spare', 'cancel-spare']),
    );
    expect(actionNames(right)).not.toContain('start-arrow');
    expect(actionNames(right)).not.toContain('cancel-annotation');

    await accessibilityAction(right, 'cancel-spare');
    expect(spare).toHaveProp('accessibilityState', {
      disabled: false,
      selected: false,
    });
    expect(targetMove).not.toHaveBeenCalled();
    expect(otherMove).not.toHaveBeenCalled();
    expect(actionNames(boardByLabel(result, 'right board'))).toContain(
      'start-arrow',
    );

    await fireEvent.press(spare);
    await accessibilityAction(
      boardByLabel(result, 'right board'),
      'place-spare',
    );
    expect(otherMove).not.toHaveBeenCalled();
    expect(targetMove).toHaveBeenCalledTimes(1);
    expect(targetMove.mock.calls[0]?.[0]).toEqual(
      expect.objectContaining({
        basePositionRevision: 8,
        boardId: 'right',
        input: 'accessibility',
        piece: { id: 'reserve-knight', pieceType: 'wN' },
        source: { kind: 'spare', spareId: 'named-reserve' },
        targetSquare: 'a2',
      }),
    );
    expect(targetMove.mock.calls[0]?.[1].signal).toBeInstanceOf(AbortSignal);
    expect(result.getByRole('button')).toHaveProp('accessibilityState', {
      disabled: false,
      selected: false,
    });
  });

  it('does not reset an unrelated board gesture when a spare is selected for another board', async () => {
    const onLeftSquareActivate = jest.fn<
      ReturnType<OnSquareActivate>,
      Parameters<OnSquareActivate>
    >();
    const result = await render(
      <ChessboardProvider>
        <SparePiece
          piece={SPARE_PIECE}
          spareId="right-reserve"
          targetBoardId="right-target"
        />
        <Chessboard
          accessibility={{ boardLabel: 'left gesture board' }}
          boardId="left-gesture"
          dimensions={{ columns: 2, rows: 2 }}
          onSquareActivate={onLeftSquareActivate}
          position={{ revision: 3, value: {} }}
          reduceMotion="always"
        />
        <Chessboard
          accessibility={{ boardLabel: 'right target board' }}
          boardId="right-target"
          dimensions={{ columns: 2, rows: 2 }}
          onMoveRequest={moveRequestMock()}
          position={{ revision: 7, value: {} }}
          reduceMotion="always"
        />
      </ChessboardProvider>,
    );
    await measureBoard(boardByLabel(result, 'left gesture board'));
    await measureBoard(boardByLabel(result, 'right target board'));

    const retainedLeftTap = boardTapCallbacks('left-gesture');
    await act(() => {
      retainedLeftTap.onBegin?.({ x: 20, y: 20 });
    });
    await fireEvent.press(result.getByRole('button'));
    await act(() => {
      retainedLeftTap.onEnd?.({ x: 20, y: 20 }, true);
      retainedLeftTap.onFinalize?.({ x: 20, y: 20 }, true);
    });
    await act(async () => {
      await Promise.resolve();
    });

    expect(onLeftSquareActivate).toHaveBeenCalledTimes(1);
    expect(onLeftSquareActivate.mock.calls[0]?.[0]).toEqual(
      expect.objectContaining({
        basePositionRevision: 3,
        boardId: 'left-gesture',
        input: 'touch',
        square: 'a2',
      }),
    );
    expect(result.getByRole('button')).toHaveProp('accessibilityState', {
      disabled: false,
      selected: true,
    });
  });

  it('routes a selected spare tap through the current board while accessible moves are disabled', async () => {
    const boardId = 'variant-editor';
    const fairy = Object.freeze({ id: 'fairy-offer-1', pieceType: 'fairy' });
    const variantRenderers = Object.freeze({
      blocker: () => <View />,
      fairy: () => <View />,
    });
    const stalePosition = Object.freeze({
      revision: 17,
      value: Object.freeze({
        c1: Object.freeze({ id: 'occupied-c1', pieceType: 'blocker' }),
      }),
    }) satisfies ControlledPosition;
    const staleMoveRequest = moveRequestMock({ status: 'accepted' });
    const currentMoveRequest = moveRequestMock({ status: 'accepted' });
    const onAnnotationOperation = jest.fn();
    const onPiecePress = jest.fn<
      ReturnType<OnPiecePress>,
      Parameters<OnPiecePress>
    >();
    const onSquareActivate = jest.fn();
    const renderEditor = (
      onMoveRequest: OnMoveRequest,
      position: ControlledPosition,
    ): ReactElement => (
      <ChessboardProvider>
        <SparePiece
          piece={fairy}
          pieceRenderers={variantRenderers}
          spareId="fairy-offer"
          targetBoardId={boardId}
        />
        <Chessboard
          accessibility={{ boardLabel: 'variant editor board' }}
          annotations={{
            revision: 3,
            value: [
              {
                color: '#ef4444',
                id: 'existing-mark',
                square: 'c1',
                type: 'square',
              },
            ],
          }}
          annotationPolicies={{ clearOnBoardPress: true }}
          annotationTool={{ color: '#ef4444', type: 'arrow' }}
          boardId={boardId}
          dimensions={{ columns: 3, rows: 2 }}
          interactionPermissions={{ accessibility: false }}
          onAnnotationOperation={onAnnotationOperation}
          onMoveRequest={onMoveRequest}
          onPiecePress={onPiecePress}
          onSquareActivate={onSquareActivate}
          orientation="black"
          pieceRenderers={variantRenderers}
          position={position}
          reduceMotion="always"
        />
      </ChessboardProvider>
    );
    const result = await render(renderEditor(staleMoveRequest, stalePosition));
    const board = boardByLabel(result, 'variant editor board');
    await measureBoard(board);
    const spare = result.getByRole('button');

    await fireEvent.press(spare);
    expect(onPiecePress).toHaveBeenCalledTimes(1);
    onPiecePress.mockClear();
    expect(
      actionNames(boardByLabel(result, 'variant editor board')),
    ).not.toContain('place-spare');

    const currentPosition = Object.freeze({
      revision: 23,
      value: stalePosition.value,
    }) satisfies ControlledPosition;
    await result.rerender(renderEditor(currentMoveRequest, currentPosition));

    // Black orientation maps the visual top-left cell to canonical c1.
    await tapBoard(boardId, { x: 20, y: 20 });

    expect(staleMoveRequest).not.toHaveBeenCalled();
    expect(currentMoveRequest).toHaveBeenCalledTimes(1);
    expect(currentMoveRequest.mock.calls[0]?.[0]).toEqual(
      expect.objectContaining({
        basePositionRevision: 23,
        boardId,
        input: 'tap',
        piece: fairy,
        source: { kind: 'spare', spareId: 'fairy-offer' },
        targetSquare: 'c1',
      }),
    );
    expect(currentMoveRequest.mock.calls[0]?.[1].signal).toBeInstanceOf(
      AbortSignal,
    );
    expect(onAnnotationOperation).not.toHaveBeenCalled();
    expect(onPiecePress).not.toHaveBeenCalled();
    expect(onSquareActivate).not.toHaveBeenCalled();
    expect(currentPosition.value).toEqual({
      c1: { id: 'occupied-c1', pieceType: 'blocker' },
    });
    expect(boardByLabel(result, 'variant editor board')).toHaveProp(
      'accessibilityValue',
      expect.objectContaining({
        text: 'c1, blocker piece',
      }),
    );
    expect(result.getByRole('button')).toHaveProp('accessibilityState', {
      disabled: false,
      selected: false,
    });

    const intent = currentMoveRequest.mock.calls[0]?.[0];
    if (intent === undefined) {
      throw new Error('Expected the selected-spare tap intent.');
    }
    await result.rerender(
      renderEditor(
        currentMoveRequest,
        Object.freeze({
          committedIntentId: intent.intentId,
          revision: 24,
          value: Object.freeze({ c1: fairy }),
        }),
      ),
    );
    expect(boardByLabel(result, 'variant editor board')).toHaveProp(
      'accessibilityValue',
      expect.objectContaining({ text: 'c1, fairy piece' }),
    );
  });

  it('keeps a selected spare when its tapped target is controlled-disabled', async () => {
    const onMoveRequest = moveRequestMock({ status: 'accepted' });
    const result = await render(
      <ChessboardProvider>
        <SparePiece
          piece={SPARE_PIECE}
          spareId="disabled-target-spare"
          targetBoardId="disabled-target-board"
        />
        <Chessboard
          accessibility={{ boardLabel: 'disabled target board' }}
          boardId="disabled-target-board"
          dimensions={{ columns: 3, rows: 2 }}
          onMoveRequest={onMoveRequest}
          orientation="black"
          position={{ revision: 4, value: {} }}
          reduceMotion="always"
          selection={{
            disabledSquares: ['c1'],
            revision: 2,
            selectedSquare: null,
          }}
        />
      </ChessboardProvider>,
    );
    await measureBoard(boardByLabel(result, 'disabled target board'));

    await fireEvent.press(result.getByRole('button'));
    await tapBoard('disabled-target-board', { x: 20, y: 20 });

    expect(onMoveRequest).not.toHaveBeenCalled();
    expect(result.getByRole('button')).toHaveProp('accessibilityState', {
      disabled: false,
      selected: true,
    });
  });

  it('rejects a retained tap after another spare replaces its selection epoch', async () => {
    const boardId = 'selection-epoch-board';
    const onMoveRequest = moveRequestMock({ status: 'accepted' });
    const result = await render(
      <ChessboardProvider>
        <SparePiece
          piece={{ id: 'first-offer', pieceType: 'wN' }}
          spareId="first-offer"
          targetBoardId={boardId}
        />
        <SparePiece
          piece={{ id: 'second-offer', pieceType: 'bB' }}
          spareId="second-offer"
          targetBoardId={boardId}
        />
        <Chessboard
          accessibility={{ boardLabel: 'selection epoch board' }}
          boardId={boardId}
          dimensions={{ columns: 3, rows: 2 }}
          onMoveRequest={onMoveRequest}
          orientation="black"
          position={{ revision: 9, value: {} }}
          reduceMotion="always"
        />
      </ChessboardProvider>,
    );
    await measureBoard(boardByLabel(result, 'selection epoch board'));
    const first = result.getByRole('button', {
      name: 'white knight spare',
    });
    const second = result.getByRole('button', {
      name: 'black bishop spare',
    });

    await fireEvent.press(first);
    const retained = boardTapCallbacks(boardId);
    await act(() => {
      retained.onBegin?.({ x: 20, y: 20 });
    });
    await fireEvent.press(second);
    await act(() => {
      retained.onEnd?.({ x: 20, y: 20 }, true);
      retained.onFinalize?.({ x: 20, y: 20 }, true);
    });
    await act(async () => {
      await Promise.resolve();
    });

    expect(onMoveRequest).not.toHaveBeenCalled();
    expect(second).toHaveProp('accessibilityState', {
      disabled: false,
      selected: true,
    });

    await tapBoard(boardId, { x: 20, y: 20 });
    expect(onMoveRequest).toHaveBeenCalledTimes(1);
    expect(onMoveRequest.mock.calls[0]?.[0]).toEqual(
      expect.objectContaining({
        input: 'tap',
        piece: { id: 'second-offer', pieceType: 'bB' },
        source: { kind: 'spare', spareId: 'second-offer' },
        targetSquare: 'c1',
      }),
    );
  });

  it('[PARITY-BEHAVIOR-B32] uses the target board current callback and revision and preserves null off-board drag targets', async () => {
    mockBoardWindowBounds();
    const staleMove = moveRequestMock();
    const currentMove = moveRequestMock();
    const result = await render(
      renderTarget({ onMoveRequest: staleMove, positionRevision: 4 }),
    );
    await measureBoard(boardByLabel(result, 'target board'));

    const callbacks = await beginSpareDrag('reserve');
    expect(
      result.queryAllByTestId(providerOverlayId('target-board'), {
        includeHiddenElements: true,
      }),
    ).toHaveLength(1);
    await result.rerender(
      renderTarget({ onMoveRequest: currentMove, positionRevision: 11 }),
    );

    await releaseSpareDrag(callbacks, { x: 350, y: 250 });
    await waitFor(() => {
      expect(currentMove).toHaveBeenCalledTimes(1);
    });
    expect(staleMove).not.toHaveBeenCalled();
    expect(currentMove.mock.calls[0]?.[0]).toEqual(
      expect.objectContaining({
        basePositionRevision: 11,
        boardId: 'target-board',
        input: 'drag',
        piece: { id: 'reserve-knight', pieceType: 'wN' },
        source: { kind: 'spare', spareId: 'reserve' },
        targetSquare: null,
      }),
    );
    expect(currentMove.mock.calls[0]?.[1].signal).toBeInstanceOf(AbortSignal);
    expect(
      result.queryAllByTestId(providerOverlayId('target-board'), {
        includeHiddenElements: true,
      }),
    ).toEqual([]);
  });

  it('inherits current target activation config, routes current piece callbacks, and cancels an active drag when config changes', async () => {
    mockBoardWindowBounds();
    const onMoveRequest = moveRequestMock();
    const staleDragStart = jest.fn<
      ReturnType<OnPieceDragStart>,
      Parameters<OnPieceDragStart>
    >();
    const stalePress = jest.fn<
      ReturnType<OnPiecePress>,
      Parameters<OnPiecePress>
    >();
    const currentDragStart = jest.fn<
      ReturnType<OnPieceDragStart>,
      Parameters<OnPieceDragStart>
    >();
    const currentPress = jest.fn<
      ReturnType<OnPiecePress>,
      Parameters<OnPiecePress>
    >();
    const result = await render(
      renderTarget({
        activationDistance: 6,
        onMoveRequest,
        onPieceDragStart: staleDragStart,
        onPiecePress: stalePress,
        positionRevision: 4,
      }),
    );
    await measureBoard(boardByLabel(result, 'target board'));
    const retainedCallbacks = sparePanCallbacks('reserve');
    expect(gestureConfig(sparePan('reserve'))['minDist']).toBe(6);

    await result.rerender(
      renderTarget({
        activationDistance: 11,
        onMoveRequest,
        onPieceDragStart: currentDragStart,
        onPiecePress: currentPress,
        positionRevision: 11,
      }),
    );
    expect(gestureConfig(sparePan('reserve'))['minDist']).toBe(11);
    await startSpareDrag(retainedCallbacks);
    expect(staleDragStart).not.toHaveBeenCalled();
    expect(currentDragStart).not.toHaveBeenCalled();

    const spare = result.getByRole('button');
    await fireEvent.press(spare);
    expect(stalePress).not.toHaveBeenCalled();
    expect(currentPress).toHaveBeenCalledTimes(1);
    expect(currentPress).toHaveBeenCalledWith({
      basePositionRevision: 11,
      boardId: 'target-board',
      piece: { id: 'reserve-knight', pieceType: 'wN' },
      source: { kind: 'spare', spareId: 'reserve' },
    });

    const currentCallbacks = await beginSpareDrag('reserve');
    expect(staleDragStart).not.toHaveBeenCalled();
    expect(currentDragStart).toHaveBeenCalledTimes(1);
    expect(currentDragStart).toHaveBeenCalledWith({
      basePositionRevision: 11,
      boardId: 'target-board',
      piece: { id: 'reserve-knight', pieceType: 'wN' },
      source: { kind: 'spare', spareId: 'reserve' },
    });
    expect(currentPress).toHaveBeenCalledTimes(1);
    expect(
      result.queryAllByTestId(providerOverlayId('target-board'), {
        includeHiddenElements: true,
      }),
    ).toHaveLength(1);

    await result.rerender(
      renderTarget({
        activationDistance: 18,
        onMoveRequest,
        onPieceDragStart: currentDragStart,
        onPiecePress: currentPress,
        positionRevision: 11,
      }),
    );
    expect(gestureConfig(sparePan('reserve'))['minDist']).toBe(18);
    expect(
      result.queryAllByTestId(providerOverlayId('target-board'), {
        includeHiddenElements: true,
      }),
    ).toEqual([]);
    await releaseSpareDrag(currentCallbacks, { x: 125, y: 225 });

    expect(onMoveRequest).not.toHaveBeenCalled();
    expect(currentDragStart).toHaveBeenCalledTimes(1);
    expect(currentPress).toHaveBeenCalledTimes(1);
  });

  it('[PARITY-OPTION-ALLOW-DRAG-OFF-BOARD] inherits target overlay bounds and cancels a stale policy generation', async () => {
    mockBoardWindowBounds();
    const runtimeRef: { current: ChessboardProviderRuntime | null } = {
      current: null,
    };
    const onMoveRequest = moveRequestMock();
    const result = await render(
      renderTarget({
        allowDragOffBoard: false,
        onMoveRequest,
        runtimeRef,
      }),
    );
    await measureBoard(boardByLabel(result, 'target board'));
    const boundedCallbacks = await beginSpareDrag('reserve');
    const bounded = runtimeRef.current?.drag.getSnapshot().active?.bounds;
    if (bounded?.kind !== 'window') {
      throw new Error('Expected target-board window drag bounds.');
    }
    expect(bounded.ready.value).toBe(1);
    expect({
      height: bounded.height.value,
      width: bounded.width.value,
      x: bounded.x.value,
      y: bounded.y.value,
    }).toEqual(BOARD_BOUNDS);
    expect(
      getAnimatedStyle(
        result.getByTestId(providerOverlayId('target-board'), {
          includeHiddenElements: true,
        }),
      ),
    ).toEqual(
      expect.objectContaining({
        opacity: 1,
        transform: [{ translateX: -24 }, { translateY: -24 }],
      }),
    );

    await result.rerender(
      renderTarget({ allowDragOffBoard: true, onMoveRequest, runtimeRef }),
    );
    expect(runtimeRef.current?.drag.getSnapshot().active).toBeNull();
    await releaseSpareDrag(boundedCallbacks, { x: 125, y: 225 });
    expect(onMoveRequest).not.toHaveBeenCalled();

    await beginSpareDrag('reserve');
    expect(runtimeRef.current?.drag.getSnapshot().active?.bounds).toBeNull();
  });

  it('invalidates a retained spare start when the same target id is replaced at the same effective default activation distance', async () => {
    const oldMoveRequest = moveRequestMock();
    const currentMoveRequest = moveRequestMock();
    const oldDragStart = jest.fn<
      ReturnType<OnPieceDragStart>,
      Parameters<OnPieceDragStart>
    >();
    const currentDragStart = jest.fn<
      ReturnType<OnPieceDragStart>,
      Parameters<OnPieceDragStart>
    >();
    const result = await render(
      renderTarget({
        onMoveRequest: oldMoveRequest,
        onPieceDragStart: oldDragStart,
        positionRevision: 4,
      }),
    );
    await measureBoard(boardByLabel(result, 'target board'));
    const retainedCallbacks = sparePanCallbacks('reserve');
    expect(gestureConfig(sparePan('reserve'))['minDist']).toBe(4);

    await result.rerender(
      renderTarget({
        onMoveRequest: oldMoveRequest,
        onPieceDragStart: oldDragStart,
        positionRevision: 4,
        showBoard: false,
      }),
    );
    expect(gestureConfig(sparePan('reserve'))['minDist']).toBe(4);

    await result.rerender(
      renderTarget({
        onMoveRequest: currentMoveRequest,
        onPieceDragStart: currentDragStart,
        positionRevision: 11,
      }),
    );
    await measureBoard(boardByLabel(result, 'target board'));
    expect(gestureConfig(sparePan('reserve'))['minDist']).toBe(4);
    await startSpareDrag(retainedCallbacks);

    expect(oldDragStart).not.toHaveBeenCalled();
    expect(currentDragStart).not.toHaveBeenCalled();
    expect(oldMoveRequest).not.toHaveBeenCalled();
    expect(currentMoveRequest).not.toHaveBeenCalled();
    expect(
      result.queryAllByTestId(providerOverlayId('target-board'), {
        includeHiddenElements: true,
      }),
    ).toEqual([]);
  });

  it('synchronously rejects a retained queued start after another provider source replaces its drag lease', async () => {
    mockBoardWindowBounds();
    const onPieceDragStart = jest.fn<
      ReturnType<OnPieceDragStart>,
      Parameters<OnPieceDragStart>
    >();
    const runtimeRef: { current: ChessboardProviderRuntime | null } = {
      current: null,
    };
    const result = await render(
      <ChessboardProvider>
        <ProviderRuntimeProbe runtimeRef={runtimeRef} />
        <SparePiece
          piece={{ id: 'first-knight', pieceType: 'wN' }}
          spareId="first-reserve"
          targetBoardId="target-board"
        />
        <SparePiece
          piece={{ id: 'second-bishop', pieceType: 'wB' }}
          spareId="second-reserve"
          targetBoardId="target-board"
        />
        <Chessboard
          accessibility={{ boardLabel: 'target board' }}
          boardId="target-board"
          dimensions={{ columns: 2, rows: 2 }}
          onMoveRequest={moveRequestMock()}
          onPieceDragStart={onPieceDragStart}
          position={{ revision: 11, value: {} }}
          reduceMotion="never"
        />
      </ChessboardProvider>,
    );
    await measureBoard(boardByLabel(result, 'target board'));
    const firstCallbacks = await beginSpareDrag('first-reserve');
    const secondCallbacks = sparePanCallbacks('second-reserve');

    await act(() => {
      secondCallbacks.onBegin?.({
        absoluteX: 24,
        absoluteY: 24,
        x: 24,
        y: 24,
      });
      secondCallbacks.onStart?.({
        absoluteX: 36,
        absoluteY: 24,
        x: 36,
        y: 24,
      });
      firstCallbacks.onBegin?.({
        absoluteX: 24,
        absoluteY: 24,
        x: 24,
        y: 24,
      });
      firstCallbacks.onStart?.({
        absoluteX: 36,
        absoluteY: 24,
        x: 36,
        y: 24,
      });
    });

    expect(onPieceDragStart.mock.calls).toEqual([
      [
        {
          basePositionRevision: 11,
          boardId: 'target-board',
          piece: { id: 'first-knight', pieceType: 'wN' },
          source: { kind: 'spare', spareId: 'first-reserve' },
        },
      ],
      [
        {
          basePositionRevision: 11,
          boardId: 'target-board',
          piece: { id: 'second-bishop', pieceType: 'wB' },
          source: { kind: 'spare', spareId: 'second-reserve' },
        },
      ],
    ]);
    expect(runtimeRef.current?.drag.getSnapshot().active?.source).toEqual({
      kind: 'spare',
      spareId: 'second-reserve',
    });
    expect(
      result.queryAllByTestId(providerOverlayId('target-board'), {
        includeHiddenElements: true,
      }),
    ).toHaveLength(1);
  });

  it('publishes only validated spare hover boundaries and renders the source as a target-correlated ghost', async () => {
    mockBoardWindowBounds();
    const renderPiece = jest.fn<ReactElement, [PieceRendererProps]>(() => (
      <View />
    ));
    const result = await render(
      renderTarget({
        onMoveRequest: moveRequestMock(),
        sparePieceRenderers: Object.freeze({ wN: renderPiece }),
      }),
    );
    await measureBoard(boardByLabel(result, 'target board'));
    const callbacks = await beginSpareDrag('reserve');
    const ghostCalls = (): PieceRendererProps[] =>
      renderPiece.mock.calls
        .map(([props]) => props)
        .filter(({ state }) => state.isGhost);
    const dragCalls = (): PieceRendererProps[] =>
      renderPiece.mock.calls
        .map(([props]) => props)
        .filter(({ state }) => state.isDragging);

    await waitFor(() => {
      const initialGhost = ghostCalls().at(-1);
      expect(initialGhost).toEqual(
        expect.objectContaining({
          boardId: 'target-board',
          source: { kind: 'spare', spareId: 'reserve' },
          square: null,
        }),
      );
      expect(initialGhost?.state.isGhost).toBe(true);
      expect(
        result.getByTestId('chessboard-native:spare:reserve', {
          includeHiddenElements: true,
        }),
      ).toHaveStyle({ opacity: 0.5 });
    });

    await act(() => {
      callbacks.onUpdate?.({ absoluteX: 125, absoluteY: 225, x: 50, y: 50 });
    });
    await waitFor(() => {
      expect(ghostCalls().at(-1)?.square).toBeNull();
      expect(dragCalls().at(-1)?.square).toBe('a2');
    });
    const firstBoundaryCallCount = ghostCalls().length;
    const firstBoundaryOverlayCallCount = dragCalls().length;

    await act(() => {
      callbacks.onUpdate?.({ absoluteX: 150, absoluteY: 250, x: 75, y: 75 });
    });
    expect(ghostCalls()).toHaveLength(firstBoundaryCallCount);
    expect(dragCalls()).toHaveLength(firstBoundaryOverlayCallCount);

    await act(() => {
      callbacks.onUpdate?.({ absoluteX: 225, absoluteY: 225, x: 150, y: 50 });
    });
    await waitFor(() => {
      expect(ghostCalls().at(-1)?.square).toBeNull();
      expect(dragCalls().at(-1)?.square).toBe('b2');
    });

    await act(() => {
      callbacks.onUpdate?.({ absoluteX: 350, absoluteY: 250, x: 275, y: 75 });
    });
    await waitFor(() => {
      expect(ghostCalls().at(-1)?.square).toBeNull();
      expect(dragCalls().at(-1)?.square).toBeNull();
    });

    await act(() => {
      callbacks.onFinalize?.(
        { absoluteX: 350, absoluteY: 250, x: 275, y: 75 },
        false,
      );
    });
    expect(
      result.queryAllByTestId(providerOverlayId('target-board'), {
        includeHiddenElements: true,
      }),
    ).toEqual([]);
  });

  it('rejects retained UI-thread gesture signals after the spare source unmounts', async () => {
    mockBoardWindowBounds();
    const onMoveRequest = moveRequestMock({ status: 'accepted' });
    const result = await render(
      renderTarget({ onMoveRequest, showSpare: true }),
    );
    await measureBoard(boardByLabel(result, 'target board'));
    const retainedCallbacks = sparePanCallbacks('reserve');

    await result.rerender(renderTarget({ onMoveRequest, showSpare: false }));
    await startSpareDrag(retainedCallbacks);
    await releaseSpareDrag(retainedCallbacks, { x: 125, y: 225 });

    expect(onMoveRequest).not.toHaveBeenCalled();
  });

  it('cancels an active spare drag when its target unmounts, ignores the stale terminal, and recovers after remount', async () => {
    mockBoardWindowBounds();
    const onMoveRequest = moveRequestMock({ status: 'accepted' });
    const result = await render(
      renderTarget({ onMoveRequest, showBoard: true }),
    );
    await measureBoard(boardByLabel(result, 'target board'));

    const staleCallbacks = await beginSpareDrag('reserve');
    expect(
      result.queryAllByTestId(providerOverlayId('target-board'), {
        includeHiddenElements: true,
      }),
    ).toHaveLength(1);

    await result.rerender(renderTarget({ onMoveRequest, showBoard: false }));
    expect(
      result.queryAllByTestId(providerOverlayId('target-board'), {
        includeHiddenElements: true,
      }),
    ).toEqual([]);

    await releaseSpareDrag(staleCallbacks, { x: 125, y: 225 });
    expect(onMoveRequest).not.toHaveBeenCalled();

    await result.rerender(renderTarget({ onMoveRequest, showBoard: true }));
    await measureBoard(boardByLabel(result, 'target board'));
    const freshCallbacks = await beginSpareDrag('reserve');
    await releaseSpareDrag(freshCallbacks, { x: 125, y: 225 });

    await waitFor(() => {
      expect(onMoveRequest).toHaveBeenCalledTimes(1);
    });
    expect(onMoveRequest.mock.calls[0]?.[0]).toEqual(
      expect.objectContaining({
        source: { kind: 'spare', spareId: 'reserve' },
        targetSquare: 'a2',
      }),
    );
  });

  it.each([
    {
      dimensions: { columns: 2, rows: 2 },
      expectedTargetSquare: 'b1',
      label: 'orientation',
      orientation: 'black' as const,
    },
    {
      dimensions: { columns: 4, rows: 2 },
      expectedTargetSquare: 'a2',
      label: 'effective dimensions',
      orientation: 'white' as const,
    },
  ])(
    'cancels an active spare drag after target $label changes, rejects its stale terminal, and recovers',
    async ({ dimensions, expectedTargetSquare, orientation }) => {
      mockBoardWindowBounds();
      const onMoveRequest = moveRequestMock({ status: 'accepted' });
      const result = await render(renderTarget({ onMoveRequest }));
      await measureBoard(boardByLabel(result, 'target board'));

      const staleCallbacks = await beginSpareDrag('reserve');
      await result.rerender(
        renderTarget({
          dimensions,
          onMoveRequest,
          orientation,
        }),
      );
      expect(
        result.queryAllByTestId(providerOverlayId('target-board'), {
          includeHiddenElements: true,
        }),
      ).toEqual([]);

      await releaseSpareDrag(staleCallbacks, { x: 125, y: 225 });
      expect(onMoveRequest).not.toHaveBeenCalled();

      await measureBoard(boardByLabel(result, 'target board'));
      const freshCallbacks = await beginSpareDrag('reserve');
      await releaseSpareDrag(freshCallbacks, { x: 125, y: 225 });
      await waitFor(() => {
        expect(onMoveRequest).toHaveBeenCalledTimes(1);
      });
      expect(onMoveRequest.mock.calls[0]?.[0]).toEqual(
        expect.objectContaining({
          targetSquare: expectedTargetSquare,
        }),
      );
    },
  );

  it('cancels provider transients and spare selection on background, ignores the stale terminal, and recovers when active', async () => {
    const appStateListener: {
      current: ((state: AppStateStatus) => void) | null;
    } = { current: null };
    jest
      .spyOn(AppState, 'addEventListener')
      .mockImplementation((_type, listener) => {
        appStateListener.current = listener;
        return { remove: jest.fn() };
      });
    mockBoardWindowBounds();
    const onMoveRequest = moveRequestMock({ status: 'accepted' });
    const result = await render(renderTarget({ onMoveRequest }));
    await measureBoard(boardByLabel(result, 'target board'));
    const notifyAppState = appStateListener.current;
    if (notifyAppState === null) {
      throw new Error('Expected the provider AppState listener.');
    }

    await fireEvent.press(result.getByRole('button'));
    expect(result.getByRole('button')).toHaveProp('accessibilityState', {
      disabled: false,
      selected: true,
    });
    await act(() => {
      notifyAppState('active');
      notifyAppState('background');
    });
    expect(result.getByRole('button')).toHaveProp('accessibilityState', {
      disabled: false,
      selected: false,
    });

    await act(() => {
      notifyAppState('active');
    });
    const staleCallbacks = await beginSpareDrag('reserve');
    expect(
      result.queryAllByTestId(providerOverlayId('target-board'), {
        includeHiddenElements: true,
      }),
    ).toHaveLength(1);
    await act(() => {
      notifyAppState('background');
    });
    expect(
      result.queryAllByTestId(providerOverlayId('target-board'), {
        includeHiddenElements: true,
      }),
    ).toEqual([]);

    await releaseSpareDrag(staleCallbacks, { x: 125, y: 225 });
    expect(onMoveRequest).not.toHaveBeenCalled();

    await act(() => {
      notifyAppState('active');
    });
    const freshCallbacks = await beginSpareDrag('reserve');
    await releaseSpareDrag(freshCallbacks, { x: 125, y: 225 });
    await waitFor(() => {
      expect(onMoveRequest).toHaveBeenCalledTimes(1);
    });
  });

  it('rejects retained UI-thread gesture signals after disable and identity commits', async () => {
    mockBoardWindowBounds();
    const onMoveRequest = moveRequestMock({ status: 'accepted' });
    const result = await render(renderTarget({ onMoveRequest }));
    await measureBoard(boardByLabel(result, 'target board'));
    const enabledCallbacks = sparePanCallbacks('reserve');

    await result.rerender(renderTarget({ disabled: true, onMoveRequest }));
    await startSpareDrag(enabledCallbacks);
    await releaseSpareDrag(enabledCallbacks, { x: 125, y: 225 });

    await result.rerender(
      renderTarget({ onMoveRequest, spareId: 'identity-before' }),
    );
    const identityCallbacks = sparePanCallbacks('identity-before');
    await result.rerender(
      renderTarget({ onMoveRequest, spareId: 'identity-after' }),
    );
    await startSpareDrag(identityCallbacks);
    await releaseSpareDrag(identityCallbacks, { x: 125, y: 225 });

    expect(onMoveRequest).not.toHaveBeenCalled();
  });

  it.each([
    ['accepted', { status: 'accepted' } as const],
    ['rejected', { status: 'rejected', reason: 'not now' } as const],
  ])(
    'routes an inside drag through the controlled %s decision and always removes the provider overlay',
    async (_label, decision: MoveDecision) => {
      mockBoardWindowBounds();
      const onMoveRequest = moveRequestMock(decision);
      const result = await render(renderTarget({ onMoveRequest }));
      await measureBoard(boardByLabel(result, 'target board'));

      const callbacks = await beginSpareDrag('reserve');
      expect(
        result.queryAllByTestId(providerOverlayId('target-board'), {
          includeHiddenElements: true,
        }),
      ).toHaveLength(1);
      await releaseSpareDrag(callbacks, { x: 125, y: 225 });

      await waitFor(() => {
        expect(onMoveRequest).toHaveBeenCalledTimes(1);
      });
      expect(onMoveRequest.mock.calls[0]?.[0]).toEqual(
        expect.objectContaining({
          basePositionRevision: 1,
          boardId: 'target-board',
          input: 'drag',
          source: { kind: 'spare', spareId: 'reserve' },
          targetSquare: 'a2',
        }),
      );
      expect(onMoveRequest.mock.calls[0]?.[1].signal).toBeInstanceOf(
        AbortSignal,
      );
      expect(
        result.queryAllByTestId(providerOverlayId('target-board'), {
          includeHiddenElements: true,
        }),
      ).toEqual([]);
    },
  );

  it.each([
    {
      canDragPiece: undefined,
      interactionPermissions: { accessibility: true, drag: false },
      label: 'declarative drag permission',
    },
    {
      canDragPiece: jest.fn<ReturnType<CanDragPiece>, Parameters<CanDragPiece>>(
        () => false,
      ),
      interactionPermissions: undefined,
      label: 'false canDragPiece callback',
    },
    {
      canDragPiece: jest.fn<ReturnType<CanDragPiece>, Parameters<CanDragPiece>>(
        () => {
          throw new Error('hostile permission callback');
        },
      ),
      interactionPermissions: undefined,
      label: 'throwing canDragPiece callback',
    },
  ])('fails a spare drag closed for the current $label', async (fixture) => {
    mockBoardWindowBounds();
    const onMoveRequest = moveRequestMock({ status: 'accepted' });
    const result = await render(
      renderTarget({
        ...(fixture.canDragPiece === undefined
          ? {}
          : { canDragPiece: fixture.canDragPiece }),
        ...(fixture.interactionPermissions === undefined
          ? {}
          : { interactionPermissions: fixture.interactionPermissions }),
        onMoveRequest,
        positionRevision: 17,
      }),
    );
    await measureBoard(boardByLabel(result, 'target board'));

    const callbacks = await beginSpareDrag('reserve');
    expect(
      result.queryAllByTestId(providerOverlayId('target-board'), {
        includeHiddenElements: true,
      }),
    ).toEqual([]);
    await releaseSpareDrag(callbacks, { x: 125, y: 225 });
    expect(onMoveRequest).not.toHaveBeenCalled();
    if (fixture.canDragPiece !== undefined) {
      expect(fixture.canDragPiece).toHaveBeenCalledWith({
        basePositionRevision: 17,
        boardId: 'target-board',
        piece: { id: 'reserve-knight', pieceType: 'wN' },
        source: { kind: 'spare', spareId: 'reserve' },
      });
    }
  });

  it('keeps accessible selection through board position/layout/provider geometry changes, then clears it for a source identity change', async () => {
    const onMoveRequest = moveRequestMock();
    const result = await render(
      renderTarget({
        geometryRevision: 1,
        onMoveRequest,
        positionRevision: 1,
        spareId: 'stable-reserve',
      }),
    );
    const initialSpare = result.getByRole('button');
    await fireEvent.press(initialSpare);
    expect(initialSpare).toHaveProp('accessibilityState', {
      disabled: false,
      selected: true,
    });

    await result.rerender(
      renderTarget({
        geometryRevision: 2,
        onMoveRequest,
        positionRevision: 2,
        size: 72,
        spareId: 'stable-reserve',
      }),
    );
    await measureBoard(boardByLabel(result, 'target board'));
    await measureBoard(boardByLabel(result, 'target board'));
    expect(result.getByRole('button')).toHaveProp('accessibilityState', {
      disabled: false,
      selected: true,
    });
    expect(actionNames(boardByLabel(result, 'target board'))).toContain(
      'place-spare',
    );

    await result.rerender(
      renderTarget({
        geometryRevision: 2,
        onMoveRequest,
        positionRevision: 2,
        size: 72,
        spareId: 'replacement-reserve',
      }),
    );
    expect(result.getByRole('button')).toHaveProp('accessibilityState', {
      disabled: false,
      selected: false,
    });
    expect(actionNames(boardByLabel(result, 'target board'))).not.toContain(
      'place-spare',
    );
  });

  it('keeps the overlay visible until asynchronous release measurement settles', async () => {
    const prototype = (View as unknown as { prototype: MeasureInWindowView })
      .prototype;
    let measurementCount = 0;
    const releaseMeasurement: {
      current: Parameters<MeasureInWindowView['measureInWindow']>[0] | null;
    } = { current: null };
    jest.spyOn(prototype, 'measureInWindow').mockImplementation((callback) => {
      measurementCount += 1;
      if (measurementCount === 1) {
        callback(
          BOARD_BOUNDS.x,
          BOARD_BOUNDS.y,
          BOARD_BOUNDS.width,
          BOARD_BOUNDS.height,
        );
        return;
      }
      releaseMeasurement.current = callback;
    });
    const onMoveRequest = moveRequestMock();
    const result = await render(renderTarget({ onMoveRequest }));
    await measureBoard(boardByLabel(result, 'target board'));

    const callbacks = await beginSpareDrag('reserve');
    await releaseSpareDrag(callbacks, { x: 125, y: 225 });
    expect(onMoveRequest).not.toHaveBeenCalled();
    expect(
      result.queryAllByTestId(providerOverlayId('target-board'), {
        includeHiddenElements: true,
      }),
    ).toHaveLength(1);

    const respond = releaseMeasurement.current;
    if (respond === null) {
      throw new Error('Expected a deferred release measurement.');
    }
    await act(() => {
      respond(
        BOARD_BOUNDS.x,
        BOARD_BOUNDS.y,
        BOARD_BOUNDS.width,
        BOARD_BOUNDS.height,
      );
    });
    await waitFor(() => {
      expect(onMoveRequest).toHaveBeenCalledTimes(1);
    });
    expect(
      result.queryAllByTestId(providerOverlayId('target-board'), {
        includeHiddenElements: true,
      }),
    ).toEqual([]);
  });

  it('rechecks current board permission at release and fails a started drag closed', async () => {
    mockBoardWindowBounds();
    const onMoveRequest = moveRequestMock({ status: 'accepted' });
    const result = await render(renderTarget({ onMoveRequest }));
    await measureBoard(boardByLabel(result, 'target board'));
    const callbacks = await beginSpareDrag('reserve');

    await result.rerender(
      renderTarget({
        interactionPermissions: { accessibility: true, drag: false },
        onMoveRequest,
      }),
    );
    await releaseSpareDrag(callbacks, { x: 125, y: 225 });

    expect(onMoveRequest).not.toHaveBeenCalled();
    expect(
      result.queryAllByTestId(providerOverlayId('target-board'), {
        includeHiddenElements: true,
      }),
    ).toEqual([]);
  });

  it('fails invalid window-space release coordinates closed instead of using local coordinates', async () => {
    mockBoardWindowBounds();
    const onMoveRequest = moveRequestMock({ status: 'accepted' });
    const result = await render(renderTarget({ onMoveRequest }));
    await measureBoard(boardByLabel(result, 'target board'));
    const callbacks = await beginSpareDrag('reserve');

    await releaseSpareDrag(
      callbacks,
      { x: 125, y: 225 },
      { x: Number.NaN, y: Number.NaN },
    );

    expect(onMoveRequest).not.toHaveBeenCalled();
    expect(
      result.queryAllByTestId(providerOverlayId('target-board'), {
        includeHiddenElements: true,
      }),
    ).toEqual([]);
  });

  it('clears a selected spare when its source unmounts', async () => {
    const onMoveRequest = moveRequestMock();
    const result = await render(
      renderTarget({ onMoveRequest, showSpare: true }),
    );
    await fireEvent.press(result.getByRole('button'));
    expect(actionNames(boardByLabel(result, 'target board'))).toContain(
      'place-spare',
    );

    await result.rerender(renderTarget({ onMoveRequest, showSpare: false }));
    expect(result.queryAllByRole('button')).toEqual([]);
    expect(actionNames(boardByLabel(result, 'target board'))).not.toContain(
      'place-spare',
    );
    expect(actionNames(boardByLabel(result, 'target board'))).not.toContain(
      'cancel-spare',
    );
  });

  it('clears a selected spare when its source becomes disabled', async () => {
    const onMoveRequest = moveRequestMock();
    const result = await render(renderTarget({ onMoveRequest }));
    await fireEvent.press(result.getByRole('button'));
    expect(actionNames(boardByLabel(result, 'target board'))).toContain(
      'place-spare',
    );

    await result.rerender(renderTarget({ disabled: true, onMoveRequest }));
    expect(result.getByRole('button')).toHaveProp('accessibilityState', {
      disabled: true,
      selected: false,
    });
    expect(actionNames(boardByLabel(result, 'target board'))).not.toContain(
      'place-spare',
    );
    expect(actionNames(boardByLabel(result, 'target board'))).not.toContain(
      'cancel-spare',
    );
  });

  it('clears a selected spare when its currently registered target unmounts', async () => {
    const onMoveRequest = moveRequestMock();
    const result = await render(
      renderTarget({ onMoveRequest, showBoard: true }),
    );
    await fireEvent.press(result.getByRole('button'));
    expect(result.getByRole('button')).toHaveProp('accessibilityState', {
      disabled: false,
      selected: true,
    });

    await result.rerender(renderTarget({ onMoveRequest, showBoard: false }));
    expect(result.queryAllByRole('adjustable')).toEqual([]);
    expect(result.getByRole('button')).toHaveProp('accessibilityState', {
      disabled: false,
      selected: false,
    });
  });

  it('keeps cancel available but suppresses placement when the target loses current accessibility permission', async () => {
    const onMoveRequest = moveRequestMock();
    const result = await render(
      renderTarget({ onMoveRequest, positionRevision: 5 }),
    );
    await fireEvent.press(result.getByRole('button'));

    await result.rerender(
      renderTarget({
        interactionPermissions: { accessibility: false, drag: false },
        onMoveRequest,
        positionRevision: 5,
      }),
    );
    const board = boardByLabel(result, 'target board');
    expect(actionNames(board)).not.toContain('place-spare');
    expect(actionNames(board)).toContain('cancel-spare');

    await accessibilityAction(board, 'place-spare');
    expect(onMoveRequest).not.toHaveBeenCalled();
    expect(result.getByRole('button')).toHaveProp('accessibilityState', {
      disabled: false,
      selected: true,
    });
    await accessibilityAction(
      boardByLabel(result, 'target board'),
      'cancel-spare',
    );
    expect(result.getByRole('button')).toHaveProp('accessibilityState', {
      disabled: false,
      selected: false,
    });
  });

  it('clears selection when the mounted source changes its target identity', async () => {
    const firstMove = moveRequestMock();
    const secondMove = moveRequestMock();

    function Harness(): ReactElement {
      const [target, setTarget] = useState<'first' | 'second'>('first');
      return (
        <ChessboardProvider>
          <SparePiece
            piece={SPARE_PIECE}
            spareId="retargeted-reserve"
            targetBoardId={target}
          />
          <View
            testID="retarget"
            onTouchEnd={() => {
              setTarget('second');
            }}
          />
          <Chessboard
            accessibility={{ boardLabel: 'first board' }}
            boardId="first"
            dimensions={{ columns: 2, rows: 2 }}
            onMoveRequest={firstMove}
            position={{ revision: 1, value: {} }}
            reduceMotion="never"
          />
          <Chessboard
            accessibility={{ boardLabel: 'second board' }}
            boardId="second"
            dimensions={{ columns: 2, rows: 2 }}
            onMoveRequest={secondMove}
            position={{ revision: 1, value: {} }}
            reduceMotion="never"
          />
        </ChessboardProvider>
      );
    }

    const result = await render(<Harness />);
    await fireEvent.press(result.getByRole('button'));
    expect(actionNames(boardByLabel(result, 'first board'))).toContain(
      'place-spare',
    );
    await fireEvent(result.getByTestId('retarget'), 'touchEnd');
    expect(result.getByRole('button')).toHaveProp('accessibilityState', {
      disabled: false,
      selected: false,
    });
    expect(actionNames(boardByLabel(result, 'first board'))).not.toContain(
      'place-spare',
    );
    expect(actionNames(boardByLabel(result, 'second board'))).not.toContain(
      'place-spare',
    );
  });
});
