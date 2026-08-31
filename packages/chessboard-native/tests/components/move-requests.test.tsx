import { act, fireEvent, render } from '@testing-library/react-native';
import {
  startTransition,
  StrictMode,
  Suspense,
  useLayoutEffect,
  useState,
  useSyncExternalStore,
  type ReactElement,
} from 'react';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import { State } from 'react-native-gesture-handler';
import {
  fireGestureHandler,
  getByGestureTestId,
} from 'react-native-gesture-handler/jest-utils';
import * as Worklets from 'react-native-worklets';
import type { TestInstance } from 'test-renderer';

import { ChessboardProvider } from '../../src';
import { ChessboardRuntime } from '../../src/Chessboard';
import {
  useChessboardProvider,
  type ChessboardProviderRuntime,
} from '../../src/internal/provider-context';
import {
  INTERACTION_PRESENTATION_PHASE,
  useInteractionPresentationSharedValues,
  type InteractionPresentationSharedValues,
} from '../../src/internal/interaction-presentation';
import type { PendingCommitMapperLease } from '../../src/internal/pending-commit-handoff';
import type {
  CanDragPiece,
  MoveDecision,
  MoveIntent,
  MoveOutcomeAccessibilityContext,
  OnMoveRequest,
  PieceRendererProps,
  PieceRenderers,
  PositionObject,
} from '../../src';
import { getBoardGestureTestIds } from '../../src/render/board-gesture-layer';

jest.mock('react-native-reanimated', () => {
  const actual = jest.requireActual<typeof import('react-native-reanimated')>(
    'react-native-reanimated',
  );
  const ReactModule = jest.requireActual<typeof import('react')>('react');

  function useAnimatedReaction<PreparedResult>(
    prepare: () => PreparedResult,
    react: (prepared: PreparedResult, previous: PreparedResult | null) => void,
    dependencies?: readonly unknown[],
  ): void {
    const previous = ReactModule.useRef<PreparedResult | null>(null);
    ReactModule.useEffect(() => {
      const prepared = prepare();
      react(prepared, previous.current);
      previous.current = prepared;
    }, dependencies);
  }

  return {
    ...actual,
    __esModule: true,
    default: actual.default,
    useAnimatedReaction,
  };
});

const BOARD_SIZE = 200;
const START = Object.freeze({ x: 25, y: 25 });
const BOTTOM_RIGHT = Object.freeze({ x: 135, y: 135 });
const OFF_BOARD = Object.freeze({ x: 225, y: 50 });

function rootOf(result: Awaited<ReturnType<typeof render>>): TestInstance {
  if (result.root === null) {
    throw new Error('Expected ChessboardRuntime to render one native root.');
  }
  return result.root;
}

async function measure(root: TestInstance): Promise<void> {
  await fireEvent(root, 'layout', {
    nativeEvent: {
      layout: { height: BOARD_SIZE, width: BOARD_SIZE, x: 0, y: 0 },
    },
  });
}

async function accessibilityAction(
  root: TestInstance,
  actionName: string,
): Promise<void> {
  await fireEvent(root, 'accessibilityAction', {
    nativeEvent: { actionName },
  });
}

async function flushAnimationFrame(): Promise<void> {
  await act(
    () =>
      new Promise<void>((resolve) => {
        requestAnimationFrame(() => {
          resolve();
        });
      }),
  );
}

async function flushRetirementFrames(): Promise<void> {
  await flushAnimationFrame();
  await flushAnimationFrame();
}

async function drag(
  boardId: string,
  target: Readonly<{ x: number; y: number }>,
): Promise<void> {
  await dragFrom(boardId, START, target);
}

async function dragFrom(
  boardId: string,
  source: Readonly<{ x: number; y: number }>,
  target: Readonly<{ x: number; y: number }>,
): Promise<void> {
  const pan = getByGestureTestId(getBoardGestureTestIds(boardId).pan);
  await act(() => {
    fireGestureHandler(pan, [
      { state: State.BEGAN, ...source },
      { state: State.ACTIVE, x: source.x + 10, y: source.y },
      { state: State.ACTIVE, ...target },
      { state: State.END, ...target },
    ]);
  });
  await flushRetirementFrames();
}

async function flushDecisions(): Promise<void> {
  await act(async () => {
    await Promise.resolve();
  });
}

async function flushCapturedAnimationFrames(
  frames: ((timestamp: number) => void)[],
  maximumTurns = 16,
): Promise<void> {
  for (let frameTurn = 0; frameTurn < maximumTurns; frameTurn += 1) {
    const queuedFrames = frames.splice(0);
    await act(async () => {
      for (const frame of queuedFrames) {
        frame(16 + frameTurn * 16);
      }
      // Worklets' Jest scheduleOnRN implementation queues a microtask, and
      // that RN update can commit the next mapper-ready frame.
      jest.runAllTicks();
      await Promise.resolve();
    });
  }
}

function pendingCommitMapperLease(
  value: unknown,
): Readonly<PendingCommitMapperLease> | null {
  if (typeof value !== 'object' || value === null) {
    return null;
  }
  const candidate = value as Readonly<Record<string, unknown>>;
  return typeof candidate['actorKey'] === 'string' &&
    typeof candidate['canonicalHostGeneration'] === 'number' &&
    typeof candidate['pendingHostGeneration'] === 'number' &&
    typeof candidate['presentationEpoch'] === 'number' &&
    typeof candidate['serial'] === 'number'
    ? (value as Readonly<PendingCommitMapperLease>)
    : null;
}

function pendingCommitMapperScheduleCalls(
  calls: readonly (readonly unknown[])[],
): readonly Readonly<PendingCommitMapperLease>[] {
  return calls
    .map((call) => pendingCommitMapperLease(call[1]))
    .filter(
      (lease): lease is Readonly<PendingCommitMapperLease> => lease !== null,
    );
}

function gesturePlanes(root: TestInstance): TestInstance[] {
  return root.queryAll(
    (node) =>
      node.props['accessibilityElementsHidden'] === true &&
      node.props['accessible'] === false &&
      node.props['collapsable'] === false &&
      node.props['importantForAccessibility'] === 'no-hide-descendants' &&
      node.props['pointerEvents'] === 'auto',
  );
}

function visualKind(props: PieceRendererProps): string {
  if (props.state.isDragging) {
    return 'drag';
  }
  if (props.state.isPending && props.state.isGhost) {
    return 'pending-source';
  }
  if (props.state.isGhost) {
    return 'source-ghost';
  }
  if (props.state.isPending) {
    return 'pending-target';
  }
  return 'static';
}

interface PanCallbacks {
  readonly onBegin?: (event: Readonly<Record<string, unknown>>) => void;
  readonly onEnd?: (
    event: Readonly<Record<string, unknown>>,
    success: boolean,
  ) => void;
  readonly onFinalize?: (
    event: Readonly<Record<string, unknown>>,
    success: boolean,
  ) => void;
  readonly onStart?: (event: Readonly<Record<string, unknown>>) => void;
}

function panCallbacks(pan: unknown): Readonly<PanCallbacks> {
  return (pan as Readonly<{ handlers: Readonly<PanCallbacks> }>).handlers;
}

function pieceProbe(props: PieceRendererProps): ReactElement {
  return (
    <View
      testID={`move-piece:${visualKind(props)}:${props.square ?? 'spare'}:${props.piece.pieceType}`}
    />
  );
}

const PIECE_RENDERERS = Object.freeze({
  token: pieceProbe,
}) satisfies PieceRenderers;

function nodesByTestId(root: TestInstance, testID: string): TestInstance[] {
  return root.queryAll((node) => node.props['testID'] === testID);
}

function canonicalDrainVisual(
  root: TestInstance,
  boardId: string,
  square: string,
): TestInstance {
  const matches = nodesByTestId(
    root,
    `chessboard-native:${boardId}:canonical-drain:${square}`,
  );
  expect(matches).toHaveLength(1);
  const match = matches[0];
  if (match === undefined) {
    throw new Error('Expected one canonical drain visual.');
  }
  return match;
}

function expectNoCanonicalDrain(
  root: TestInstance,
  boardId: string,
  square: string,
): void {
  expect(
    nodesByTestId(
      root,
      `chessboard-native:${boardId}:canonical-drain:${square}`,
    ),
  ).toEqual([]);
}

function hiddenNodesByTestId(
  result: Awaited<ReturnType<typeof render>>,
  testID: string,
): TestInstance[] {
  return result.queryAllByTestId(testID, { includeHiddenElements: true });
}

function animatedStyle(node: TestInstance): Readonly<Record<string, unknown>> {
  const animated: unknown = node.props['jestAnimatedStyle'];
  if (typeof animated !== 'object' || animated === null) {
    throw new Error('Expected a Reanimated Jest style.');
  }
  const value = (animated as Readonly<Record<string, unknown>>)['value'];
  if (typeof value !== 'object' || value === null) {
    throw new Error('Expected a Reanimated Jest style value.');
  }
  return value as Readonly<Record<string, unknown>>;
}

function nativeStyle(node: TestInstance): Readonly<ViewStyle> {
  return StyleSheet.flatten<ViewStyle>(
    node.props['style'] as StyleProp<ViewStyle>,
  );
}

function boardPieceHost(artwork: TestInstance): TestInstance {
  const host = artwork.parent?.parent ?? null;
  if (host === null) {
    throw new Error('Expected a board-piece host and occlusion boundary.');
  }
  return host;
}

function boardPieceOcclusionBoundary(artwork: TestInstance): TestInstance {
  const boundary = artwork.parent;
  if (boundary === null) {
    throw new Error('Expected a board-piece occlusion boundary.');
  }
  return boundary;
}

function expectOneVisual(
  root: TestInstance,
  kind: string,
  square: string,
): void {
  expect(
    nodesByTestId(root, `move-piece:${kind}:${square}:token`),
  ).toHaveLength(1);
}

function expectNoVisual(
  root: TestInstance,
  kind: string,
  square: string,
): void {
  expect(nodesByTestId(root, `move-piece:${kind}:${square}:token`)).toEqual([]);
}

