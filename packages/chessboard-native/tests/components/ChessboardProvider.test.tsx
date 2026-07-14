import { act, fireEvent, render, waitFor } from '@testing-library/react-native';
import { StrictMode, Suspense, useState, type ReactElement } from 'react';
import { View } from 'react-native';
import { getByGestureTestId } from 'react-native-gesture-handler/jest-utils';
import type { TestInstance } from 'test-renderer';

import {
  ChessboardError,
  ChessboardProvider,
  type ChessboardErrorContext,
  type OnChessboardError,
  type PieceRendererProps,
  type PieceRenderers,
} from '../../src';
import { ChessboardRuntime } from '../../src/Chessboard';
import {
  useChessboardProvider,
  type ChessboardProviderRuntime,
} from '../../src/internal/provider-context';
import { getBoardGestureTestIds } from '../../src/render/board-gesture-layer';

type ProviderRenderResult = Awaited<ReturnType<typeof render>>;

const EMPTY_POSITION = Object.freeze({
  revision: 1,
  value: Object.freeze({}),
});
const NEVER = new Promise<never>(() => undefined);

interface PanCallbacks {
  readonly onBegin?: (event: Readonly<Record<string, number>>) => void;
  readonly onFinalize?: (
    event: Readonly<Record<string, number>>,
    success: boolean,
  ) => void;
  readonly onStart?: (event: Readonly<Record<string, number>>) => void;
}

function boardControls(result: ProviderRenderResult): TestInstance[] {
  return result.queryAllByRole('adjustable', { includeHiddenElements: true });
}

function boardByLabel(
  result: ProviderRenderResult,
  label: string,
): TestInstance {
  const board = boardControls(result).find(
    (candidate) => candidate.props['accessibilityLabel'] === label,
  );
  if (board === undefined) {
    throw new Error(`Expected adjustable board labelled "${label}".`);
  }
  return board;
}

function RuntimeProbe({
  capture,
}: {
  readonly capture: (runtime: ChessboardProviderRuntime) => void;
}): null {
  capture(useChessboardProvider().runtime);
  return null;
}

interface RuntimeCapture {
  current: ChessboardProviderRuntime | null;
}

function capturedRuntime(capture: RuntimeCapture): ChessboardProviderRuntime {
  if (capture.current === null) {
    throw new Error('Expected the provider runtime probe to commit.');
  }
  return capture.current;
}

function NeverCommits(): ReactElement {
  // eslint-disable-next-line @typescript-eslint/only-throw-error -- Suspense renders are abandoned by throwing their pending thenable.
  throw NEVER;
}

function onErrorMock(): jest.MockedFunction<OnChessboardError> {
  return jest.fn<undefined, [ChessboardError, ChessboardErrorContext]>();
}

async function measure(board: TestInstance, width = 200, height = 200) {
  await fireEvent(board, 'layout', {
    nativeEvent: { layout: { height, width, x: 0, y: 0 } },
  });
}

function panCallbacks(boardId: string): Readonly<PanCallbacks> {
  const pan = getByGestureTestId(getBoardGestureTestIds(boardId).pan);
  return (pan as unknown as Readonly<{ handlers: Readonly<PanCallbacks> }>)
    .handlers;
}

async function beginDrag(boardId: string): Promise<Readonly<PanCallbacks>> {
  const callbacks = panCallbacks(boardId);
  await act(() => {
    callbacks.onBegin?.({ absoluteX: 25, absoluteY: 25, x: 25, y: 25 });
    callbacks.onStart?.({ absoluteX: 35, absoluteY: 25, x: 35, y: 25 });
  });
  return callbacks;
}

function providerPiece(props: PieceRendererProps): ReactElement {
  return (
    <View
      testID={`provider-piece:${props.boardId}:${props.square}:${props.state.isDragging ? 'dragging' : 'resting'}`}
    />
  );
}

const PIECE_RENDERERS = Object.freeze({
  token: providerPiece,
}) satisfies PieceRenderers;

