import { act, fireEvent, render, waitFor } from '@testing-library/react-native';
import { useState, type ReactElement } from 'react';
import {
  AccessibilityInfo,
  AppState,
  View,
  type AppStateStatus,
} from 'react-native';
import { getByGestureTestId } from 'react-native-gesture-handler/jest-utils';
import type { TestInstance } from 'test-renderer';

import {
  Chessboard,
  ChessboardProvider,
  SparePiece,
  type BoardDimensions,
  type BoardOrientation,
  type CanDragPiece,
  type MoveDecision,
  type OnMoveRequest,
  type PieceRendererProps,
  type PieceRenderers,
} from '../src';
import { getSparePieceGestureTestId } from '../src/render/spare-piece-gesture-layer';

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

function sparePanCallbacks(spareId: string): Readonly<PanCallbacks> {
  const pan = getByGestureTestId(getSparePieceGestureTestId(spareId));
  return (pan as unknown as Readonly<{ handlers: Readonly<PanCallbacks> }>)
    .handlers;
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
  readonly canDragPiece?: CanDragPiece;
  readonly disabled?: boolean;
  readonly dimensions?: BoardDimensions;
  readonly geometryRevision?: number;
  readonly interactionPermissions?: Readonly<{
    accessibility?: boolean;
    drag?: boolean;
  }>;
  readonly onMoveRequest?: OnMoveRequest;
  readonly orientation?: BoardOrientation;
  readonly positionRevision?: number;
  readonly showBoard?: boolean;
  readonly showSpare?: boolean;
  readonly size?: number;
  readonly spareId?: string;
  readonly targetBoardId?: string;
}): ReactElement {
  const targetBoardId = options.targetBoardId ?? 'target-board';
  return (
    <ChessboardProvider geometryRevision={options.geometryRevision ?? 0}>
      {options.showSpare === false ? null : (
        <SparePiece
          disabled={options.disabled ?? false}
          piece={SPARE_PIECE}
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
          {...(options.interactionPermissions === undefined
            ? {}
            : { interactionPermissions: options.interactionPermissions })}
          {...(options.onMoveRequest === undefined
            ? {}
            : { onMoveRequest: options.onMoveRequest })}
          orientation={options.orientation ?? 'white'}
          position={{ revision: options.positionRevision ?? 1, value: {} }}
          reduceMotion="never"
        />
      )}
    </ChessboardProvider>
  );
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