describe('public controlled move requests', () => {
  afterEach(() => {
    jest.useRealTimers();
  });

  it('[PARITY-OPTION-ALLOW-DRAGGING] mounts no gesture plane without a callback and honors the declarative drag gate', async () => {
    const boardId = 'allow-dragging';
    const position = Object.freeze({
      revision: 7,
      value: Object.freeze({
        a2: Object.freeze({ id: 'piece', pieceType: 'token' }),
      }),
    });
    const onMoveRequest: OnMoveRequest = jest.fn(() => ({
      status: 'rejected',
    }));
    const result = await render(
      <ChessboardRuntime
        boardId={boardId}
        development={false}
        dimensions={{ columns: 2, rows: 2 }}
        pieceRenderers={PIECE_RENDERERS}
        position={position}
      />,
    );
    await measure(rootOf(result));

    expect(gesturePlanes(rootOf(result))).toEqual([]);
    expect(() =>
      getByGestureTestId(getBoardGestureTestIds(boardId).pan),
    ).toThrow();

    await result.rerender(
      <ChessboardRuntime
        boardId={boardId}
        development={false}
        dimensions={{ columns: 2, rows: 2 }}
        interactionPermissions={{ drag: false }}
        onMoveRequest={onMoveRequest}
        pieceRenderers={PIECE_RENDERERS}
        position={position}
      />,
    );
    expect(gesturePlanes(rootOf(result))).toEqual([]);
    expect(() =>
      getByGestureTestId(getBoardGestureTestIds(boardId).pan),
    ).toThrow();

    await result.rerender(
      <ChessboardRuntime
        boardId={boardId}
        development={false}
        dimensions={{ columns: 2, rows: 2 }}
        interactionPermissions={{ accessibility: true, drag: true }}
        onMoveRequest={onMoveRequest}
        pieceRenderers={PIECE_RENDERERS}
        position={position}
      />,
    );
    expect(gesturePlanes(rootOf(result))).toHaveLength(1);
    expect(
      getByGestureTestId(getBoardGestureTestIds(boardId).pan),
    ).toBeDefined();
  });

  it('[PARITY-OPTION-CAN-DRAG-PIECE] evaluates the current source context and fails closed for false or throwing permission callbacks', async () => {
    for (const fixture of [
      {
        boardId: 'piece-gate-false',
        canDragPiece: jest.fn<
          ReturnType<CanDragPiece>,
          Parameters<CanDragPiece>
        >(() => false),
      },
      {
        boardId: 'piece-gate-throws',
        canDragPiece: jest.fn<
          ReturnType<CanDragPiece>,
          Parameters<CanDragPiece>
        >(() => {
          throw new Error('hostile drag gate');
        }),
      },
    ] as const) {
      const onMoveRequest: OnMoveRequest = jest.fn(() => ({
        status: 'accepted',
      }));
      const result = await render(
        <ChessboardRuntime
          boardId={fixture.boardId}
          canDragPiece={fixture.canDragPiece}
          development={false}
          dimensions={{ columns: 2, rows: 2 }}
          onMoveRequest={onMoveRequest}
          pieceRenderers={PIECE_RENDERERS}
          position={{
            revision: 11,
            value: { a2: { id: 'guarded', pieceType: 'token' } },
          }}
        />,
      );
      await measure(rootOf(result));
      expect(fixture.canDragPiece).toHaveBeenCalledWith({
        basePositionRevision: 11,
        boardId: fixture.boardId,
        piece: { id: 'guarded', pieceType: 'token' },
        source: { kind: 'board', square: 'a2' },
      });

      await drag(fixture.boardId, BOTTOM_RIGHT);
      await flushDecisions();
      expect(onMoveRequest).not.toHaveBeenCalled();
      await result.unmount();
    }
  });

  it('[PARITY-BEHAVIOR-B49] forwards a promotion-candidate intent without applying chess rules or choosing a promotion', async () => {
    const boardId = 'rules-free';
    const intents: MoveIntent[] = [];
    const onMoveRequest: OnMoveRequest = (intent) => {
      intents.push(intent);
      return { status: 'rejected' };
    };
    const result = await render(
      <ChessboardRuntime
        boardId={boardId}
        development={false}
        dimensions={{ columns: 8, rows: 8 }}
        onMoveRequest={onMoveRequest}
        pieceRenderers={{ wP: pieceProbe }}
        position={{
          revision: 3,
          value: { a7: { id: 'promotion-candidate', pieceType: 'wP' } },
        }}
      />,
    );
    await measure(rootOf(result));
    await dragFrom(boardId, { x: 12.5, y: 37.5 }, { x: 37.5, y: 12.5 });
    await flushDecisions();

    expect(intents).toHaveLength(1);
    const intent = intents[0];
    if (intent === undefined) {
      throw new Error('Expected one rules-free drag intent.');
    }
    expect(typeof intent.intentId).toBe('string');
    expect(intent).toEqual({
      basePositionRevision: 3,
      boardId,
      input: 'drag',
      intentId: intent.intentId,
      piece: { id: 'promotion-candidate', pieceType: 'wP' },
      source: { kind: 'board', square: 'a7' },
      targetSquare: 'b8',
    });
    expect(intent).not.toHaveProperty('promotion');
  });

  it.each(['missing-target', 'missing-pending'] as const)(
    'fails closed instead of preparing a promotion with a %s renderer',
    async (missingRenderer) => {
      const boardId = `promotion-${missingRenderer}`;
      const acceptedIntent: { current: MoveIntent | null } = {
        current: null,
      };
      function StateSensitiveQueen(props: PieceRendererProps): ReactElement {
        return (
          <View
            style={{ opacity: props.state.isPending ? 0.2 : 1 }}
            testID={`move-piece:${visualKind(props)}:${props.square ?? 'spare'}:${props.piece.pieceType}`}
          />
        );
      }
      const initialRenderers = {
        wP: pieceProbe,
        ...(missingRenderer === 'missing-pending'
          ? { wQ: StateSensitiveQueen }
          : {}),
      } satisfies PieceRenderers;
      const committedRenderers =
        missingRenderer === 'missing-target'
          ? initialRenderers
          : ({ wQ: StateSensitiveQueen } satisfies PieceRenderers);
      const onMoveRequest: OnMoveRequest = (intent) => {
        acceptedIntent.current = intent;
        return { status: 'accepted' };
      };
      const result = await render(
        <ChessboardRuntime
          boardId={boardId}
          development={false}
          dimensions={{ columns: 8, rows: 8 }}
          onMoveRequest={onMoveRequest}
          pieceRenderers={initialRenderers}
          position={{
            revision: 10,
            value: { a7: { id: 'promote', pieceType: 'wP' } },
          }}
          reduceMotion="never"
          transitionDurationMs={1_000}
        />,
      );
      const board = rootOf(result);
      await measure(board);
      await dragFrom(boardId, { x: 12.5, y: 37.5 }, { x: 37.5, y: 12.5 });
      const intent = acceptedIntent.current;
      if (intent === null) {
        throw new Error('Expected one accepted promotion candidate.');
      }
      expect(
        nodesByTestId(board, 'move-piece:pending-target:b8:wP'),
      ).toHaveLength(1);

      const preparationFrames: ((timestamp: number) => void)[] = [];
      const frameSpy =
        missingRenderer === 'missing-pending'
          ? jest
              .spyOn(globalThis, 'requestAnimationFrame')
              .mockImplementation((callback) => {
                preparationFrames.push(callback);
                return preparationFrames.length;
              })
          : null;
      try {
        await result.rerender(
          <ChessboardRuntime
            boardId={boardId}
            development={false}
            dimensions={{ columns: 8, rows: 8 }}
            onMoveRequest={onMoveRequest}
            pieceRenderers={committedRenderers}
            position={{
              committedIntentId: intent.intentId,
              revision: 11,
              value: { b8: { id: 'promote', pieceType: 'wQ' } },
            }}
            reduceMotion="never"
            transitionDurationMs={1_000}
          />,
        );
        expect(nodesByTestId(board, 'move-piece:pending-target:b8:wP')).toEqual(
          [],
        );
        if (missingRenderer === 'missing-pending') {
          const canonicalDrain = canonicalDrainVisual(board, boardId, 'b8');
          expect(nodesByTestId(board, 'move-piece:static:b8:wQ')).toHaveLength(
            2,
          );
          const drainQueen = nodesByTestId(
            board,
            'move-piece:static:b8:wQ',
          ).find(({ parent }) => parent === canonicalDrain);
          if (drainQueen === undefined) {
            throw new Error('Expected the canonical-state drain renderer.');
          }
          expect(nativeStyle(drainQueen).opacity).toBe(1);
          expect(
            nodesByTestId(board, 'move-piece:pending-target:b8:wQ'),
          ).toEqual([]);
          const guardedQueen = nodesByTestId(
            board,
            'move-piece:static:b8:wQ',
          )[0];
          if (guardedQueen === undefined) {
            throw new Error('Expected the guarded canonical promotion.');
          }
          expect(
            nativeStyle(boardPieceOcclusionBoundary(guardedQueen)).opacity,
          ).toBe(0);
          await result.rerender(
            <ChessboardRuntime
              boardId={boardId}
              development={false}
              dimensions={{ columns: 8, rows: 8 }}
              onMoveRequest={onMoveRequest}
              pieceRenderers={{
                wP: pieceProbe,
                wQ: StateSensitiveQueen,
              }}
              position={{
                committedIntentId: intent.intentId,
                revision: 11,
                value: { b8: { id: 'promote', pieceType: 'wQ' } },
              }}
              reduceMotion="never"
              transitionDurationMs={1_000}
            />,
          );
          canonicalDrainVisual(board, boardId, 'b8');
          expect(
            nodesByTestId(board, 'move-piece:pending-target:b8:wP'),
          ).toEqual([]);
          expect(preparationFrames.length).toBeGreaterThan(0);
          for (let frameTurn = 0; frameTurn < 4; frameTurn += 1) {
            const queuedFrames = preparationFrames.splice(0);
            if (queuedFrames.length === 0) {
              break;
            }
            await act(() => {
              for (const frame of queuedFrames) {
                frame(16 + frameTurn * 16);
              }
            });
          }
          expectNoCanonicalDrain(board, boardId, 'b8');
          expect(nodesByTestId(board, 'move-piece:static:b8:wQ')).toHaveLength(
            1,
          );
          const settledQueen = nodesByTestId(
            board,
            'move-piece:static:b8:wQ',
          )[0];
          if (settledQueen === undefined) {
            throw new Error('Expected the settled canonical promotion.');
          }
          expect(
            nativeStyle(boardPieceOcclusionBoundary(settledQueen)).opacity,
          ).toBeUndefined();
        }
        await result.unmount();
      } finally {
        frameSpy?.mockRestore();
      }
    },
  );

  it('switches a running promotion handoff directly to canonical drain when its pending renderer disappears', async () => {
    const boardId = 'running-promotion-renderer-loss';
    let removePendingRenderer: (() => void) | undefined;
    function Harness(): ReactElement {
      const [pieceRenderers, setPieceRenderers] = useState<PieceRenderers>({
        wP: pieceProbe,
        wQ: pieceProbe,
      });
      const [position, setPosition] = useState<{
        committedIntentId?: string;
        revision: number;
        transition?: {
          from: 'a7';
          fromRevision: number;
          promotion: 'wQ';
          to: 'b8';
          toRevision: number;
        };
        value: PositionObject;
      }>({
        revision: 70,
        value: { a7: { pieceType: 'wP' } },
      });
      removePendingRenderer = () => {
        setPieceRenderers({ wQ: pieceProbe });
      };
      return (
        <ChessboardProvider>
          <ChessboardRuntime
            boardId={boardId}
            development={false}
            dimensions={{ columns: 8, rows: 8 }}
            onMoveRequest={(intent) => {
              setPosition({
                committedIntentId: intent.intentId,
                revision: 71,
                transition: {
                  from: 'a7',
                  fromRevision: 70,
                  promotion: 'wQ',
                  to: 'b8',
                  toRevision: 71,
                },
                value: { b8: { pieceType: 'wQ' } },
              });
              return { status: 'accepted' };
            }}
            pieceRenderers={pieceRenderers}
            position={position}
            reduceMotion="never"
            transitionDurationMs={1_000}
          />
        </ChessboardProvider>
      );
    }

    const frames: ((timestamp: number) => void)[] = [];
    const frameSpy = jest
      .spyOn(globalThis, 'requestAnimationFrame')
      .mockImplementation((callback) => {
        frames.push(callback);
        return frames.length;
      });
    try {
      const result = await render(<Harness />);
      const board = rootOf(result);
      await measure(board);
      const pan = getByGestureTestId(getBoardGestureTestIds(boardId).pan);
      const handlerTag = (pan as Readonly<{ handlerTag: number }>).handlerTag;
      const callbacks = panCallbacks(pan);
      await act(() => {
        callbacks.onBegin?.({
          absoluteX: 12.5,
          absoluteY: 37.5,
          handlerTag,
          x: 12.5,
          y: 37.5,
        });
        callbacks.onStart?.({
          absoluteX: 37.5,
          absoluteY: 12.5,
          handlerTag,
          x: 37.5,
          y: 12.5,
        });
      });
      await act(() => {
        const terminal = {
          absoluteX: 37.5,
          absoluteY: 12.5,
          handlerTag,
          x: 37.5,
          y: 12.5,
        };
        callbacks.onEnd?.(terminal, true);
        callbacks.onFinalize?.(terminal, true);
      });
      expect(
        nodesByTestId(board, 'move-piece:pending-target:b8:wP'),
      ).toHaveLength(1);
      jest.useFakeTimers();
      expect(frames.length).toBeGreaterThan(0);
      await flushCapturedAnimationFrames(frames);
      const admittedPendingArtwork = nodesByTestId(
        board,
        'move-piece:pending-target:b8:wP',
      )[0];
      if (admittedPendingArtwork?.parent?.parent == null) {
        throw new Error('Expected the admitted pending native host.');
      }
      const admittedPendingHost = admittedPendingArtwork.parent.parent;
      await act(() => {
        jest.advanceTimersByTime(500);
      });
      const midpointQueen = nodesByTestId(board, 'move-piece:static:b8:wQ')[0];
      if (midpointQueen === undefined) {
        throw new Error('Expected the midpoint anonymous promotion target.');
      }
      const midpointOpacity = Number(
        animatedStyle(boardPieceHost(midpointQueen))['opacity'],
      );
      expect(midpointOpacity).toBeGreaterThan(0);
      expect(midpointOpacity).toBeLessThan(1);

      const remove = removePendingRenderer;
      if (remove === undefined) {
        throw new Error('Expected the renderer-loss harness control.');
      }
      await act(() => {
        remove();
      });
      await flushDecisions();

      canonicalDrainVisual(board, boardId, 'b8');
      expect(nodesByTestId(board, 'move-piece:pending-target:b8:wP')).toEqual(
        [],
      );
      const guardedQueen = nodesByTestId(board, 'move-piece:static:b8:wQ')[0];
      if (guardedQueen === undefined) {
        throw new Error('Expected the renderer-loss canonical host.');
      }
      expect(
        nativeStyle(boardPieceOcclusionBoundary(guardedQueen)).opacity,
      ).toBe(0);
      expect(board.queryAll((node) => node === admittedPendingHost)).toEqual([
        admittedPendingHost,
      ]);
      expect(nativeStyle(admittedPendingHost).opacity).toBe(0);
      expect(admittedPendingHost.children).toEqual([]);

      for (let frameTurn = 0; frameTurn < 8; frameTurn += 1) {
        const queuedFrames = frames.splice(0);
        if (queuedFrames.length === 0) {
          break;
        }
        await act(() => {
          for (const frame of queuedFrames) {
            frame(32 + frameTurn * 16);
          }
        });
      }
      expectNoCanonicalDrain(board, boardId, 'b8');
      expect(nodesByTestId(board, 'move-piece:static:b8:wQ')).toHaveLength(1);
      await result.unmount();
    } finally {
      frameSpy.mockRestore();
    }
  });

  it('[PARITY-BEHAVIOR-B23] preserves a null target for an off-board drag through the public callback', async () => {
    const boardId = 'off-board';
    const intents: MoveIntent[] = [];
    const result = await render(
      <ChessboardRuntime
        boardId={boardId}
        development={false}
        dimensions={{ columns: 2, rows: 2 }}
        onMoveRequest={(intent) => {
          intents.push(intent);
          return { status: 'rejected' };
        }}
        pieceRenderers={PIECE_RENDERERS}
        position={{
          revision: 4,
          value: { a2: { pieceType: 'token' } },
        }}
      />,
    );
    await measure(rootOf(result));
    await drag(boardId, OFF_BOARD);
    await flushDecisions();

    expect(intents).toHaveLength(1);
    expect(intents[0]).toEqual(
      expect.objectContaining({
        basePositionRevision: 4,
        boardId,
        input: 'drag',
        source: { kind: 'board', square: 'a2' },
        targetSquare: null,
      }),
    );
    expect(
      result.queryAllByTestId(/:provider-drag-(?:retiring-)?overlay$/, {
        includeHiddenElements: true,
      }),
    ).toEqual([]);
    expectOneVisual(rootOf(result), 'static', 'a2');
    expectNoVisual(rootOf(result), 'pending-target', 'a2');
  });

  it('[PARITY-BEHAVIOR-B11] never mutates position optimistically and hands a matching controlled commit off at the pending target', async () => {
    const boardId = 'controlled-commit';
    const activeProviderOverlayTestId = `chessboard-native:${boardId}:provider-drag-overlay`;
    const retiringProviderOverlayTestId = `chessboard-native:${boardId}:provider-drag-retiring-overlay`;
    const value: PositionObject = Object.freeze({
      a2: Object.freeze({ id: 'controlled', pieceType: 'token' }),
    });
    const position = Object.freeze({ revision: 20, value });
    const outcomes: MoveOutcomeAccessibilityContext[] = [];
    const accessibility = Object.freeze({
      formatMoveOutcome: (context: MoveOutcomeAccessibilityContext): null => {
        outcomes.push(context);
        return null;
      },
    });
    let acceptedIntent: MoveIntent | undefined;
    const onMoveRequest = jest.fn<
      ReturnType<OnMoveRequest>,
      Parameters<OnMoveRequest>
    >((intent, { signal }) => {
      expect(signal.aborted).toBe(false);
      acceptedIntent = intent;
      return { status: 'accepted' };
    });
    const result = await render(
      <ChessboardRuntime
        accessibility={accessibility}
        boardId={boardId}
        development={false}
        dimensions={{ columns: 2, rows: 2 }}
        moveRequestTimeouts={{ commitMs: 60_000, decisionMs: 60_000 }}
        onMoveRequest={onMoveRequest}
        pieceRenderers={PIECE_RENDERERS}
        position={position}
        reduceMotion="never"
        transitionDurationMs={1_000}
      />,
    );
    const board = rootOf(result);
    await measure(board);
    expectOneVisual(board, 'static', 'a2');

    const initialPan = getByGestureTestId(getBoardGestureTestIds(boardId).pan);
    const initialHandlerTag = (
      initialPan as unknown as Readonly<{ handlerTag: number }>
    ).handlerTag;
    const initialCallbacks = panCallbacks(initialPan);
    await act(() => {
      initialCallbacks.onBegin?.({
        absoluteX: START.x,
        absoluteY: START.y,
        handlerTag: initialHandlerTag,
        ...START,
      });
      initialCallbacks.onStart?.({
        absoluteX: BOTTOM_RIGHT.x,
        absoluteY: BOTTOM_RIGHT.y,
        handlerTag: initialHandlerTag,
        ...BOTTOM_RIGHT,
      });
    });
    await flushDecisions();
    const initialActiveOverlays = hiddenNodesByTestId(
      result,
      activeProviderOverlayTestId,
    );
    expect(initialActiveOverlays).toHaveLength(1);
    const initialActiveOverlay = initialActiveOverlays[0];
    if (initialActiveOverlay === undefined) {
      throw new Error('Expected one active provider overlay.');
    }
    const activeOverlayStyles: unknown = initialActiveOverlay.props['style'];
    if (!Array.isArray(activeOverlayStyles)) {
      throw new Error('Expected the active provider overlay style chain.');
    }
    const attachedAnimatedStyle: unknown = activeOverlayStyles.at(-1);
    const retirementFrames: ((timestamp: number) => void)[] = [];
    const retirementFrameSpy = jest
      .spyOn(globalThis, 'requestAnimationFrame')
      .mockImplementation((callback) => {
        retirementFrames.push(callback);
        return retirementFrames.length;
      });
    await act(() => {
      const terminalEvent = {
        absoluteX: BOTTOM_RIGHT.x,
        absoluteY: BOTTOM_RIGHT.y,
        handlerTag: initialHandlerTag,
        ...BOTTOM_RIGHT,
      };
      initialCallbacks.onEnd?.(terminalEvent, true);
      initialCallbacks.onFinalize?.(terminalEvent, true);
    });
    await flushDecisions();
    const releasedOverlays = hiddenNodesByTestId(
      result,
      retiringProviderOverlayTestId,
    );
    expect(releasedOverlays).toHaveLength(1);
    const releasedOverlay = releasedOverlays[0];
    if (releasedOverlay === undefined) {
      throw new Error('Expected one retiring provider overlay.');
    }
    expect(releasedOverlay).toBe(initialActiveOverlay);
    expect(releasedOverlay).toHaveProp('accessibilityElementsHidden', true);
    expect(releasedOverlay).toHaveProp('accessible', false);
    expect(releasedOverlay).toHaveProp(
      'importantForAccessibility',
      'no-hide-descendants',
    );
    expect(releasedOverlay).toHaveProp('pointerEvents', 'none');
    expect(releasedOverlay.props['style']).not.toContain(attachedAnimatedStyle);
    expect(nativeStyle(releasedOverlay)).toEqual(
      expect.objectContaining({ opacity: 0 }),
    );
    expect(hiddenNodesByTestId(result, activeProviderOverlayTestId)).toEqual(
      [],
    );
    expect(nodesByTestId(releasedOverlay, 'move-piece:drag:a2:token')).toEqual(
      [],
    );

    expect(onMoveRequest).toHaveBeenCalledTimes(1);
    const intent = acceptedIntent;
    if (intent === undefined) {
      throw new Error('Expected the drag to invoke onMoveRequest.');
    }

    expect(value).toEqual({
      a2: { id: 'controlled', pieceType: 'token' },
    });
    expect(position.value).toBe(value);
    expectOneVisual(board, 'pending-source', 'a2');
    expectOneVisual(board, 'pending-target', 'b1');
    expectNoVisual(board, 'static', 'b1');
    const pendingSourceArtwork = nodesByTestId(
      board,
      'move-piece:pending-source:a2:token',
    )[0];
    if (pendingSourceArtwork === undefined) {
      throw new Error('Expected the static pending source actor.');
    }
    const pendingSourceHost = boardPieceHost(pendingSourceArtwork);
    expect(nativeStyle(pendingSourceHost).opacity).toBe(0.45);

    expect(retirementFrames).toHaveLength(1);
    retirementFrameSpy.mockRestore();
    jest.useFakeTimers();
    await result.rerender(
      <ChessboardRuntime
        accessibility={accessibility}
        boardId={boardId}
        development={false}
        dimensions={{ columns: 2, rows: 2 }}
        moveRequestTimeouts={{ commitMs: 60_000, decisionMs: 60_000 }}
        onMoveRequest={onMoveRequest}
        pieceRenderers={PIECE_RENDERERS}
        position={{
          committedIntentId: intent.intentId,
          revision: 21,
          value: { b1: { id: 'controlled', pieceType: 'token' } },
        }}
        reduceMotion="never"
        transitionDurationMs={1_000}
      />,
    );

    expect(onMoveRequest).toHaveBeenCalledTimes(1);
    expect(outcomes).toHaveLength(1);
    const committedOutcome = outcomes[0];
    if (committedOutcome === undefined) {
      throw new Error('Expected one correlated committed outcome.');
    }
    expect(committedOutcome.intent.intentId).toBe(intent.intentId);
    expect(committedOutcome.outcome).toBe('committed');
    expect(
      hiddenNodesByTestId(result, retiringProviderOverlayTestId),
    ).toHaveLength(1);

    expectNoVisual(board, 'pending-source', 'a2');
    expectOneVisual(board, 'pending-target', 'b1');
    expectOneVisual(board, 'static', 'b1');
    const canonical = nodesByTestId(board, 'move-piece:static:b1:token')[0];
    const pending = nodesByTestId(
      board,
      'move-piece:pending-target:b1:token',
    )[0];
    if (
      canonical === undefined ||
      pending?.parent?.parent === null ||
      pending?.parent?.parent === undefined
    ) {
      throw new Error('Expected canonical and paused pending hosts.');
    }
    const canonicalHost = boardPieceHost(canonical);
    const canonicalOcclusionBoundary = boardPieceOcclusionBoundary(canonical);
    const pendingHandoffHost = pending.parent.parent;
    const canonicalStyle = animatedStyle(canonicalHost);
    const pendingStyle = animatedStyle(pendingHandoffHost);
    expect(canonicalHost).toBe(pendingSourceHost);
    expect(canonicalStyle['transform']).toBeUndefined();
    // Exact preparation first admits this otherwise-static pending-source
    // host. Its unattached source worklet can still expose .45, or the
    // replacement base-one mapper can already have evaluated. The independent
    // child boundary makes either ordering draw-safe.
    const preparedOuterOpacity = Number(canonicalStyle['opacity']);
    expect(preparedOuterOpacity).toBeGreaterThanOrEqual(0.45);
    expect(preparedOuterOpacity).toBeLessThanOrEqual(1);
    expect(nativeStyle(canonicalOcclusionBoundary).opacity).toBe(0);
    expect(pendingStyle['opacity']).toBe(1);
    expect(
      preparedOuterOpacity *
        Number(nativeStyle(canonicalOcclusionBoundary).opacity) +
        Number(pendingStyle['opacity']),
    ).toBe(1);
    expect(pendingHandoffHost).toHaveProp('accessible', false);
    expect(pendingHandoffHost).toHaveProp('pointerEvents', 'none');

    await act(() => {
      // The first frame is a mount/presentation barrier. The detached provider
      // host must survive it so Fabric can consume the quiescent commit before
      // a later frame removes the native view.
      const firstFrame = retirementFrames.shift();
      if (firstFrame === undefined) {
        throw new Error('Expected the first provider retirement frame.');
      }
      firstFrame(16);
    });
    await flushDecisions();
    expect(hiddenNodesByTestId(result, activeProviderOverlayTestId)).toEqual(
      [],
    );
    const firstFrameRetiringOverlays = hiddenNodesByTestId(
      result,
      retiringProviderOverlayTestId,
    );
    expect(firstFrameRetiringOverlays).toHaveLength(1);
    expect(firstFrameRetiringOverlays[0]).toBe(releasedOverlay);
    expect(
      hiddenNodesByTestId(result, 'chessboard-native:provider-drag-host'),
    ).toHaveLength(1);

    await act(() => {
      jest.advanceTimersByTime(17);
    });
    await flushDecisions();
    expect(hiddenNodesByTestId(result, activeProviderOverlayTestId)).toEqual(
      [],
    );
    expect(hiddenNodesByTestId(result, retiringProviderOverlayTestId)).toEqual(
      [],
    );
    expect(
      hiddenNodesByTestId(result, 'chessboard-native:provider-drag-host'),
    ).toEqual([]);
    const startedCanonical = nodesByTestId(
      board,
      'move-piece:static:b1:token',
    )[0];
    const startedPending = nodesByTestId(
      board,
      'move-piece:pending-target:b1:token',
    )[0];
    if (
      startedCanonical === undefined ||
      startedPending?.parent?.parent === null ||
      startedPending?.parent?.parent === undefined
    ) {
      throw new Error('Expected both actors at the start of the crossfade.');
    }
    expect(startedPending.parent.parent).toBe(pendingHandoffHost);
    expect(
      Number(animatedStyle(boardPieceHost(startedCanonical))['opacity']),
    ).toBeLessThan(0.05);
    expect(
      Number(animatedStyle(startedPending.parent.parent)['opacity']),
    ).toBeGreaterThan(0.95);
    expect(
      nativeStyle(boardPieceOcclusionBoundary(startedCanonical)).opacity,
    ).toBeUndefined();
    expect(
      Number(animatedStyle(boardPieceHost(startedCanonical))['opacity']) +
        Number(animatedStyle(startedPending.parent.parent)['opacity']),
    ).toBeCloseTo(1);

    await act(() => {
      jest.advanceTimersByTime(500);
    });
    const midpointCanonical = nodesByTestId(
      board,
      'move-piece:static:b1:token',
    )[0];
    const midpointPending = nodesByTestId(
      board,
      'move-piece:pending-target:b1:token',
    )[0];
    if (
      midpointCanonical === undefined ||
      midpointPending?.parent?.parent === null ||
      midpointPending?.parent?.parent === undefined
    ) {
      throw new Error('Expected both actors throughout the crossfade.');
    }
    const midpointCanonicalOpacity = Number(
      animatedStyle(boardPieceHost(midpointCanonical))['opacity'],
    );
    const midpointPendingOpacity = Number(
      animatedStyle(midpointPending.parent.parent)['opacity'],
    );
    expect(midpointCanonicalOpacity).toBeCloseTo(0.5);
    expect(midpointPendingOpacity).toBeCloseTo(0.5);
    expect(midpointCanonicalOpacity + midpointPendingOpacity).toBeCloseTo(1);

    const abortFrames: ((timestamp: number) => void)[] = [];
    const abortFrameSpy = jest
      .spyOn(globalThis, 'requestAnimationFrame')
      .mockImplementation((callback) => {
        abortFrames.push(callback);
        return abortFrames.length;
      });
    try {
      await fireEvent(board, 'layout', {
        nativeEvent: {
          layout: { height: BOARD_SIZE, width: BOARD_SIZE - 2, x: 0, y: 0 },
        },
      });
      const warmingDrain = canonicalDrainVisual(board, boardId, 'b1');
      expectNoVisual(board, 'pending-target', 'b1');
      const warmingCanonical = nodesByTestId(
        board,
        'move-piece:static:b1:token',
      )[0];
      if (warmingCanonical === undefined) {
        throw new Error('Expected both geometry-abort warming actors.');
      }
      const warmingOuterOpacity = Number(
        animatedStyle(boardPieceHost(warmingCanonical))['opacity'],
      );
      const warmingMaskOpacity = Number(
        nativeStyle(boardPieceOcclusionBoundary(warmingCanonical)).opacity,
      );
      // The Jest facade intentionally retains the sampled midpoint mapper.
      // The full-opacity pending actor and hard child mask cover the guarded
      // frame while the replacement base-one mapper installs.
      expect(warmingOuterOpacity).toBeCloseTo(0.5);
      expect(warmingMaskOpacity).toBe(0);
      expect(nativeStyle(warmingDrain).opacity ?? 1).toBe(1);
      expect(abortFrames.length).toBeGreaterThan(0);

      let abortFrameCursor = 0;
      for (let frameTurn = 0; frameTurn < 4; frameTurn += 1) {
        const queuedFrames = abortFrames.slice(abortFrameCursor);
        abortFrameCursor = abortFrames.length;
        if (queuedFrames.length === 0) {
          break;
        }
        await act(() => {
          for (const frame of queuedFrames) {
            frame(600 + frameTurn * 16);
          }
        });
      }
      expectNoCanonicalDrain(board, boardId, 'b1');
      expectNoVisual(board, 'pending-target', 'b1');
      const settledCanonical = nodesByTestId(
        board,
        'move-piece:static:b1:token',
      )[0];
      if (settledCanonical === undefined) {
        throw new Error('Expected the geometry-abort canonical actor.');
      }
      expect(
        Number(animatedStyle(boardPieceHost(settledCanonical))['opacity']),
      ).toBeGreaterThanOrEqual(0);
      expect(
        nativeStyle(boardPieceOcclusionBoundary(settledCanonical)).opacity,
      ).toBeUndefined();
    } finally {
      abortFrameSpy.mockRestore();
    }
    expect(onMoveRequest).toHaveBeenCalledTimes(1);
    expect(outcomes).toHaveLength(1);
  });

  it('[CBN-CONTRACT-005-VISUAL-NONCANONICAL] commits the pending target before retiring the exact terminal overlay and source ghost', async () => {
    const boardId = 'terminal-presentation-barrier';
    const runtime: { current: ChessboardProviderRuntime | null } = {
      current: null,
    };
    const pendingRenderTokens: (number | null)[] = [];
    function RuntimeProbe(): null {
      runtime.current = useChessboardProvider().runtime;
      return null;
    }
    function barrierPieceProbe(props: PieceRendererProps): ReactElement {
      useLayoutEffect(() => {
        if (props.state.isPending && !props.state.isGhost) {
          pendingRenderTokens.push(
            runtime.current?.drag.getSnapshot().active?.gestureToken ?? null,
          );
        }
      }, [props.state.isGhost, props.state.isPending]);
      return (
        <View
          testID={`move-piece:${visualKind(props)}:${props.square ?? 'spare'}:${props.piece.pieceType}`}
        />
      );
    }

    const result = await render(
      <ChessboardProvider>
        <RuntimeProbe />
        <ChessboardRuntime
          boardId={boardId}
          development={false}
          dimensions={{ columns: 2, rows: 2 }}
          moveRequestTimeouts={{ commitMs: 60_000, decisionMs: 60_000 }}
          onMoveRequest={() => new Promise(() => undefined)}
          pieceRenderers={{ token: barrierPieceProbe }}
          position={{
            revision: 30,
            value: { a2: { id: 'barrier', pieceType: 'token' } },
          }}
        />
      </ChessboardProvider>,
    );
    const board = rootOf(result);
    await measure(board);
    const pan = getByGestureTestId(getBoardGestureTestIds(boardId).pan);
    const handlerTag = (pan as Readonly<{ handlerTag: number }>).handlerTag;
    const callbacks = panCallbacks(pan);
    await act(() => {
      callbacks.onBegin?.({
        absoluteX: START.x,
        absoluteY: START.y,
        handlerTag,
        ...START,
      });
      callbacks.onStart?.({
        absoluteX: BOTTOM_RIGHT.x,
        absoluteY: BOTTOM_RIGHT.y,
        handlerTag,
        ...BOTTOM_RIGHT,
      });
    });
    const terminalToken =
      runtime.current?.drag.getSnapshot().active?.gestureToken;
    expect(terminalToken).toEqual(expect.any(Number));
    expectOneVisual(board, 'source-ghost', 'a2');
    expectNoVisual(board, 'static', 'a2');

    await act(() => {
      const terminal = {
        absoluteX: BOTTOM_RIGHT.x,
        absoluteY: BOTTOM_RIGHT.y,
        handlerTag,
        ...BOTTOM_RIGHT,
      };
      callbacks.onEnd?.(terminal, true);
      callbacks.onFinalize?.(terminal, true);
    });

    expect(pendingRenderTokens).toContain(terminalToken);
    expect(runtime.current?.drag.getSnapshot().active).toBeNull();
    expectOneVisual(board, 'pending-source', 'a2');
    expectOneVisual(board, 'pending-target', 'b1');
    expectNoVisual(board, 'source-ghost', 'a2');
    expectNoVisual(board, 'static', 'a2');
    await flushRetirementFrames();
  });

  it('commits a synchronous controlled target while the terminal overlay is still attached, then resets after detach', async () => {
    const boardId = 'synchronous-terminal-commit';
    const runtime: { current: ChessboardProviderRuntime | null } = {
      current: null,
    };
    const targetCommitSnapshots: Readonly<{
      activeToken: number | null;
      phase: number | null;
    }>[] = [];
    const targetRenderRoles: string[] = [];
    let updatePieceOpacity: (opacity: number) => void = (): void => {
      throw new Error('Expected the synchronous commit harness to mount.');
    };
    function RuntimeProbe(): null {
      runtime.current = useChessboardProvider().runtime;
      return null;
    }
    function OrderingPieceProbe(props: PieceRendererProps): ReactElement {
      if (props.square === 'b1') {
        targetRenderRoles.push(visualKind(props));
      }
      useLayoutEffect(() => {
        if (
          props.square !== 'b1' ||
          props.state.isDragging ||
          props.state.isGhost ||
          props.state.isPending
        ) {
          return;
        }
        const active = runtime.current?.drag.getSnapshot().active ?? null;
        targetCommitSnapshots.push(
          Object.freeze({
            activeToken: active?.gestureToken ?? null,
            phase: active?.presentation.phase.value ?? null,
          }),
        );
      }, [props.square, props.state]);
      return (
        <View
          testID={`move-piece:${visualKind(props)}:${props.square ?? 'spare'}:${props.piece.pieceType}`}
        />
      );
    }
    function Harness(): ReactElement {
      const [pieceOpacity, setPieceOpacity] = useState(1);
      const [position, setPosition] = useState<{
        committedIntentId?: string;
        revision: number;
        value: PositionObject;
      }>({
        revision: 40,
        value: { a2: { id: 'sync', pieceType: 'token' } },
      });
      updatePieceOpacity = setPieceOpacity;
      return (
        <ChessboardProvider>
          <RuntimeProbe />
          <ChessboardRuntime
            boardId={boardId}
            development={false}
            dimensions={{ columns: 2, rows: 2 }}
            moveRequestTimeouts={{ commitMs: 60_000, decisionMs: 60_000 }}
            onMoveRequest={(intent) => {
              setPosition({
                committedIntentId: intent.intentId,
                revision: 41,
                value: { b1: { id: 'sync', pieceType: 'token' } },
              });
              return { status: 'accepted' };
            }}
            pieceRenderers={{ token: OrderingPieceProbe }}
            position={position}
            reduceMotion="never"
            styles={{
              draggingPieceGhost: { opacity: 0 },
              piece: { opacity: pieceOpacity },
            }}
            transitionDurationMs={100}
          />
        </ChessboardProvider>
      );
    }

    const reportUnexpectedConsoleError = console.error.bind(console);
    const strictModeConsoleErrorSpy = jest
      .spyOn(console, 'error')
      .mockImplementation((...arguments_: unknown[]) => {
        if (
          arguments_.some(
            (argument) =>
              typeof argument === 'string' &&
              argument.includes('findNodeHandle'),
          )
        ) {
          return;
        }
        reportUnexpectedConsoleError(...arguments_);
      });
    const result = await render(
      <StrictMode>
        <Harness />
      </StrictMode>,
    );
    const board = rootOf(result);
    await measure(board);
    const pan = getByGestureTestId(getBoardGestureTestIds(boardId).pan);
    const handlerTag = (pan as Readonly<{ handlerTag: number }>).handlerTag;
    const callbacks = panCallbacks(pan);
    await act(() => {
      callbacks.onBegin?.({
        absoluteX: START.x,
        absoluteY: START.y,
        handlerTag,
        ...START,
      });
      callbacks.onStart?.({
        absoluteX: BOTTOM_RIGHT.x,
        absoluteY: BOTTOM_RIGHT.y,
        handlerTag,
        ...BOTTOM_RIGHT,
      });
    });
    const terminal = runtime.current?.drag.getSnapshot().active ?? null;
    if (terminal === null) {
      throw new Error('Expected an attached terminal provider lease.');
    }
    const freshDragSource = nodesByTestId(
      board,
      'move-piece:source-ghost:a2:token',
    )[0];
    if (freshDragSource === undefined) {
      throw new Error('Expected the synchronous drag source.');
    }
    const freshDragSourceHost = boardPieceHost(freshDragSource);
    // Fresh interaction-only hosts stay on explicit static opacity. The child
    // mask hides the exact-zero ghost until exact preparation admits this same
    // stable-ID host behind its controlled-target barrier.
    const freshSourceOpacity = Number(nativeStyle(freshDragSourceHost).opacity);
    const freshMaskOpacity = Number(
      nativeStyle(boardPieceOcclusionBoundary(freshDragSource)).opacity,
    );
    expect(freshSourceOpacity).toBe(1);
    expect(freshMaskOpacity).toBe(0);
    expect(freshSourceOpacity * freshMaskOpacity).toBe(0);
    const completionFrames: ((timestamp: number) => void)[] = [];
    const completionFrameSpy = jest
      .spyOn(globalThis, 'requestAnimationFrame')
      .mockImplementation((callback) => {
        completionFrames.push(callback);
        return completionFrames.length;
      });
    const scheduleOnRNSpy = jest.spyOn(Worklets, 'scheduleOnRN');
    await act(() => {
      const end = {
        absoluteX: BOTTOM_RIGHT.x,
        absoluteY: BOTTOM_RIGHT.y,
        handlerTag,
        ...BOTTOM_RIGHT,
      };
      callbacks.onEnd?.(end, true);
      callbacks.onFinalize?.(end, true);
    });

    expect(targetCommitSnapshots[0]).toEqual({
      activeToken: terminal.gestureToken,
      phase: INTERACTION_PRESENTATION_PHASE.DRAG_TERMINAL,
    });
    expect(runtime.current?.drag.getSnapshot().active).toBeNull();
    expect(terminal.presentation.phase.value).toBe(
      INTERACTION_PRESENTATION_PHASE.IDLE,
    );
    expectOneVisual(board, 'static', 'b1');
    expectNoVisual(board, 'static', 'a2');
    const synchronousTarget = nodesByTestId(
      board,
      'move-piece:static:b1:token',
    )[0];
    if (synchronousTarget === undefined) {
      throw new Error('Expected the synchronous controlled target.');
    }
    expect(boardPieceHost(synchronousTarget)).toBe(freshDragSourceHost);
    const preparedPending = nodesByTestId(
      board,
      'move-piece:pending-target:b1:token',
    )[0];
    if (preparedPending?.parent?.parent == null) {
      throw new Error('Expected the prepared pending transition host.');
    }
    const preparedCanonicalHost = boardPieceHost(synchronousTarget);
    expect(Number(animatedStyle(preparedCanonicalHost)['opacity'])).toBe(0);
    expect(
      Number(
        nativeStyle(boardPieceOcclusionBoundary(synchronousTarget)).opacity,
      ),
    ).toBe(0);
    expect(
      Number(animatedStyle(preparedPending.parent.parent)['opacity']),
    ).toBe(1);
    expect(
      pendingCommitMapperScheduleCalls(scheduleOnRNSpy.mock.calls),
    ).toHaveLength(0);
    expect(completionFrames.length).toBeGreaterThan(0);
    const staleMapperFrames = completionFrames.splice(0);
    await act(() => {
      updatePieceOpacity(0.8);
    });
    expect(completionFrames.length).toBeGreaterThan(0);
    expect(Number(animatedStyle(preparedCanonicalHost)['opacity'])).toBe(0);
    expect(
      Number(
        nativeStyle(boardPieceOcclusionBoundary(synchronousTarget)).opacity,
      ),
    ).toBe(0);
    jest.useFakeTimers();
    await act(() => {
      jest.advanceTimersByTime(25);
    });
    expect(Number(animatedStyle(preparedCanonicalHost)['opacity'])).toBe(0);
    expect(
      Number(animatedStyle(preparedPending.parent.parent)['opacity']),
    ).toBe(1);
    await act(async () => {
      for (const frame of staleMapperFrames) {
        frame(16);
      }
      jest.runAllTicks();
      await Promise.resolve();
    });
    const staleMapperReadyLeases = pendingCommitMapperScheduleCalls(
      scheduleOnRNSpy.mock.calls,
    );
    expect(staleMapperReadyLeases).toHaveLength(1);
    expect(
      Number(
        nativeStyle(boardPieceOcclusionBoundary(synchronousTarget)).opacity,
      ),
    ).toBe(0);
    expect(
      Number(animatedStyle(preparedPending.parent.parent)['opacity']),
    ).toBe(1);
    for (let turn = 0; turn < 8; turn += 1) {
      if (
        pendingCommitMapperScheduleCalls(scheduleOnRNSpy.mock.calls).length > 1
      ) {
        break;
      }
      const mapperFrames = completionFrames.splice(0);
      await act(async () => {
        for (const frame of mapperFrames) {
          frame(16 + turn * 16);
        }
        jest.runAllTicks();
        await Promise.resolve();
      });
    }
    const mapperReadyLeases = pendingCommitMapperScheduleCalls(
      scheduleOnRNSpy.mock.calls,
    );
    expect(mapperReadyLeases).toHaveLength(2);
    const staleMapperReadyLease = mapperReadyLeases[0];
    const replacementMapperReadyLease = mapperReadyLeases[1];
    if (
      staleMapperReadyLease === undefined ||
      replacementMapperReadyLease === undefined
    ) {
      throw new Error('Expected stale and replacement mapper-ready leases.');
    }
    expect(
      Number.isSafeInteger(replacementMapperReadyLease.canonicalHostGeneration),
    ).toBe(true);
    expect(
      Number.isSafeInteger(replacementMapperReadyLease.pendingHostGeneration),
    ).toBe(true);
    expect(Number.isSafeInteger(replacementMapperReadyLease.serial)).toBe(true);
    expect(replacementMapperReadyLease.serial).toBeGreaterThan(
      staleMapperReadyLease.serial,
    );
    await act(async () => {
      jest.runAllTicks();
      await Promise.resolve();
    });
    expect(
      nativeStyle(boardPieceOcclusionBoundary(synchronousTarget)).opacity,
    ).toBeUndefined();
    expect(Number(animatedStyle(preparedCanonicalHost)['opacity'])).toBe(0);
    expect(
      Number(animatedStyle(preparedPending.parent.parent)['opacity']),
    ).toBe(1);
    const firstClockFrames = completionFrames.splice(0);
    expect(firstClockFrames.length).toBeGreaterThan(0);
    completionFrameSpy.mockRestore();
    await act(() => {
      for (const frame of firstClockFrames) {
        frame(25);
      }
    });
    await act(() => {
      jest.advanceTimersByTime(50);
    });
    const runningCanonicalOpacity = Number(
      animatedStyle(preparedCanonicalHost)['opacity'],
    );
    const runningPendingOpacity = Number(
      animatedStyle(preparedPending.parent.parent)['opacity'],
    );
    expect(runningCanonicalOpacity).toBeGreaterThan(0);
    expect(runningCanonicalOpacity).toBeLessThan(1);
    expect(runningPendingOpacity).toBeGreaterThan(0);
    expect(runningPendingOpacity).toBeLessThan(1);
    expect(runningCanonicalOpacity / 0.8 + runningPendingOpacity).toBeCloseTo(
      1,
      5,
    );
    targetRenderRoles.length = 0;
    await act(() => {
      jest.advanceTimersByTime(500);
      jest.runAllTicks();
    });
    await flushDecisions();
    const completionPending = nodesByTestId(
      board,
      'move-piece:pending-target:b1:token',
    )[0];
    if (completionPending?.parent?.parent != null) {
      expect(
        Number(animatedStyle(completionPending.parent.parent)['opacity']),
      ).toBeLessThan(0.05);
    }
    expect(targetRenderRoles).not.toContain('pending-target');
    expectNoVisual(board, 'pending-target', 'b1');
    const completedTarget = nodesByTestId(
      board,
      'move-piece:static:b1:token',
    )[0];
    if (completedTarget === undefined) {
      throw new Error('Expected the completed synchronous controlled target.');
    }
    expect(
      nativeStyle(boardPieceOcclusionBoundary(completedTarget)).opacity,
    ).toBeUndefined();
    scheduleOnRNSpy.mockRestore();
    await result.unmount();
    expect(
      strictModeConsoleErrorSpy.mock.calls.every((arguments_) =>
        arguments_.some(
          (argument) =>
            typeof argument === 'string' && argument.includes('findNodeHandle'),
        ),
      ),
    ).toBe(true);
    strictModeConsoleErrorSpy.mockRestore();
  });

  it('warms and retires a preserved pending handoff after Suspense tears down its runtime effect', async () => {
    const boardId = 'suspended-pending-handoff';
    const never = new Promise<never>(() => undefined);
    let setMode: ((mode: 'suspended' | 'visible') => void) | undefined;

    function NeverCommits(): ReactElement {
      // eslint-disable-next-line @typescript-eslint/only-throw-error -- React Suspense hides the committed board by throwing a pending thenable.
      throw never;
    }

    function Harness(): ReactElement {
      const [mode, updateMode] = useState<'suspended' | 'visible'>('visible');
      const [position, setPosition] = useState<{
        committedIntentId?: string;
        revision: number;
        value: PositionObject;
      }>({
        revision: 42,
        value: { a2: { id: 'suspended', pieceType: 'token' } },
      });
      setMode = updateMode;
      return (
        <Suspense fallback={<View testID="suspended-board-fallback" />}>
          {mode === 'suspended' ? <NeverCommits /> : null}
          <ChessboardProvider>
            <ChessboardRuntime
              boardId={boardId}
              development={false}
              dimensions={{ columns: 2, rows: 2 }}
              onMoveRequest={(intent) => {
                setPosition({
                  committedIntentId: intent.intentId,
                  revision: 43,
                  value: { b1: { id: 'suspended', pieceType: 'token' } },
                });
                return { status: 'accepted' };
              }}
              pieceRenderers={PIECE_RENDERERS}
              position={position}
              reduceMotion="never"
              transitionDurationMs={1_000}
            />
          </ChessboardProvider>
        </Suspense>
      );
    }

    const frames: ((timestamp: number) => void)[] = [];
    const frameSpy = jest
      .spyOn(globalThis, 'requestAnimationFrame')
      .mockImplementation((callback) => {
        frames.push(callback);
        return frames.length;
      });
    try {
      const result = await render(<Harness />);
      const board = rootOf(result);
      await measure(board);
      const pan = getByGestureTestId(getBoardGestureTestIds(boardId).pan);
      const handlerTag = (pan as Readonly<{ handlerTag: number }>).handlerTag;
      const callbacks = panCallbacks(pan);
      await act(() => {
        callbacks.onBegin?.({
          absoluteX: START.x,
          absoluteY: START.y,
          handlerTag,
          ...START,
        });
        callbacks.onStart?.({
          absoluteX: BOTTOM_RIGHT.x,
          absoluteY: BOTTOM_RIGHT.y,
          handlerTag,
          ...BOTTOM_RIGHT,
        });
      });
      await act(() => {
        const terminal = {
          absoluteX: BOTTOM_RIGHT.x,
          absoluteY: BOTTOM_RIGHT.y,
          handlerTag,
          ...BOTTOM_RIGHT,
        };
        callbacks.onEnd?.(terminal, true);
        callbacks.onFinalize?.(terminal, true);
      });
      expectOneVisual(board, 'pending-target', 'b1');
      jest.useFakeTimers();

      const updateMode = setMode;
      if (updateMode === undefined) {
        throw new Error('Expected the Suspense harness mode setter.');
      }
      await act(() => {
        updateMode('suspended');
      });
      expect(result.queryByTestId('suspended-board-fallback')).not.toBeNull();
      await act(() => {
        updateMode('visible');
      });
      await flushDecisions();

      canonicalDrainVisual(board, boardId, 'b1');
      expectNoVisual(board, 'pending-target', 'b1');
      const warmingCanonical = nodesByTestId(
        board,
        'move-piece:static:b1:token',
      )[0];
      if (warmingCanonical === undefined) {
        throw new Error('Expected the restored warming canonical actor.');
      }
      expect(
        nativeStyle(boardPieceOcclusionBoundary(warmingCanonical)).opacity,
      ).toBe(0);

      for (let frameTurn = 0; frameTurn < 8; frameTurn += 1) {
        const queuedFrames = frames.splice(0);
        if (queuedFrames.length === 0) {
          break;
        }
        await act(() => {
          for (const frame of queuedFrames) {
            frame(16 + frameTurn * 16);
          }
        });
      }
      expectNoCanonicalDrain(board, boardId, 'b1');
      expectNoVisual(board, 'pending-target', 'b1');
      const settledCanonical = nodesByTestId(
        board,
        'move-piece:static:b1:token',
      )[0];
      if (settledCanonical === undefined) {
        throw new Error('Expected the settled Suspense target actor.');
      }
      expect(
        nativeStyle(boardPieceOcclusionBoundary(settledCanonical)).opacity,
      ).toBeUndefined();
      await result.unmount();
    } finally {
      frameSpy.mockRestore();
    }
  });

  it.each([
    { label: 'reduced motion while paused', reducedMotion: true, start: false },
    { label: 'zero duration while running', reducedMotion: false, start: true },
  ])(
    'warms an admitted pending handoff when $label disables its clock',
    async ({ reducedMotion, start }) => {
      const boardId = `disabled-active-handoff:${start ? 'running' : 'paused'}`;
      let disableTransition: (() => void) | undefined;

      function Harness(): ReactElement {
        const [enabled, setEnabled] = useState(true);
        const [position, setPosition] = useState<{
          committedIntentId?: string;
          revision: number;
          value: PositionObject;
        }>({
          revision: 44,
          value: { a2: { id: 'disabled', pieceType: 'token' } },
        });
        disableTransition = () => {
          setEnabled(false);
        };
        return (
          <ChessboardProvider>
            <ChessboardRuntime
              boardId={boardId}
              development={false}
              dimensions={{ columns: 2, rows: 2 }}
              onMoveRequest={(intent) => {
                setPosition({
                  committedIntentId: intent.intentId,
                  revision: 45,
                  value: { b1: { id: 'disabled', pieceType: 'token' } },
                });
                return { status: 'accepted' };
              }}
              pieceRenderers={PIECE_RENDERERS}
              position={position}
              reduceMotion={
                enabled || !reducedMotion ? 'never' : ('always' as const)
              }
              transitionDurationMs={enabled || reducedMotion ? 1_000 : 0}
            />
          </ChessboardProvider>
        );
      }

      const frames: ((timestamp: number) => void)[] = [];
      const frameSpy = jest
        .spyOn(globalThis, 'requestAnimationFrame')
        .mockImplementation((callback) => {
          frames.push(callback);
          return frames.length;
        });
      try {
        const result = await render(<Harness />);
        const board = rootOf(result);
        await measure(board);
        const pan = getByGestureTestId(getBoardGestureTestIds(boardId).pan);
        const handlerTag = (pan as Readonly<{ handlerTag: number }>).handlerTag;
        const callbacks = panCallbacks(pan);
        await act(() => {
          callbacks.onBegin?.({
            absoluteX: START.x,
            absoluteY: START.y,
            handlerTag,
            ...START,
          });
          callbacks.onStart?.({
            absoluteX: BOTTOM_RIGHT.x,
            absoluteY: BOTTOM_RIGHT.y,
            handlerTag,
            ...BOTTOM_RIGHT,
          });
        });
        await act(() => {
          const terminal = {
            absoluteX: BOTTOM_RIGHT.x,
            absoluteY: BOTTOM_RIGHT.y,
            handlerTag,
            ...BOTTOM_RIGHT,
          };
          callbacks.onEnd?.(terminal, true);
          callbacks.onFinalize?.(terminal, true);
        });
        expectOneVisual(board, 'pending-target', 'b1');
        jest.useFakeTimers();

        if (start) {
          const hostReadyFrames = frames.splice(0);
          expect(hostReadyFrames.length).toBeGreaterThan(0);
          await act(() => {
            for (const frame of hostReadyFrames) {
              frame(16);
            }
          });
        }

        const disable = disableTransition;
        if (disable === undefined) {
          throw new Error('Expected the transition configuration setter.');
        }
        await act(() => {
          disable();
        });
        await flushDecisions();

        canonicalDrainVisual(board, boardId, 'b1');
        expectNoVisual(board, 'pending-target', 'b1');
        const warmingCanonical = nodesByTestId(
          board,
          'move-piece:static:b1:token',
        )[0];
        if (warmingCanonical === undefined) {
          throw new Error('Expected the disabled-clock warming canonical.');
        }
        expect(
          nativeStyle(boardPieceOcclusionBoundary(warmingCanonical)).opacity,
        ).toBe(0);

        for (let frameTurn = 0; frameTurn < 12; frameTurn += 1) {
          const queuedFrames = frames.splice(0);
          if (queuedFrames.length === 0) {
            break;
          }
          await act(() => {
            for (const frame of queuedFrames) {
              frame(32 + frameTurn * 16);
            }
          });
        }
        expectNoCanonicalDrain(board, boardId, 'b1');
        expectNoVisual(board, 'pending-target', 'b1');
        const settledCanonical = nodesByTestId(
          board,
          'move-piece:static:b1:token',
        )[0];
        if (settledCanonical === undefined) {
          throw new Error('Expected the disabled-clock settled canonical.');
        }
        expect(
          nativeStyle(boardPieceOcclusionBoundary(settledCanonical)).opacity,
        ).toBeUndefined();
        await result.unmount();
      } finally {
        frameSpy.mockRestore();
      }
    },
  );

  it.each([
    {
      durationMs: 1_000,
      label: 'initial-reduced-motion',
      reduceMotion: 'always' as const,
    },
    {
      durationMs: 0,
      label: 'initial-zero-duration',
      reduceMotion: 'never' as const,
    },
  ])(
    'drains a reused canonical host with $label although no clock can mount',
    async ({ durationMs, label, reduceMotion }) => {
      const boardId = `disabled-drain:${label}`;
      let updatePieceOpacity: (opacity: number) => void = (): void => {
        throw new Error('Expected the disabled-drain harness to mount.');
      };
      function Harness(): ReactElement {
        const [pieceOpacity, setPieceOpacity] = useState(1);
        const [position, setPosition] = useState<{
          committedIntentId?: string;
          revision: number;
          value: PositionObject;
        }>({
          revision: 44,
          value: { a2: { id: 'disabled-drain', pieceType: 'token' } },
        });
        updatePieceOpacity = setPieceOpacity;
        return (
          <ChessboardProvider>
            <ChessboardRuntime
              boardId={boardId}
              development={false}
              dimensions={{ columns: 2, rows: 2 }}
              onMoveRequest={(intent) => {
                setPosition({
                  committedIntentId: intent.intentId,
                  revision: 45,
                  value: {
                    b1: { id: 'disabled-drain', pieceType: 'token' },
                  },
                });
                return { status: 'accepted' };
              }}
              pieceRenderers={PIECE_RENDERERS}
              position={position}
              reduceMotion={reduceMotion}
              styles={{
                draggingPieceGhost: { opacity: 0.5 },
                piece: { opacity: pieceOpacity },
              }}
              transitionDurationMs={durationMs}
            />
          </ChessboardProvider>
        );
      }

      const heldFrames: ((timestamp: number) => void)[] = [];
      const frameSpy = jest
        .spyOn(globalThis, 'requestAnimationFrame')
        .mockImplementation((callback) => {
          heldFrames.push(callback);
          return heldFrames.length;
        });
      try {
        const result = await render(<Harness />);
        const board = rootOf(result);
        await measure(board);
        const pan = getByGestureTestId(getBoardGestureTestIds(boardId).pan);
        const handlerTag = (pan as Readonly<{ handlerTag: number }>).handlerTag;
        const callbacks = panCallbacks(pan);
        await act(() => {
          callbacks.onBegin?.({
            absoluteX: START.x,
            absoluteY: START.y,
            handlerTag,
            ...START,
          });
          callbacks.onStart?.({
            absoluteX: BOTTOM_RIGHT.x,
            absoluteY: BOTTOM_RIGHT.y,
            handlerTag,
            ...BOTTOM_RIGHT,
          });
        });
        await act(() => {
          const terminal = {
            absoluteX: BOTTOM_RIGHT.x,
            absoluteY: BOTTOM_RIGHT.y,
            handlerTag,
            ...BOTTOM_RIGHT,
          };
          callbacks.onEnd?.(terminal, true);
          callbacks.onFinalize?.(terminal, true);
        });

        canonicalDrainVisual(board, boardId, 'b1');
        expectNoVisual(board, 'pending-target', 'b1');
        expect(nodesByTestId(board, 'move-piece:static:b1:token')).toHaveLength(
          2,
        );
        const guardedCanonical = nodesByTestId(
          board,
          'move-piece:static:b1:token',
        )[0];
        if (guardedCanonical === undefined) {
          throw new Error('Expected the disabled-motion canonical host.');
        }
        expect(
          nativeStyle(boardPieceOcclusionBoundary(guardedCanonical)).opacity,
        ).toBe(0);
        expect(heldFrames.length).toBeGreaterThan(0);

        const staleBaseOpacityFrames = [...heldFrames];
        const replacementFrameStart = heldFrames.length;
        await act(() => {
          updatePieceOpacity(0.6);
        });
        const restyledCanonical = nodesByTestId(
          board,
          'move-piece:static:b1:token',
        )[0];
        if (restyledCanonical === undefined) {
          throw new Error('Expected the restyled guarded canonical host.');
        }
        expect(nativeStyle(boardPieceHost(restyledCanonical)).opacity).toBe(
          0.6,
        );
        expect(
          nativeStyle(boardPieceOcclusionBoundary(restyledCanonical)).opacity,
        ).toBe(0);
        canonicalDrainVisual(board, boardId, 'b1');
        expect(heldFrames.length).toBeGreaterThan(replacementFrameStart);
        await act(() => {
          for (const frame of staleBaseOpacityFrames) {
            frame(12);
          }
        });
        canonicalDrainVisual(board, boardId, 'b1');
        expect(
          nativeStyle(boardPieceOcclusionBoundary(restyledCanonical)).opacity,
        ).toBe(0);

        let frameCursor = replacementFrameStart;
        for (let frameTurn = 0; frameTurn < 4; frameTurn += 1) {
          const frames = heldFrames.slice(frameCursor);
          frameCursor = heldFrames.length;
          if (frames.length === 0) {
            break;
          }
          await act(() => {
            for (const frame of frames) {
              frame(16 + frameTurn * 16);
            }
          });
        }
        expectNoCanonicalDrain(board, boardId, 'b1');
        expectOneVisual(board, 'static', 'b1');
        const settledCanonical = nodesByTestId(
          board,
          'move-piece:static:b1:token',
        )[0];
        if (settledCanonical === undefined) {
          throw new Error('Expected the drained canonical host.');
        }
        expect(
          nativeStyle(boardPieceOcclusionBoundary(settledCanonical)).opacity,
        ).toBeUndefined();
        await result.unmount();
      } finally {
        frameSpy.mockRestore();
      }
    },
  );

  it.each([
    { label: 'paused', start: false },
    { label: 'mid-transition', start: true },
  ])(
    'warms the canonical host when a $label exact handoff is superseded by a planner-null revision',
    async ({ start }) => {
      const boardId = `planner-null-successor:${start ? 'running' : 'paused'}`;
      let publishSuccessor: ((revision: number) => void) | undefined;

      function Harness(): ReactElement {
        const [position, setPosition] = useState<{
          committedIntentId?: string;
          revision: number;
          value: PositionObject;
        }>({
          revision: 46,
          value: { a2: { id: 'successor', pieceType: 'token' } },
        });
        publishSuccessor = (revision) => {
          setPosition({
            revision,
            value: { b1: { id: 'successor', pieceType: 'token' } },
          });
        };
        return (
          <ChessboardProvider>
            <ChessboardRuntime
              boardId={boardId}
              development={false}
              dimensions={{ columns: 2, rows: 2 }}
              onMoveRequest={(intent) => {
                setPosition({
                  committedIntentId: intent.intentId,
                  revision: 47,
                  value: { b1: { id: 'successor', pieceType: 'token' } },
                });
                return { status: 'accepted' };
              }}
              pieceRenderers={PIECE_RENDERERS}
              position={position}
              reduceMotion="never"
              transitionDurationMs={1_000}
            />
          </ChessboardProvider>
        );
      }

      const frames: ((timestamp: number) => void)[] = [];
      const frameSpy = jest
        .spyOn(globalThis, 'requestAnimationFrame')
        .mockImplementation((callback) => {
          frames.push(callback);
          return frames.length;
        });
      try {
        const result = await render(<Harness />);
        const board = rootOf(result);
        await measure(board);
        const pan = getByGestureTestId(getBoardGestureTestIds(boardId).pan);
        const handlerTag = (pan as Readonly<{ handlerTag: number }>).handlerTag;
        const callbacks = panCallbacks(pan);
        await act(() => {
          callbacks.onBegin?.({
            absoluteX: START.x,
            absoluteY: START.y,
            handlerTag,
            ...START,
          });
          callbacks.onStart?.({
            absoluteX: BOTTOM_RIGHT.x,
            absoluteY: BOTTOM_RIGHT.y,
            handlerTag,
            ...BOTTOM_RIGHT,
          });
        });
        await act(() => {
          const terminal = {
            absoluteX: BOTTOM_RIGHT.x,
            absoluteY: BOTTOM_RIGHT.y,
            handlerTag,
            ...BOTTOM_RIGHT,
          };
          callbacks.onEnd?.(terminal, true);
          callbacks.onFinalize?.(terminal, true);
        });
        expectOneVisual(board, 'pending-target', 'b1');

        jest.useFakeTimers();

        if (start) {
          await flushCapturedAnimationFrames(frames);
          const runningPending = nodesByTestId(
            board,
            'move-piece:pending-target:b1:token',
          )[0];
          if (runningPending?.parent?.parent == null) {
            throw new Error('Expected the running pending handoff host.');
          }
          const opacity = Number(
            animatedStyle(runningPending.parent.parent)['opacity'],
          );
          expect(opacity).toBeGreaterThan(0);
          expect(opacity).toBeLessThan(1);
        }

        const staleHandoffFrames = frames.splice(0);
        const publish = publishSuccessor;
        if (publish === undefined) {
          throw new Error('Expected the planner-null successor setter.');
        }
        await act(() => {
          publish(48);
        });
        await flushDecisions();

        canonicalDrainVisual(board, boardId, 'b1');
        expectNoVisual(board, 'pending-target', 'b1');
        const guardedCanonical = nodesByTestId(
          board,
          'move-piece:static:b1:token',
        )[0];
        if (guardedCanonical === undefined) {
          throw new Error('Expected the planner-null guarded canonical host.');
        }
        expect(
          nativeStyle(boardPieceOcclusionBoundary(guardedCanonical)).opacity,
        ).toBe(0);

        const staleFirstDrainFrames = frames.splice(0);
        expect(staleFirstDrainFrames.length).toBeGreaterThan(0);
        await act(() => {
          publish(49);
        });
        await flushDecisions();
        canonicalDrainVisual(board, boardId, 'b1');
        await act(() => {
          for (const frame of staleFirstDrainFrames) {
            frame(80);
          }
        });
        canonicalDrainVisual(board, boardId, 'b1');
        const replacementGuardedCanonical = nodesByTestId(
          board,
          'move-piece:static:b1:token',
        )[0];
        if (replacementGuardedCanonical === undefined) {
          throw new Error('Expected the replacement drain canonical host.');
        }
        expect(
          nativeStyle(boardPieceOcclusionBoundary(replacementGuardedCanonical))
            .opacity,
        ).toBe(0);

        for (let frameTurn = 0; frameTurn < 16; frameTurn += 1) {
          const queuedFrames = frames.splice(0);
          if (queuedFrames.length === 0) {
            break;
          }
          await act(() => {
            for (const frame of queuedFrames) {
              frame(96 + frameTurn * 16);
            }
          });
        }
        expectNoCanonicalDrain(board, boardId, 'b1');
        expectNoVisual(board, 'pending-target', 'b1');
        const settledCanonical = nodesByTestId(
          board,
          'move-piece:static:b1:token',
        )[0];
        if (settledCanonical === undefined) {
          throw new Error('Expected the planner-null settled canonical host.');
        }
        expect(
          nativeStyle(boardPieceOcclusionBoundary(settledCanonical)).opacity,
        ).toBeUndefined();
        await act(() => {
          for (const frame of staleHandoffFrames) {
            frame(400);
          }
        });
        expectNoCanonicalDrain(board, boardId, 'b1');
        expectNoVisual(board, 'pending-target', 'b1');
        await result.unmount();
      } finally {
        frameSpy.mockRestore();
      }
    },
  );

  it.each([
    {
      after: Object.freeze({
        b1: Object.freeze({ id: 'timeout', pieceType: 'token' }),
      }),
      initial: Object.freeze({
        a2: Object.freeze({ id: 'timeout', pieceType: 'token' }),
      }),
      label: 'stable-ID',
      renderers: PIECE_RENDERERS,
    },
    {
      after: Object.freeze({
        b1: Object.freeze({ pieceType: 'token' }),
      }),
      initial: Object.freeze({
        a2: Object.freeze({ pieceType: 'token' }),
        b1: Object.freeze({ pieceType: 'victim' }),
      }),
      label: 'anonymous-capture',
      renderers: Object.freeze({ token: pieceProbe, victim: pieceProbe }),
    },
  ])(
    'snaps a $label paused handoff atomically when its host-ready frame never ACKs',
    async ({ after, initial, label, renderers }) => {
      const boardId = `paused-handoff-timeout:${label}`;
      function Harness(): ReactElement {
        const [position, setPosition] = useState<{
          committedIntentId?: string;
          revision: number;
          value: PositionObject;
        }>({
          revision: 50,
          value: initial,
        });
        return (
          <ChessboardProvider>
            <ChessboardRuntime
              boardId={boardId}
              development={false}
              dimensions={{ columns: 2, rows: 2 }}
              onMoveRequest={(intent) => {
                setPosition({
                  committedIntentId: intent.intentId,
                  revision: 51,
                  value: after,
                });
                return { status: 'accepted' };
              }}
              pieceRenderers={renderers}
              position={position}
              reduceMotion="never"
              transitionDurationMs={1_000}
            />
          </ChessboardProvider>
        );
      }

      const heldFrames: ((timestamp: number) => void)[] = [];
      const frameSpy = jest
        .spyOn(globalThis, 'requestAnimationFrame')
        .mockImplementation((callback) => {
          heldFrames.push(callback);
          return heldFrames.length;
        });
      try {
        const result = await render(<Harness />);
        const board = rootOf(result);
        await measure(board);
        const pan = getByGestureTestId(getBoardGestureTestIds(boardId).pan);
        const handlerTag = (pan as Readonly<{ handlerTag: number }>).handlerTag;
        const callbacks = panCallbacks(pan);
        await act(() => {
          callbacks.onBegin?.({
            absoluteX: START.x,
            absoluteY: START.y,
            handlerTag,
            ...START,
          });
          callbacks.onStart?.({
            absoluteX: BOTTOM_RIGHT.x,
            absoluteY: BOTTOM_RIGHT.y,
            handlerTag,
            ...BOTTOM_RIGHT,
          });
        });
        await act(() => {
          const end = {
            absoluteX: BOTTOM_RIGHT.x,
            absoluteY: BOTTOM_RIGHT.y,
            handlerTag,
            ...BOTTOM_RIGHT,
          };
          callbacks.onEnd?.(end, true);
          callbacks.onFinalize?.(end, true);
        });

        expectOneVisual(board, 'static', 'b1');
        expectOneVisual(board, 'pending-target', 'b1');
        const pausedCanonical = nodesByTestId(
          board,
          'move-piece:static:b1:token',
        )[0];
        if (pausedCanonical === undefined) {
          throw new Error('Expected the paused canonical target.');
        }
        expect(
          nativeStyle(boardPieceOcclusionBoundary(pausedCanonical)).opacity,
        ).toBe(0);

        await act(
          () =>
            new Promise<void>((resolve) => {
              setTimeout(resolve, 70);
            }),
        );
        canonicalDrainVisual(board, boardId, 'b1');
        expect(nodesByTestId(board, 'move-piece:static:b1:token')).toHaveLength(
          2,
        );
        expectNoVisual(board, 'pending-target', 'b1');
        const warmingCanonical = nodesByTestId(
          board,
          'move-piece:static:b1:token',
        )[0];
        if (warmingCanonical === undefined) {
          throw new Error('Expected the warming canonical target.');
        }
        expect(
          nativeStyle(boardPieceOcclusionBoundary(warmingCanonical)).opacity,
        ).toBe(0);

        const staleFrames = [...heldFrames];
        let frameCursor = 0;
        for (let frameTurn = 0; frameTurn < 4; frameTurn += 1) {
          const queuedFrames = heldFrames.slice(frameCursor);
          frameCursor = heldFrames.length;
          if (queuedFrames.length === 0) {
            break;
          }
          await act(() => {
            for (const frame of queuedFrames) {
              frame(80 + frameTurn * 16);
            }
          });
        }
        expectNoCanonicalDrain(board, boardId, 'b1');
        expectOneVisual(board, 'static', 'b1');
        expectNoVisual(board, 'pending-target', 'b1');
        const snappedCanonical = nodesByTestId(
          board,
          'move-piece:static:b1:token',
        )[0];
        if (snappedCanonical === undefined) {
          throw new Error('Expected the snapped canonical target.');
        }
        expect(animatedStyle(boardPieceHost(snappedCanonical))['opacity']).toBe(
          1,
        );
        expect(
          nativeStyle(boardPieceOcclusionBoundary(snappedCanonical)).opacity,
        ).toBeUndefined();
        await act(() => {
          for (const frame of staleFrames) {
            frame(96);
          }
        });
        expectNoVisual(board, 'pending-target', 'b1');
        await result.unmount();
      } finally {
        frameSpy.mockRestore();
      }
    },
  );

  it.each([
    Object.freeze({
      after: Object.freeze({
        a2: Object.freeze({ id: 'same-square', pieceType: 'token' }),
      }),
      initial: Object.freeze({
        a2: Object.freeze({ id: 'same-square', pieceType: 'token' }),
      }),
      scenario: 'planner-null',
      target: START,
      targetSquare: 'a2',
      ghostOpacity: 0.5,
    }),
    Object.freeze({
      after: Object.freeze({
        a1: Object.freeze({ pieceType: 'token' }),
        b1: Object.freeze({ pieceType: 'token' }),
      }),
      initial: Object.freeze({
        a2: Object.freeze({ pieceType: 'token' }),
        b2: Object.freeze({ pieceType: 'token' }),
      }),
      scenario: 'missing-pending-actor',
      target: BOTTOM_RIGHT,
      targetSquare: 'b1',
      ghostOpacity: 0,
    }),
  ] as const)(
    'retires one direct preparation commit atomically when the special $scenario path cannot mount',
    async ({
      after,
      ghostOpacity,
      initial,
      scenario,
      target,
      targetSquare,
    }) => {
      const boardId = `handoff-${scenario}`;
      let pendingTargetCommitCount = 0;
      function PreparationProbe(props: PieceRendererProps): ReactElement {
        useLayoutEffect(() => {
          if (props.square === targetSquare && props.state.isPending) {
            pendingTargetCommitCount += 1;
          }
        }, [props.square, props.state.isPending, targetSquare]);
        return (
          <View
            testID={`move-piece:${visualKind(props)}:${props.square ?? 'spare'}:${props.piece.pieceType}`}
          />
        );
      }
      function Harness(): ReactElement {
        const [position, setPosition] = useState<{
          committedIntentId?: string;
          revision: number;
          value: PositionObject;
        }>({ revision: 60, value: initial });
        return (
          <ChessboardProvider>
            <ChessboardRuntime
              boardId={boardId}
              development={false}
              dimensions={{ columns: 2, rows: 2 }}
              onMoveRequest={(intent) => {
                setPosition({
                  committedIntentId: intent.intentId,
                  revision: 61,
                  value: after,
                });
                return { status: 'accepted' };
              }}
              pieceRenderers={{ token: PreparationProbe }}
              position={position}
              reduceMotion="never"
              styles={{ draggingPieceGhost: { opacity: ghostOpacity } }}
              transitionDurationMs={1_000}
            />
          </ChessboardProvider>
        );
      }

      const heldFrames: ((timestamp: number) => void)[] = [];
      const frameSpy = jest
        .spyOn(globalThis, 'requestAnimationFrame')
        .mockImplementation((callback) => {
          heldFrames.push(callback);
          return heldFrames.length;
        });
      try {
        const result = await render(<Harness />);
        const board = rootOf(result);
        await measure(board);
        const pan = getByGestureTestId(getBoardGestureTestIds(boardId).pan);
        const handlerTag = (pan as Readonly<{ handlerTag: number }>).handlerTag;
        const callbacks = panCallbacks(pan);
        await act(() => {
          callbacks.onBegin?.({
            absoluteX: START.x,
            absoluteY: START.y,
            handlerTag,
            ...START,
          });
          callbacks.onStart?.({
            absoluteX: BOTTOM_RIGHT.x,
            absoluteY: BOTTOM_RIGHT.y,
            handlerTag,
            ...BOTTOM_RIGHT,
          });
        });
        await act(() => {
          const end = {
            absoluteX: target.x,
            absoluteY: target.y,
            handlerTag,
            ...target,
          };
          callbacks.onEnd?.(end, true);
          callbacks.onFinalize?.(end, true);
        });

        expect(pendingTargetCommitCount).toBeGreaterThan(0);
        const warmingDrain = canonicalDrainVisual(board, boardId, targetSquare);
        expectNoVisual(board, 'pending-target', targetSquare);
        const warmingCanonical = nodesByTestId(
          board,
          `move-piece:static:${targetSquare}:token`,
        )[0];
        if (warmingCanonical === undefined) {
          throw new Error('Expected both fail-closed warming actors.');
        }
        const warmingCanonicalHost = boardPieceHost(warmingCanonical);
        const warmingOuterOpacity = Number(
          animatedStyle(warmingCanonicalHost)['opacity'],
        );
        expect(warmingOuterOpacity).toBeGreaterThanOrEqual(0);
        expect(warmingOuterOpacity).toBeLessThanOrEqual(1);
        expect(
          nativeStyle(boardPieceOcclusionBoundary(warmingCanonical)).opacity,
        ).toBe(0);
        expect(nativeStyle(warmingDrain).opacity ?? 1).toBe(1);
        expect(heldFrames.length).toBeGreaterThan(0);

        const staleFrames = [...heldFrames];
        await act(() => {
          for (const frame of staleFrames) {
            frame(80);
          }
        });

        expectNoCanonicalDrain(board, boardId, targetSquare);
        expectNoVisual(board, 'pending-target', targetSquare);
        const canonicalTarget = nodesByTestId(
          board,
          `move-piece:static:${targetSquare}:token`,
        )[0];
        if (canonicalTarget === undefined) {
          throw new Error('Expected the fail-closed canonical target.');
        }
        expect(animatedStyle(boardPieceHost(canonicalTarget))['opacity']).toBe(
          1,
        );
        expect(
          nativeStyle(boardPieceOcclusionBoundary(canonicalTarget)).opacity,
        ).toBeUndefined();
        await result.unmount();
        await act(() => {
          for (const frame of staleFrames) {
            frame(96);
          }
        });
      } finally {
        frameSpy.mockRestore();
      }
    },
  );

  it.each([
    'admission-reject',
    'null-target-reject',
    'throwing-consumer',
  ] as const)(
    'commits the restored source before retiring a terminal %s',
    async (fixture) => {
      const boardId = `terminal-${fixture}`;
      const runtime: { current: ChessboardProviderRuntime | null } = {
        current: null,
      };
      const sourceCommitSnapshots: Readonly<{
        activeToken: number | null;
        phase: number | null;
      }>[] = [];
      const intents: MoveIntent[] = [];
      let allowDrag = true;
      let terminalStarted = false;
      function RuntimeProbe(): null {
        runtime.current = useChessboardProvider().runtime;
        return null;
      }
      function SourceBarrierPieceProbe(
        props: PieceRendererProps,
      ): ReactElement {
        useLayoutEffect(() => {
          if (
            !terminalStarted ||
            props.square !== 'a2' ||
            props.state.isDragging ||
            props.state.isGhost ||
            props.state.isPending
          ) {
            return;
          }
          const active = runtime.current?.drag.getSnapshot().active ?? null;
          sourceCommitSnapshots.push(
            Object.freeze({
              activeToken: active?.gestureToken ?? null,
              phase: active?.presentation.phase.value ?? null,
            }),
          );
        }, [props.square, props.state]);
        return (
          <View
            testID={`move-piece:${visualKind(props)}:${props.square ?? 'spare'}:${props.piece.pieceType}`}
          />
        );
      }

      const result = await render(
        <ChessboardProvider>
          <RuntimeProbe />
          <ChessboardRuntime
            boardId={boardId}
            canDragPiece={() => allowDrag}
            development={false}
            dimensions={{ columns: 2, rows: 2 }}
            onMoveRequest={(intent) => {
              intents.push(intent);
              if (fixture === 'throwing-consumer') {
                throw new Error('synchronous consumer failure');
              }
              return { status: 'rejected' };
            }}
            pieceRenderers={{ token: SourceBarrierPieceProbe }}
            position={{
              revision: 42,
              value: { a2: { id: fixture, pieceType: 'token' } },
            }}
          />
        </ChessboardProvider>,
      );
      const board = rootOf(result);
      await measure(board);
      const pan = getByGestureTestId(getBoardGestureTestIds(boardId).pan);
      const handlerTag = (pan as Readonly<{ handlerTag: number }>).handlerTag;
      const callbacks = panCallbacks(pan);
      await act(() => {
        callbacks.onBegin?.({
          absoluteX: START.x,
          absoluteY: START.y,
          handlerTag,
          ...START,
        });
        callbacks.onStart?.({
          absoluteX: START.x + 10,
          absoluteY: START.y,
          handlerTag,
          x: START.x + 10,
          y: START.y,
        });
      });
      const terminal = runtime.current?.drag.getSnapshot().active ?? null;
      if (terminal === null) {
        throw new Error('Expected an attached terminal provider lease.');
      }
      if (fixture === 'admission-reject') {
        allowDrag = false;
      }
      terminalStarted = true;
      const target =
        fixture === 'null-target-reject' ? OFF_BOARD : BOTTOM_RIGHT;
      await act(() => {
        const end = {
          absoluteX: target.x,
          absoluteY: target.y,
          handlerTag,
          ...target,
        };
        callbacks.onEnd?.(end, true);
        callbacks.onFinalize?.(end, true);
      });

      expect(sourceCommitSnapshots[0]).toEqual({
        activeToken: terminal.gestureToken,
        phase: INTERACTION_PRESENTATION_PHASE.DRAG_TERMINAL,
      });
      expect(intents).toHaveLength(fixture === 'admission-reject' ? 0 : 1);
      if (fixture === 'null-target-reject') {
        expect(intents[0]?.targetSquare).toBeNull();
      }
      expect(runtime.current?.drag.getSnapshot().active).toBeNull();
      expect(terminal.presentation.phase.value).toBe(
        INTERACTION_PRESENTATION_PHASE.IDLE,
      );
      expectOneVisual(board, 'static', 'a2');
      await result.unmount();
    },
  );

  it('restores the canonical source before retiring an ACTION_CANCEL terminal lease', async () => {
    const boardId = 'terminal-native-cancel';
    const runtime: { current: ChessboardProviderRuntime | null } = {
      current: null,
    };
    const sourceCommitSnapshots: Readonly<{
      activeToken: number | null;
      phase: number | null;
    }>[] = [];
    let terminalStarted = false;
    function RuntimeProbe(): null {
      runtime.current = useChessboardProvider().runtime;
      return null;
    }
    function CancelBarrierPieceProbe(props: PieceRendererProps): ReactElement {
      useLayoutEffect(() => {
        if (
          !terminalStarted ||
          props.square !== 'a2' ||
          props.state.isDragging ||
          props.state.isGhost ||
          props.state.isPending
        ) {
          return;
        }
        const active = runtime.current?.drag.getSnapshot().active ?? null;
        sourceCommitSnapshots.push(
          Object.freeze({
            activeToken: active?.gestureToken ?? null,
            phase: active?.presentation.phase.value ?? null,
          }),
        );
      }, [props.square, props.state]);
      return (
        <View
          testID={`move-piece:${visualKind(props)}:${props.square ?? 'spare'}:${props.piece.pieceType}`}
        />
      );
    }
    const onMoveRequest = jest.fn<
      ReturnType<OnMoveRequest>,
      Parameters<OnMoveRequest>
    >(() => ({ status: 'accepted' }));
    const result = await render(
      <ChessboardProvider>
        <RuntimeProbe />
        <ChessboardRuntime
          boardId={boardId}
          development={false}
          dimensions={{ columns: 2, rows: 2 }}
          onMoveRequest={onMoveRequest}
          pieceRenderers={{ token: CancelBarrierPieceProbe }}
          position={{
            revision: 44,
            value: { a2: { id: 'cancelled', pieceType: 'token' } },
          }}
          styles={{ draggingPieceGhost: { opacity: 0 } }}
        />
      </ChessboardProvider>,
    );
    const board = rootOf(result);
    await measure(board);
    const pan = getByGestureTestId(getBoardGestureTestIds(boardId).pan);
    const handlerTag = (pan as Readonly<{ handlerTag: number }>).handlerTag;
    const callbacks = panCallbacks(pan);
    await act(() => {
      callbacks.onBegin?.({
        absoluteX: START.x,
        absoluteY: START.y,
        handlerTag,
        ...START,
      });
      callbacks.onStart?.({
        absoluteX: START.x + 10,
        absoluteY: START.y,
        handlerTag,
        x: START.x + 10,
        y: START.y,
      });
    });
    const terminal = runtime.current?.drag.getSnapshot().active ?? null;
    if (terminal === null) {
      throw new Error('Expected an attached provider lease before cancel.');
    }
    const cancelledSourceGhost = nodesByTestId(
      board,
      'move-piece:source-ghost:a2:token',
    )[0];
    if (cancelledSourceGhost === undefined) {
      throw new Error('Expected the exact-zero source ghost before cancel.');
    }
    const cancelledSourceHost = boardPieceHost(cancelledSourceGhost);
    expect(nativeStyle(cancelledSourceHost).opacity).toBe(1);
    expect(
      nativeStyle(boardPieceOcclusionBoundary(cancelledSourceGhost)).opacity,
    ).toBe(0);

    terminalStarted = true;
    await act(() => {
      callbacks.onFinalize?.(
        {
          absoluteX: START.x + 10,
          absoluteY: START.y,
          handlerTag,
          x: START.x + 10,
          y: START.y,
        },
        false,
      );
    });

    expect(sourceCommitSnapshots[0]).toEqual({
      activeToken: terminal.gestureToken,
      phase: INTERACTION_PRESENTATION_PHASE.DRAG_TERMINAL,
    });
    expect(onMoveRequest).not.toHaveBeenCalled();
    expect(runtime.current?.drag.getSnapshot().active).toBeNull();
    expect(terminal.presentation.phase.value).toBe(
      INTERACTION_PRESENTATION_PHASE.IDLE,
    );
    expectOneVisual(board, 'static', 'a2');
    expectNoVisual(board, 'source-ghost', 'a2');
    const restoredSource = nodesByTestId(
      board,
      'move-piece:static:a2:token',
    )[0];
    if (restoredSource === undefined) {
      throw new Error('Expected the restored exact-zero source.');
    }
    expect(boardPieceHost(restoredSource)).toBe(cancelledSourceHost);
    expect(nativeStyle(cancelledSourceHost).opacity).toBe(1);
    expect(
      nativeStyle(boardPieceOcclusionBoundary(restoredSource)).opacity,
    ).toBeUndefined();
    await result.unmount();
  });

  it.each(['admission-reject', 'null-target-reject'] as const)(
    'keeps a successor drag source ghosted when it replaces a stale terminal %s before the restore barrier',
    async (fixture) => {
      const boardId = `terminal-successor-${fixture}`;
      const runtime: { current: ChessboardProviderRuntime | null } = {
        current: null,
      };
      const successorCommitSnapshots: Readonly<{
        activeToken: number | null;
        phase: number | null;
        visual: string;
      }>[] = [];
      const boardRoot: { current: TestInstance | null } = { current: null };
      let allowDrag = true;
      let successorStarted = false;

      function RuntimeProbe(): null {
        const provider = useChessboardProvider().runtime;
        const snapshot = useSyncExternalStore(
          provider.drag.subscribe,
          provider.drag.getSnapshot,
          provider.drag.getSnapshot,
        );
        runtime.current = provider;
        useLayoutEffect(() => {
          if (!successorStarted || boardRoot.current === null) {
            return;
          }
          const sourceGhost = nodesByTestId(
            boardRoot.current,
            'move-piece:source-ghost:a2:token',
          );
          const staticSource = nodesByTestId(
            boardRoot.current,
            'move-piece:static:a2:token',
          );
          successorCommitSnapshots.push(
            Object.freeze({
              activeToken: snapshot.active?.gestureToken ?? null,
              phase: snapshot.active?.presentation.phase.value ?? null,
              visual:
                sourceGhost.length > 0
                  ? 'source-ghost'
                  : staticSource.length > 0
                    ? 'static'
                    : 'missing',
            }),
          );
        }, [snapshot]);
        return null;
      }

      const result = await render(
        <ChessboardProvider>
          <RuntimeProbe />
          <ChessboardRuntime
            boardId={boardId}
            canDragPiece={() => allowDrag}
            development={false}
            dimensions={{ columns: 2, rows: 2 }}
            onMoveRequest={() => ({ status: 'rejected' })}
            pieceRenderers={PIECE_RENDERERS}
            position={{
              revision: 43,
              value: { a2: { id: fixture, pieceType: 'token' } },
            }}
          />
        </ChessboardProvider>,
      );
      const board = rootOf(result);
      boardRoot.current = board;
      await measure(board);
      const pan = getByGestureTestId(getBoardGestureTestIds(boardId).pan);
      const handlerTag = (pan as Readonly<{ handlerTag: number }>).handlerTag;
      const callbacks = panCallbacks(pan);
      await act(() => {
        callbacks.onBegin?.({
          absoluteX: START.x,
          absoluteY: START.y,
          handlerTag,
          ...START,
        });
        callbacks.onStart?.({
          absoluteX: START.x + 10,
          absoluteY: START.y,
          handlerTag,
          x: START.x + 10,
          y: START.y,
        });
      });
      const rejectedTerminal =
        runtime.current?.drag.getSnapshot().active ?? null;
      if (rejectedTerminal === null) {
        throw new Error('Expected an attached terminal provider lease.');
      }
      if (fixture === 'admission-reject') {
        allowDrag = false;
      }
      const target =
        fixture === 'null-target-reject' ? OFF_BOARD : BOTTOM_RIGHT;

      await act(() => {
        const terminal = {
          absoluteX: target.x,
          absoluteY: target.y,
          handlerTag,
          ...target,
        };
        callbacks.onEnd?.(terminal, true);
        callbacks.onFinalize?.(terminal, true);
        allowDrag = true;
        successorStarted = true;
        callbacks.onBegin?.({
          absoluteX: START.x,
          absoluteY: START.y,
          handlerTag,
          ...START,
        });
        callbacks.onStart?.({
          absoluteX: START.x + 10,
          absoluteY: START.y,
          handlerTag,
          x: START.x + 10,
          y: START.y,
        });
      });

      const successor = runtime.current?.drag.getSnapshot().active ?? null;
      expect(successor?.gestureToken).not.toBe(rejectedTerminal.gestureToken);
      expect(successor).toEqual(
        expect.objectContaining({
          boardId,
          source: { kind: 'board', square: 'a2' },
        }),
      );
      expect(successor?.presentation).toBe(rejectedTerminal.presentation);
      expect(successorCommitSnapshots[0]).toEqual({
        activeToken: successor?.gestureToken,
        phase: INTERACTION_PRESENTATION_PHASE.DRAG,
        visual: 'source-ghost',
      });
      expectNoVisual(board, 'static', 'a2');
      expectOneVisual(board, 'source-ghost', 'a2');

      await act(() => {
        callbacks.onFinalize?.(
          {
            absoluteX: START.x + 10,
            absoluteY: START.y,
            handlerTag,
            x: START.x + 10,
            y: START.y,
          },
          false,
        );
      });
      await result.unmount();
    },
  );

  it.each([
    Object.freeze({ replaceOwner: true, replacePresentation: false }),
    Object.freeze({ replaceOwner: false, replacePresentation: true }),
    Object.freeze({ replaceOwner: false, replacePresentation: false }),
  ])(
    'does not retire a same-board same-token spare replacement (owner=$replaceOwner, presentation=$replacePresentation)',
    async ({ replaceOwner, replacePresentation }) => {
      const boardId = `terminal-aba-${replaceOwner ? 'owner' : replacePresentation ? 'presentation' : 'source'}`;
      const runtime: { current: ChessboardProviderRuntime | null } = {
        current: null,
      };
      const foreignPresentation: {
        current: Readonly<InteractionPresentationSharedValues> | null;
      } = { current: null };
      const foreignOwner = Object.freeze({});
      const originalLease: {
        owner: object | null;
        presentation: Readonly<InteractionPresentationSharedValues> | null;
      } = { owner: null, presentation: null };
      let replacementEstablished = false;

      function RuntimeProbe(): null {
        runtime.current = useChessboardProvider().runtime;
        foreignPresentation.current = useInteractionPresentationSharedValues();
        return null;
      }
      function ReplacingPieceProbe(props: PieceRendererProps): ReactElement {
        useLayoutEffect(() => {
          if (
            replacementEstablished ||
            !props.state.isPending ||
            props.state.isGhost
          ) {
            return;
          }
          const provider = runtime.current;
          const active = provider?.drag.getSnapshot().active ?? null;
          const alternatePresentation = foreignPresentation.current;
          if (
            provider === null ||
            active === null ||
            alternatePresentation === null
          ) {
            return;
          }
          replacementEstablished = true;
          originalLease.owner = active.owner;
          originalLease.presentation = active.presentation;
          alternatePresentation.phase.value =
            INTERACTION_PRESENTATION_PHASE.DRAG_TERMINAL;
          alternatePresentation.pointerX.value = 77;
          alternatePresentation.pointerY.value = 88;
          provider.drag.claim(
            Object.freeze({
              ...active,
              onCancel: jest.fn(),
              owner: replaceOwner ? foreignOwner : active.owner,
              presentation: replacePresentation
                ? alternatePresentation
                : active.presentation,
              source: Object.freeze({
                kind: 'spare' as const,
                spareId: 'foreign-spare',
              }),
              square: null,
            }),
          );
        }, [props.state.isGhost, props.state.isPending]);
        return (
          <View
            testID={`move-piece:${visualKind(props)}:${props.square ?? 'spare'}:${props.piece.pieceType}`}
          />
        );
      }

      const result = await render(
        <ChessboardProvider>
          <RuntimeProbe />
          <ChessboardRuntime
            boardId={boardId}
            development={false}
            dimensions={{ columns: 2, rows: 2 }}
            moveRequestTimeouts={{ commitMs: 60_000, decisionMs: 60_000 }}
            onMoveRequest={() => new Promise(() => undefined)}
            pieceRenderers={{ token: ReplacingPieceProbe }}
            position={{
              revision: 31,
              value: { a2: { id: 'aba', pieceType: 'token' } },
            }}
          />
        </ChessboardProvider>,
      );
      const board = rootOf(result);
      await measure(board);
      const pan = getByGestureTestId(getBoardGestureTestIds(boardId).pan);
      const handlerTag = (pan as Readonly<{ handlerTag: number }>).handlerTag;
      const callbacks = panCallbacks(pan);
      await act(() => {
        callbacks.onBegin?.({
          absoluteX: START.x,
          absoluteY: START.y,
          handlerTag,
          ...START,
        });
        callbacks.onStart?.({
          absoluteX: BOTTOM_RIGHT.x,
          absoluteY: BOTTOM_RIGHT.y,
          handlerTag,
          ...BOTTOM_RIGHT,
        });
        const terminal = {
          absoluteX: BOTTOM_RIGHT.x,
          absoluteY: BOTTOM_RIGHT.y,
          handlerTag,
          ...BOTTOM_RIGHT,
        };
        callbacks.onEnd?.(terminal, true);
        callbacks.onFinalize?.(terminal, true);
      });

      const foreign = runtime.current?.drag.getSnapshot().active ?? null;
      expect(replacementEstablished).toBe(true);
      expect(foreign).toEqual(
        expect.objectContaining({
          boardId,
          source: { kind: 'spare', spareId: 'foreign-spare' },
        }),
      );
      expect(typeof foreign?.gestureToken).toBe('number');
      expect(foreign?.owner).toBe(
        replaceOwner ? foreignOwner : originalLease.owner,
      );
      const expectedPresentation = replacePresentation
        ? foreignPresentation.current
        : originalLease.presentation;
      expect(foreign?.presentation).toBe(expectedPresentation);
      if (replacePresentation) {
        expect(expectedPresentation?.phase.value).toBe(
          INTERACTION_PRESENTATION_PHASE.DRAG_TERMINAL,
        );
        expect(expectedPresentation?.pointerX.value).toBe(77);
        expect(expectedPresentation?.pointerY.value).toBe(88);
        expect(originalLease.presentation?.phase.value).toBe(
          INTERACTION_PRESENTATION_PHASE.IDLE,
        );
      } else {
        expect(expectedPresentation?.phase.value).not.toBe(
          INTERACTION_PRESENTATION_PHASE.IDLE,
        );
      }

      const foreignPhase = expectedPresentation?.phase.value;
      const foreignPointerX = expectedPresentation?.pointerX.value;
      const foreignPointerY = expectedPresentation?.pointerY.value;
      await result.rerender(
        <ChessboardProvider>
          <RuntimeProbe />
          <ChessboardRuntime
            boardId={boardId}
            development={false}
            dimensions={{ columns: 2, rows: 2 }}
            moveRequestTimeouts={{ commitMs: 60_000, decisionMs: 60_000 }}
            onMoveRequest={() => new Promise(() => undefined)}
            pieceRenderers={{ token: ReplacingPieceProbe }}
            position={{
              revision: 32,
              value: { a2: { id: 'aba', pieceType: 'token' } },
            }}
          />
        </ChessboardProvider>,
      );

      const afterControlledSync =
        runtime.current?.drag.getSnapshot().active ?? null;
      expect(afterControlledSync).toEqual(
        expect.objectContaining({
          boardId,
          source: { kind: 'spare', spareId: 'foreign-spare' },
        }),
      );
      expect(afterControlledSync?.gestureToken).toBe(foreign?.gestureToken);
      expect(afterControlledSync?.owner).toBe(foreign?.owner);
      expect(afterControlledSync?.presentation).toBe(expectedPresentation);
      expect(expectedPresentation?.phase.value).toBe(foreignPhase);
      expect(expectedPresentation?.pointerX.value).toBe(foreignPointerX);
      expect(expectedPresentation?.pointerY.value).toBe(foreignPointerY);

      if (foreign !== null) {
        await act(() => {
          runtime.current?.drag.release(foreign.owner, foreign.gestureToken);
        });
      }
      await result.unmount();
    },
  );

  it('cancels pending work when a second drag starts and renders one active source ghost plus overlay', async () => {
    const boardId = 'second-drag-replaces';
    let decisionSignal: AbortSignal | undefined;
    const onMoveRequest: OnMoveRequest = jest.fn((_intent, { signal }) => {
      decisionSignal = signal;
      return new Promise(() => undefined);
    });
    const result = await render(
      <ChessboardRuntime
        boardId={boardId}
        development={false}
        dimensions={{ columns: 2, rows: 2 }}
        moveRequestTimeouts={{ commitMs: 60_000, decisionMs: 60_000 }}
        onMoveRequest={onMoveRequest}
        pieceRenderers={PIECE_RENDERERS}
        position={{
          revision: 12,
          value: { a2: { id: 'replaceable', pieceType: 'token' } },
        }}
      />,
    );
    const board = rootOf(result);
    await measure(board);
    await drag(boardId, BOTTOM_RIGHT);
    expect(onMoveRequest).toHaveBeenCalledTimes(1);
    expect(decisionSignal?.aborted).toBe(false);
    expectOneVisual(board, 'pending-source', 'a2');
    expectOneVisual(board, 'pending-target', 'b1');

    const pan = getByGestureTestId(getBoardGestureTestIds(boardId).pan);
    const handlerTag = (pan as unknown as Readonly<{ handlerTag: number }>)
      .handlerTag;
    const callbacks = panCallbacks(pan);
    await act(() => {
      callbacks.onBegin?.({ handlerTag, x: 25, y: 25 });
      callbacks.onStart?.({ handlerTag, x: 35, y: 25 });
    });

    expect(decisionSignal?.aborted).toBe(true);
    expectNoVisual(board, 'pending-target', 'b1');
    expectOneVisual(board, 'source-ghost', 'a2');
    expect(
      result.queryAllByTestId('move-piece:drag:a2:token', {
        includeHiddenElements: true,
      }),
    ).toHaveLength(1);
    expectNoVisual(board, 'static', 'a2');

    await act(() => {
      callbacks.onFinalize?.({ handlerTag, x: 35, y: 25 }, false);
    });
    await flushRetirementFrames();
    expect(onMoveRequest).toHaveBeenCalledTimes(1);
    expectOneVisual(board, 'static', 'a2');
    expectNoVisual(board, 'source-ghost', 'a2');
    expect(
      result.queryAllByTestId('move-piece:drag:a2:token', {
        includeHiddenElements: true,
      }),
    ).toEqual([]);
  });

  it('clears a captured accessibility source when a physical drag starts and cancels', async () => {
    const boardId = 'drag-clears-accessibility-source';
    const onMoveRequest: OnMoveRequest = jest.fn(() => ({
      status: 'rejected',
    }));
    const result = await render(
      <ChessboardRuntime
        boardId={boardId}
        development={false}
        dimensions={{ columns: 2, rows: 2 }}
        onMoveRequest={onMoveRequest}
        pieceRenderers={PIECE_RENDERERS}
        position={{
          revision: 14,
          value: { a2: { id: 'captured', pieceType: 'token' } },
        }}
      />,
    );
    const root = rootOf(result);
    await measure(root);
    await accessibilityAction(root, 'activate');
    expect(rootOf(result).props['accessibilityValue']).toEqual(
      expect.objectContaining({
        text: 'a2, token piece; pending move source',
      }),
    );

    const pan = getByGestureTestId(getBoardGestureTestIds(boardId).pan);
    const handlerTag = (pan as unknown as Readonly<{ handlerTag: number }>)
      .handlerTag;
    const callbacks = panCallbacks(pan);
    await act(() => {
      callbacks.onBegin?.({ handlerTag, x: 25, y: 25 });
      callbacks.onStart?.({ handlerTag, x: 35, y: 25 });
      callbacks.onFinalize?.({ handlerTag, x: 35, y: 25 }, false);
    });
    await flushRetirementFrames();

    expect(rootOf(result).props['accessibilityValue']).toEqual(
      expect.objectContaining({ text: 'a2, token piece' }),
    );
    expect(
      (
        rootOf(result).props['accessibilityActions'] as readonly Readonly<{
          name: string;
        }>[]
      ).some(({ name }) => name === 'cancel-move'),
    ).toBe(false);
    expect(onMoveRequest).not.toHaveBeenCalled();
  });

  it('cancels an accepted plain-tier request when a newer uncorrelated controlled value arrives', async () => {
    const boardId = 'plain-position-change';
    const onMoveRequest: OnMoveRequest = jest.fn(() => ({
      status: 'accepted',
    }));
    const result = await render(
      <ChessboardRuntime
        boardId={boardId}
        development={false}
        dimensions={{ columns: 2, rows: 2 }}
        moveRequestTimeouts={{ commitMs: 60_000, decisionMs: 60_000 }}
        onMoveRequest={onMoveRequest}
        pieceRenderers={PIECE_RENDERERS}
        position={{ a2: { id: 'plain', pieceType: 'token' } }}
      />,
    );
    await measure(rootOf(result));
    await drag(boardId, BOTTOM_RIGHT);
    await flushDecisions();
    expect(onMoveRequest).toHaveBeenCalledTimes(1);
    expectOneVisual(rootOf(result), 'pending-target', 'b1');

    await result.rerender(
      <ChessboardRuntime
        boardId={boardId}
        development={false}
        dimensions={{ columns: 2, rows: 2 }}
        moveRequestTimeouts={{ commitMs: 60_000, decisionMs: 60_000 }}
        onMoveRequest={onMoveRequest}
        pieceRenderers={PIECE_RENDERERS}
        position={{ b2: { id: 'plain', pieceType: 'token' } }}
      />,
    );

    expectNoVisual(rootOf(result), 'pending-target', 'b1');
    expectOneVisual(rootOf(result), 'static', 'b2');
  });

  it('keeps the mounted executor live through React StrictMode effect replay', async () => {
    const boardId = 'strict-runtime';
    const onMoveRequest: OnMoveRequest = jest.fn(() => ({
      status: 'rejected',
    }));
    const result = await render(
      <StrictMode>
        <ChessboardRuntime
          boardId={boardId}
          development={false}
          dimensions={{ columns: 2, rows: 2 }}
          interactionPermissions={{ accessibility: true, drag: false }}
          onMoveRequest={onMoveRequest}
          pieceRenderers={PIECE_RENDERERS}
          position={{
            revision: 1,
            value: { a2: { pieceType: 'token' } },
          }}
        />
      </StrictMode>,
    );
    const root = rootOf(result);
    await fireEvent(root, 'accessibilityAction', {
      nativeEvent: { actionName: 'activate' },
    });
    await fireEvent(root, 'accessibilityAction', {
      nativeEvent: { actionName: 'move-cursor-right' },
    });
    await fireEvent(root, 'accessibilityAction', {
      nativeEvent: { actionName: 'activate' },
    });
    await flushDecisions();

    expect(onMoveRequest).toHaveBeenCalledTimes(1);
  });

  it('keeps a pending executor live when a timeout-changing concurrent render is abandoned', async () => {
    interface HarnessState {
      readonly mode: 'committed' | 'suspended';
      readonly version: number;
    }

    const boardId = 'abandoned-runtime-render';
    const never = new Promise<never>(() => undefined);
    const decision = new Promise<MoveDecision>(() => undefined);
    let decisionSignal: AbortSignal | undefined;
    let updateHarness: ((next: HarnessState) => void) | undefined;
    const onMoveRequest: OnMoveRequest = jest.fn((_intent, { signal }) => {
      decisionSignal = signal;
      return decision;
    });
    const position = Object.freeze({
      revision: 12,
      value: Object.freeze({
        a2: Object.freeze({ id: 'stable', pieceType: 'token' }),
      }),
    });

    function SuspendForever(): ReactElement {
      // eslint-disable-next-line @typescript-eslint/only-throw-error -- React Suspense uses thrown thenables as its render protocol.
      throw never;
    }

    function ConcurrentHarness(): ReactElement {
      const [state, setState] = useState<HarnessState>({
        mode: 'committed',
        version: 0,
      });
      updateHarness = (next) => {
        setState(next);
      };
      const shouldSuspend = state.mode === 'suspended';
      return (
        <Suspense fallback={<View testID="abandoned-runtime-fallback" />}>
          <ChessboardRuntime
            boardId={boardId}
            development={false}
            dimensions={{ columns: 2, rows: 2 }}
            moveRequestTimeouts={
              shouldSuspend
                ? { commitMs: 50_000, decisionMs: 50_000 }
                : { commitMs: 60_000, decisionMs: 60_000 }
            }
            onMoveRequest={onMoveRequest}
            pieceRenderers={PIECE_RENDERERS}
            position={position}
          />
          {shouldSuspend ? <SuspendForever /> : null}
        </Suspense>
      );
    }

    const result = await render(<ConcurrentHarness />);
    await measure(rootOf(result));
    await drag(boardId, BOTTOM_RIGHT);
    expect(decisionSignal?.aborted).toBe(false);
    expectOneVisual(rootOf(result), 'pending-target', 'b1');

    const update = updateHarness;
    if (update === undefined) {
      throw new Error('Expected the concurrent harness state setter.');
    }
    await act(() => {
      startTransition(() => {
        update({ mode: 'suspended', version: 1 });
      });
    });
    expect(
      nodesByTestId(rootOf(result), 'abandoned-runtime-fallback'),
    ).toHaveLength(0);
    expect(decisionSignal?.aborted).toBe(false);

    await act(() => {
      update({ mode: 'committed', version: 2 });
    });
    await flushDecisions();

    expect(decisionSignal?.aborted).toBe(false);
    expectOneVisual(rootOf(result), 'pending-target', 'b1');
    expect(onMoveRequest).toHaveBeenCalledTimes(1);

    await result.unmount();
    expect(decisionSignal?.aborted).toBe(true);
  });

  it('never reuses an intent ID when timeout reconfiguration replaces the executor', async () => {
    const boardId = 'timeout-reconfiguration';
    const intents: MoveIntent[] = [];
    const outcomes: MoveOutcomeAccessibilityContext[] = [];
    const onMoveRequest: OnMoveRequest = (intent) => {
      intents.push(intent);
      return { status: 'accepted' };
    };
    const formatMoveOutcome = (
      context: MoveOutcomeAccessibilityContext,
    ): null => {
      outcomes.push(context);
      return null;
    };
    const originalPosition = {
      revision: 30,
      value: { a2: { id: 'stable', pieceType: 'token' } },
    } as const;
    const result = await render(
      <ChessboardRuntime
        accessibility={{ formatMoveOutcome }}
        boardId={boardId}
        development={false}
        dimensions={{ columns: 2, rows: 2 }}
        moveRequestTimeouts={{ commitMs: 60_000, decisionMs: 60_000 }}
        onMoveRequest={onMoveRequest}
        pieceRenderers={PIECE_RENDERERS}
        position={originalPosition}
      />,
    );
    await measure(rootOf(result));
    await drag(boardId, BOTTOM_RIGHT);
    await flushDecisions();

    await result.rerender(
      <ChessboardRuntime
        accessibility={{ formatMoveOutcome }}
        boardId={boardId}
        development={false}
        dimensions={{ columns: 2, rows: 2 }}
        moveRequestTimeouts={{ commitMs: 50_000, decisionMs: 50_000 }}
        onMoveRequest={onMoveRequest}
        pieceRenderers={PIECE_RENDERERS}
        position={originalPosition}
      />,
    );
    await flushDecisions();
    await drag(boardId, BOTTOM_RIGHT);
    await flushDecisions();

    expect(intents).toHaveLength(2);
    const first = intents[0];
    const second = intents[1];
    if (first === undefined || second === undefined) {
      throw new Error('Expected one intent from each executor generation.');
    }
    expect(second.intentId).not.toBe(first.intentId);

    await result.rerender(
      <ChessboardRuntime
        accessibility={{ formatMoveOutcome }}
        boardId={boardId}
        development={false}
        dimensions={{ columns: 2, rows: 2 }}
        moveRequestTimeouts={{ commitMs: 50_000, decisionMs: 50_000 }}
        onMoveRequest={onMoveRequest}
        pieceRenderers={PIECE_RENDERERS}
        position={{
          committedIntentId: first.intentId,
          revision: 31,
          value: originalPosition.value,
        }}
      />,
    );

    expect(outcomes).toHaveLength(1);
    const outcome = outcomes[0];
    if (outcome === undefined) {
      throw new Error(
        'Expected the replacement executor to cancel its intent.',
      );
    }
    expect(outcome.intent.intentId).toBe(second.intentId);
    expect(outcome.outcome).toBe('cancelled');
    expect(outcome.reason).toBe('position-change');
  });

  it('aborts a pending public request immediately on unmount and ignores its late decision', async () => {
    const outcomes: MoveOutcomeAccessibilityContext[] = [];
    let decisionSignal: AbortSignal | undefined;
    let resolveDecision: ((decision: MoveDecision) => void) | undefined;
    const decision = new Promise<MoveDecision>((resolve) => {
      resolveDecision = resolve;
    });
    const result = await render(
      <ChessboardRuntime
        accessibility={{
          formatMoveOutcome: (context) => {
            outcomes.push(context);
            return null;
          },
        }}
        boardId="unmount-request"
        development={false}
        dimensions={{ columns: 2, rows: 2 }}
        moveRequestTimeouts={{ commitMs: 60_000, decisionMs: 60_000 }}
        onMoveRequest={(_intent, { signal }) => {
          decisionSignal = signal;
          return decision;
        }}
        pieceRenderers={PIECE_RENDERERS}
        position={{
          revision: 2,
          value: { a2: { pieceType: 'token' } },
        }}
      />,
    );
    await measure(rootOf(result));
    await drag('unmount-request', BOTTOM_RIGHT);
    expect(decisionSignal?.aborted).toBe(false);

    await result.unmount();
    expect(decisionSignal?.aborted).toBe(true);
    resolveDecision?.({ status: 'accepted' });
    await flushDecisions();
    expect(outcomes).toEqual([]);
  });

  it('keeps two mounted interactive boards and their intent identities isolated', async () => {
    const firstIntents: MoveIntent[] = [];
    const secondIntents: MoveIntent[] = [];
    const result = await render(
      <View>
        <ChessboardRuntime
          boardId="isolated-first"
          development={false}
          dimensions={{ columns: 2, rows: 2 }}
          onMoveRequest={(intent) => {
            firstIntents.push(intent);
            return { status: 'rejected' };
          }}
          pieceRenderers={PIECE_RENDERERS}
          position={{
            revision: 5,
            value: { a2: { pieceType: 'token' } },
          }}
        />
        <ChessboardRuntime
          boardId="isolated-second"
          development={false}
          dimensions={{ columns: 2, rows: 2 }}
          onMoveRequest={(intent) => {
            secondIntents.push(intent);
            return { status: 'rejected' };
          }}
          pieceRenderers={PIECE_RENDERERS}
          position={{
            revision: 5,
            value: { a2: { pieceType: 'token' } },
          }}
        />
      </View>,
    );
    const boards = rootOf(result).queryAll(
      (node) => node.props['accessibilityRole'] === 'adjustable',
    );
    expect(boards).toHaveLength(2);
    const firstBoard = boards[0];
    const secondBoard = boards[1];
    if (firstBoard === undefined || secondBoard === undefined) {
      throw new Error('Expected two interactive board hosts.');
    }
    await measure(firstBoard);
    await measure(secondBoard);
    await drag('isolated-first', BOTTOM_RIGHT);
    await drag('isolated-second', BOTTOM_RIGHT);
    await flushDecisions();

    expect(firstIntents).toHaveLength(1);
    expect(secondIntents).toHaveLength(1);
    expect(firstIntents[0]?.boardId).toBe('isolated-first');
    expect(secondIntents[0]?.boardId).toBe('isolated-second');
    expect(firstIntents[0]?.intentId).not.toBe(secondIntents[0]?.intentId);
  });
});