describe('ChessboardProvider', () => {
  it('[PARITY-EXPORT-CHESSBOARD-PROVIDER] exports a layout-neutral provider with no native or accessibility node', async () => {
    const result = await render(
      <ChessboardProvider>
        <View testID="first-child" />
        <View testID="second-child" />
      </ChessboardProvider>,
    );

    expect(typeof ChessboardProvider).toBe('function');
    expect(result.container.children).toHaveLength(2);
    expect(
      result.queryAllByTestId('first-child', { includeHiddenElements: true }),
    ).toHaveLength(1);
    expect(
      result.queryAllByTestId('second-child', { includeHiddenElements: true }),
    ).toHaveLength(1);
    expect(boardControls(result)).toEqual([]);
    expect(
      result.container.queryAll(
        (node) =>
          node.props['accessible'] === true ||
          node.props['accessibilityRole'] !== undefined,
      ),
    ).toEqual([]);
  });

  it('[PARITY-BEHAVIOR-B01] gives standalone boards private providers and scopes duplicate IDs to the nearest nested provider', async () => {
    const onError = onErrorMock();
    const result = await render(
      <>
        <ChessboardRuntime
          accessibility={{ boardLabel: 'standalone one' }}
          boardId="shared"
          development={false}
          onError={onError}
          position={EMPTY_POSITION}
        />
        <ChessboardRuntime
          accessibility={{ boardLabel: 'standalone two' }}
          boardId="shared"
          development={false}
          onError={onError}
          position={EMPTY_POSITION}
        />
        <ChessboardProvider>
          <ChessboardRuntime
            accessibility={{ boardLabel: 'outer provider' }}
            boardId="nested-shared"
            development={false}
            onError={onError}
            position={EMPTY_POSITION}
          />
          <ChessboardProvider>
            <ChessboardRuntime
              accessibility={{ boardLabel: 'inner provider' }}
              boardId="nested-shared"
              development={false}
              onError={onError}
              position={EMPTY_POSITION}
            />
          </ChessboardProvider>
        </ChessboardProvider>
      </>,
    );

    expect(boardControls(result)).toHaveLength(4);
    for (const board of boardControls(result)) {
      expect(board.props['accessibilityState']).toEqual({ disabled: false });
    }
    expect(onError).not.toHaveBeenCalled();
  });

  it('[PARITY-OPTION-ID] reports a typed duplicate and leaves the conflicting board disabled and unregistered', async () => {
    const onError = onErrorMock();
    const runtime: RuntimeCapture = { current: null };
    const result = await render(
      <ChessboardProvider>
        <RuntimeProbe capture={(value) => (runtime.current = value)} />
        <ChessboardRuntime
          accessibility={{ boardLabel: 'registered board' }}
          boardId="duplicate"
          development={false}
          position={EMPTY_POSITION}
        />
        <ChessboardRuntime
          accessibility={{ boardLabel: 'conflicting board' }}
          boardId="duplicate"
          development={false}
          onError={onError}
          position={EMPTY_POSITION}
        />
      </ChessboardProvider>,
    );

    await waitFor(() => {
      expect(onError).toHaveBeenCalledTimes(1);
    });
    const firstCall = onError.mock.calls[0];
    expect(firstCall?.[0]).toEqual(
      expect.objectContaining({
        boardId: 'duplicate',
        code: 'DUPLICATE_BOARD_ID',
        domain: 'board',
        name: 'ChessboardError',
      }),
    );
    expect(firstCall?.[1]).toEqual({
      boardId: 'duplicate',
      domain: 'board',
      revision: null,
    });
    expect(
      boardByLabel(result, 'registered board').props['accessibilityState'],
    ).toEqual({ disabled: false });
    expect(
      boardByLabel(result, 'conflicting board').props['accessibilityState'],
    ).toEqual({ disabled: true });
    expect(
      capturedRuntime(runtime).registry.getBoardSnapshot('duplicate'),
    ).not.toBeNull();
  });

  it('throws the typed duplicate during development instead of committing a conflicting board', async () => {
    await expect(
      render(
        <ChessboardProvider>
          <ChessboardRuntime
            boardId="development-duplicate"
            development
            position={EMPTY_POSITION}
          />
          <ChessboardRuntime
            boardId="development-duplicate"
            development
            position={EMPTY_POSITION}
          />
        </ChessboardProvider>,
      ),
    ).rejects.toEqual(
      expect.objectContaining({
        boardId: 'development-duplicate',
        code: 'DUPLICATE_BOARD_ID',
        name: 'ChessboardError',
      }),
    );
  });

  it('rejects invalid and decreasing controlled provider geometry revisions', async () => {
    await expect(
      render(
        <ChessboardProvider geometryRevision={-1}>
          <View />
        </ChessboardProvider>,
      ),
    ).rejects.toThrow(
      'ChessboardProvider geometryRevision must be a non-negative safe integer.',
    );

    const result = await render(
      <ChessboardProvider geometryRevision={2}>
        <View />
      </ChessboardProvider>,
    );
    await expect(
      result.rerender(
        <ChessboardProvider geometryRevision={1}>
          <View />
        </ChessboardProvider>,
      ),
    ).rejects.toThrow(
      'ChessboardProvider geometryRevision must not decrease while mounted.',
    );
  });

  it('[PARITY-BEHAVIOR-B02] keeps provider context private and limited to transient registry, drag, and geometry coordination', async () => {
    const runtime: RuntimeCapture = { current: null };
    const result = await render(
      <ChessboardProvider geometryRevision={4}>
        <RuntimeProbe capture={(value) => (runtime.current = value)} />
        <View testID="provider-child" />
      </ChessboardProvider>,
    );

    expect(result.container.children).toHaveLength(1);
    const committedRuntime = capturedRuntime(runtime);
    expect(Object.keys(committedRuntime).sort()).toEqual([
      'commitGeometryRevision',
      'drag',
      'getGeometryRevision',
      'registry',
      'release',
      'retain',
    ]);
    expect(committedRuntime.getGeometryRevision()).toBe(4);
    expect(committedRuntime.drag.getSnapshot().active).toBeNull();
    expect(committedRuntime).not.toHaveProperty('position');
    expect(committedRuntime).not.toHaveProperty('selection');
    expect(committedRuntime).not.toHaveProperty('annotations');
  });

  it('[PARITY-BEHAVIOR-B04] keeps board identity out of native IDs and fails a mounted ID mutation closed', async () => {
    const onError = onErrorMock();
    const runtime: RuntimeCapture = { current: null };
    const renderTree = (boardId: string) => (
      <ChessboardProvider>
        <RuntimeProbe capture={(value) => (runtime.current = value)} />
        <ChessboardRuntime
          accessibility={{ boardLabel: 'stable identity' }}
          boardId={boardId}
          development={false}
          onError={onError}
          position={EMPTY_POSITION}
        />
      </ChessboardProvider>
    );
    const result = await render(renderTree('stable-id'));
    const original = boardByLabel(result, 'stable identity');

    expect(original.props['id']).toBeUndefined();
    expect(original.props['nativeID']).toBeUndefined();
    expect(
      capturedRuntime(runtime).registry.getBoardSnapshot('stable-id'),
    ).not.toBeNull();

    await result.rerender(renderTree('mutated-id'));
    await waitFor(() => {
      expect(onError).toHaveBeenCalledWith(
        expect.objectContaining({ code: 'BOARD_ID_CHANGED' }),
        expect.objectContaining({ domain: 'board', revision: null }),
      );
    });

    expect(
      boardByLabel(result, 'stable identity').props['accessibilityState'],
    ).toEqual({ disabled: true });
    expect(
      capturedRuntime(runtime).registry.getBoardSnapshot('stable-id'),
    ).toBeNull();
    expect(
      capturedRuntime(runtime).registry.getBoardSnapshot('mutated-id'),
    ).toBeNull();
  });

  it('publishes measured orientation and dimensions to the provider collision registry', async () => {
    const runtime: RuntimeCapture = { current: null };
    const result = await render(
      <ChessboardProvider>
        <RuntimeProbe capture={(value) => (runtime.current = value)} />
        <ChessboardRuntime
          accessibility={{ boardLabel: 'measured board' }}
          boardId="measured"
          development={false}
          dimensions={{ columns: 4, rows: 2 }}
          orientation="black"
          position={{}}
        />
      </ChessboardProvider>,
    );

    await measure(boardByLabel(result, 'measured board'), 400, 200);
    await waitFor(() => {
      expect(
        capturedRuntime(runtime).registry.getBoardSnapshot('measured')
          ?.geometry,
      ).toEqual({
        dimensions: { columns: 4, rows: 2 },
        geometryEpoch: 0,
        layoutRevision: 1,
        orientation: 'black',
      });
    });
  });

  it('reserves board identity but keeps the drop target unavailable without a current positive layout', async () => {
    const runtime: RuntimeCapture = { current: null };
    const result = await render(
      <ChessboardProvider>
        <RuntimeProbe capture={(value) => (runtime.current = value)} />
        <ChessboardRuntime
          accessibility={{ boardLabel: 'availability board' }}
          boardId="availability"
          development={false}
          position={EMPTY_POSITION}
        />
      </ChessboardProvider>,
    );
    const registry = capturedRuntime(runtime).registry;

    expect(registry.getBoardSnapshot('availability')).toEqual(
      expect.objectContaining({ available: false }),
    );
    const beforeLayout = registry.beginDropSession({
      dropEpoch: 1,
      targetBoardId: 'availability',
    });
    await expect(
      registry.verifyDrop(beforeLayout, { x: 10, y: 10 }),
    ).resolves.toEqual({
      boardId: 'availability',
      reason: 'board-missing',
      status: 'cancelled',
    });

    const board = boardByLabel(result, 'availability board');
    await measure(board);
    await waitFor(() => {
      expect(registry.getBoardSnapshot('availability')?.available).toBe(true);
    });

    await measure(board, 0, 200);
    await waitFor(() => {
      expect(registry.getBoardSnapshot('availability')?.available).toBe(false);
    });
    const invalidLayout = registry.beginDropSession({
      dropEpoch: 2,
      targetBoardId: 'availability',
    });
    await expect(
      registry.verifyDrop(invalidLayout, { x: 10, y: 10 }),
    ).resolves.toEqual({
      boardId: 'availability',
      reason: 'board-missing',
      status: 'cancelled',
    });
  });

  it('keeps rectangular black geometry live through StrictMode effect replay', async () => {
    const onError = onErrorMock();
    const runtime: RuntimeCapture = { current: null };
    const result = await render(
      <StrictMode>
        <ChessboardProvider>
          <RuntimeProbe capture={(value) => (runtime.current = value)} />
          <ChessboardRuntime
            accessibility={{ boardLabel: 'strict board' }}
            boardId="strict"
            development={false}
            dimensions={{ columns: 4, rows: 2 }}
            onError={onError}
            orientation="black"
            position={EMPTY_POSITION}
          />
        </ChessboardProvider>
      </StrictMode>,
    );
    await act(async () => {
      await Promise.resolve();
    });
    await measure(boardByLabel(result, 'strict board'), 400, 200);

    expect(onError).not.toHaveBeenCalled();
    await waitFor(() => {
      expect(
        capturedRuntime(runtime).registry.getBoardSnapshot('strict'),
      ).toEqual(
        expect.objectContaining({
          available: true,
          geometry: {
            dimensions: { columns: 4, rows: 2 },
            geometryEpoch: 0,
            layoutRevision: 1,
            orientation: 'black',
          },
        }),
      );
    });
    expect(
      boardByLabel(result, 'strict board').props['accessibilityState'],
    ).toEqual({ disabled: false });
  });

  it('does not reserve an ID from an abandoned Suspense render', async () => {
    const onError = onErrorMock();
    const runtime: RuntimeCapture = { current: null };
    const result = await render(
      <ChessboardProvider>
        <RuntimeProbe capture={(value) => (runtime.current = value)} />
        <Suspense fallback={<View testID="suspended-fallback" />}>
          <ChessboardRuntime
            accessibility={{ boardLabel: 'abandoned board' }}
            boardId="suspense-id"
            development={false}
            onError={onError}
            position={EMPTY_POSITION}
          />
          <NeverCommits />
        </Suspense>
        <ChessboardRuntime
          accessibility={{ boardLabel: 'committed board' }}
          boardId="suspense-id"
          development={false}
          onError={onError}
          position={EMPTY_POSITION}
        />
      </ChessboardProvider>,
    );

    expect(
      result.queryAllByTestId('suspended-fallback', {
        includeHiddenElements: true,
      }),
    ).toHaveLength(1);
    expect(boardControls(result)).toHaveLength(1);
    expect(
      boardByLabel(result, 'committed board').props['accessibilityState'],
    ).toEqual({ disabled: false });
    expect(
      capturedRuntime(runtime).registry.getBoardSnapshot('suspense-id'),
    ).not.toBeNull();
    expect(onError).not.toHaveBeenCalled();
  });

  it('reactivates a committed rectangular board after Suspense hides and reveals its provider', async () => {
    type Mode = 'visible' | 'suspended';

    const onError = onErrorMock();
    const runtime: RuntimeCapture = { current: null };
    let setMode: ((mode: Mode) => void) | undefined;

    function Harness(): ReactElement {
      const [mode, updateMode] = useState<Mode>('visible');
      setMode = updateMode;
      return (
        <Suspense fallback={<View testID="provider-hidden-fallback" />}>
          {mode === 'suspended' ? <NeverCommits /> : null}
          <ChessboardProvider>
            <RuntimeProbe capture={(value) => (runtime.current = value)} />
            <ChessboardRuntime
              accessibility={{ boardLabel: 'revealed board' }}
              boardId="revealed"
              development={false}
              dimensions={{ columns: 4, rows: 2 }}
              onError={onError}
              orientation="black"
              position={EMPTY_POSITION}
            />
          </ChessboardProvider>
        </Suspense>
      );
    }

    const result = await render(<Harness />);
    await measure(boardByLabel(result, 'revealed board'), 400, 200);
    const committedRuntime = capturedRuntime(runtime);
    await waitFor(() => {
      expect(committedRuntime.registry.getBoardSnapshot('revealed')).toEqual(
        expect.objectContaining({
          available: true,
          geometry: {
            dimensions: { columns: 4, rows: 2 },
            geometryEpoch: 0,
            layoutRevision: 1,
            orientation: 'black',
          },
        }),
      );
    });

    const updateMode = setMode;
    if (updateMode === undefined) {
      throw new Error('Expected the Suspense harness state setter.');
    }
    await act(() => {
      updateMode('suspended');
    });
    await act(async () => {
      await Promise.resolve();
    });
    expect(
      result.queryAllByTestId('provider-hidden-fallback', {
        includeHiddenElements: true,
      }),
    ).toHaveLength(1);
    expect(committedRuntime.registry.getBoardSnapshot('revealed')).toBeNull();

    await act(() => {
      updateMode('visible');
    });
    await waitFor(() => {
      expect(capturedRuntime(runtime)).toBe(committedRuntime);
      expect(committedRuntime.registry.getBoardSnapshot('revealed')).toEqual(
        expect.objectContaining({
          available: true,
          geometry: {
            dimensions: { columns: 4, rows: 2 },
            geometryEpoch: 0,
            layoutRevision: 1,
            orientation: 'black',
          },
        }),
      );
    });
    expect(onError).not.toHaveBeenCalled();
  });

  it('[CBN-CONTRACT-014-MULTIBOARD-ISOLATION] keeps exactly one pointerless hidden overlay while a second board replaces the active drag', async () => {
    const result = await render(
      <ChessboardProvider>
        <ChessboardRuntime
          accessibility={{ boardLabel: 'left board' }}
          boardId="left"
          development={false}
          dimensions={{ columns: 2, rows: 2 }}
          onMoveRequest={() => ({ status: 'rejected' })}
          pieceRenderers={PIECE_RENDERERS}
          position={{
            revision: 1,
            value: { a2: { id: 'left-token', pieceType: 'token' } },
          }}
        />
        <ChessboardRuntime
          accessibility={{ boardLabel: 'right board' }}
          boardId="right"
          development={false}
          dimensions={{ columns: 2, rows: 2 }}
          onMoveRequest={() => ({ status: 'rejected' })}
          pieceRenderers={PIECE_RENDERERS}
          position={{
            revision: 1,
            value: { a2: { id: 'right-token', pieceType: 'token' } },
          }}
        />
      </ChessboardProvider>,
    );
    await measure(boardByLabel(result, 'left board'));
    await measure(boardByLabel(result, 'right board'));

    await beginDrag('left');
    expect(
      result.queryAllByTestId('chessboard-native:left:provider-drag-overlay', {
        includeHiddenElements: true,
      }),
    ).toHaveLength(1);

    const rightCallbacks = await beginDrag('right');
    expect(
      result.queryAllByTestId(/:provider-drag-overlay$/, {
        includeHiddenElements: true,
      }),
    ).toHaveLength(1);
    expect(
      result.queryAllByTestId('chessboard-native:left:provider-drag-overlay', {
        includeHiddenElements: true,
      }),
    ).toEqual([]);
    const rightOverlay = result.getByTestId(
      'chessboard-native:right:provider-drag-overlay',
      { includeHiddenElements: true },
    );
    expect(rightOverlay).toHaveProp('accessibilityElementsHidden', true);
    expect(rightOverlay).toHaveProp('accessible', false);
    expect(rightOverlay).toHaveProp(
      'importantForAccessibility',
      'no-hide-descendants',
    );
    expect(rightOverlay).toHaveProp('pointerEvents', 'none');
    expect(boardControls(result)).toHaveLength(2);

    await act(() => {
      rightCallbacks.onFinalize?.(
        { absoluteX: 35, absoluteY: 25, x: 35, y: 25 },
        false,
      );
    });
    expect(
      result.queryAllByTestId(/:provider-drag-overlay$/, {
        includeHiddenElements: true,
      }),
    ).toEqual([]);
  });

  it('cancels the active provider lease when the owning board receives even a same-size layout', async () => {
    const result = await render(
      <ChessboardProvider>
        <ChessboardRuntime
          accessibility={{ boardLabel: 'layout board' }}
          boardId="layout-cancel"
          development={false}
          dimensions={{ columns: 2, rows: 2 }}
          onMoveRequest={() => ({ status: 'rejected' })}
          pieceRenderers={PIECE_RENDERERS}
          position={{
            revision: 1,
            value: { a2: { id: 'layout-token', pieceType: 'token' } },
          }}
        />
      </ChessboardProvider>,
    );
    const board = boardByLabel(result, 'layout board');
    await measure(board);
    await beginDrag('layout-cancel');
    expect(
      result.queryAllByTestId(
        'chessboard-native:layout-cancel:provider-drag-overlay',
        { includeHiddenElements: true },
      ),
    ).toHaveLength(1);

    await measure(board, 200, 200);

    expect(
      result.queryAllByTestId(
        'chessboard-native:layout-cancel:provider-drag-overlay',
        { includeHiddenElements: true },
      ),
    ).toEqual([]);
  });

  it('[CBN-CONTRACT-015-PROVIDER-NONSEMANTIC] changes geometry coordination without editing position or adding board controls', async () => {
    const value = Object.freeze({
      a2: Object.freeze({ id: 'controlled-token', pieceType: 'token' }),
    });
    const position = Object.freeze({ revision: 12, value });
    const runtime: RuntimeCapture = { current: null };
    const tree = (geometryRevision: number) => (
      <ChessboardProvider geometryRevision={geometryRevision}>
        <RuntimeProbe capture={(next) => (runtime.current = next)} />
        <ChessboardRuntime
          accessibility={{ boardLabel: 'semantic board' }}
          boardId="semantic"
          development={false}
          dimensions={{ columns: 2, rows: 2 }}
          pieceRenderers={PIECE_RENDERERS}
          position={position}
        />
      </ChessboardProvider>
    );
    const result = await render(tree(2));
    const beforeValue: unknown = boardByLabel(result, 'semantic board').props[
      'accessibilityValue'
    ] as unknown;

    await result.rerender(tree(3));

    expect(position.value).toBe(value);
    expect(value).toEqual({
      a2: { id: 'controlled-token', pieceType: 'token' },
    });
    expect(boardControls(result)).toHaveLength(1);
    expect(
      boardByLabel(result, 'semantic board').props['accessibilityValue'],
    ).toEqual(beforeValue);
    expect(capturedRuntime(runtime).getGeometryRevision()).toBe(3);
    expect(
      capturedRuntime(runtime).registry.getBoardSnapshot('semantic'),
    ).not.toHaveProperty('position');
  });
});
