import { act, fireEvent, render } from '@testing-library/react-native';
import { StrictMode } from 'react';
import { AccessibilityInfo, Platform, View } from 'react-native';
import type { TestInstance } from 'test-renderer';

import {
  Chessboard,
  type ChessboardAccessibilityAction,
  type ChessboardError,
  type ChessboardErrorContext,
  type MoveIntent,
  type PositionObject,
} from '../../src/index';
import { ChessboardRuntime } from '../../src/Chessboard';
import {
  useBoardAccessibility,
  type BoardAccessibilityMoveInteraction,
} from '../../src/accessibility/board-accessibility';
import {
  createBoardModelMetadata,
  prepareBoardModel,
  type NormalizedBoardModel,
} from '../../src/internal/board-model';
import {
  createInteractionState,
  reduceInteraction,
  type MoveIntentLifecycle,
} from '../../src/internal/interaction-reducer';

function rootOf(result: Awaited<ReturnType<typeof render>>): TestInstance {
  if (result.root === null) {
    throw new Error('Expected Chessboard to render one native root.');
  }
  return result.root;
}

function actionNames(root: TestInstance): string[] {
  const value = root.props['accessibilityActions'] as
    readonly Readonly<{ name: string }>[] | undefined;
  return value?.map(({ name }) => name) ?? [];
}

function actionLabels(root: TestInstance): string[] {
  const value = root.props['accessibilityActions'] as
    readonly Readonly<{ label?: string }>[] | undefined;
  return (
    value?.flatMap(({ label }) => (label === undefined ? [] : [label])) ?? []
  );
}

async function accessibilityAction(
  root: TestInstance,
  actionName: string,
): Promise<void> {
  await fireEvent(root, 'accessibilityAction', {
    nativeEvent: { actionName },
  });
}

interface MoveAccessibilityHarnessProps {
  readonly interaction: BoardAccessibilityMoveInteraction;
  readonly model: NormalizedBoardModel;
}

function MoveAccessibilityHarness({
  interaction,
  model,
}: MoveAccessibilityHarnessProps) {
  const props = useBoardAccessibility(model, undefined, interaction);
  return (
    <View
      accessibilityActions={props.accessibilityActions}
      accessibilityHint={props.accessibilityHint}
      accessibilityLabel={props.accessibilityLabel}
      accessibilityValue={props.accessibilityValue}
      accessible
      onAccessibilityAction={props.onAccessibilityAction}
    />
  );
}

function accessibilityModel(options: {
  readonly boardId?: string;
  readonly dimensions?: Readonly<{ columns: number; rows: number }>;
  readonly orientation?: 'black' | 'white';
  readonly position: PositionObject;
  readonly revision: number;
}): NormalizedBoardModel {
  const prepared = prepareBoardModel({
    boardId: options.boardId ?? 'accessible-move-board',
    development: false,
    dimensions: options.dimensions ?? { columns: 2, rows: 2 },
    orientation: options.orientation,
    position: { revision: options.revision, value: options.position },
    previousMetadata: createBoardModelMetadata(),
  });
  const error = prepared.errors[0];
  if (error !== undefined) {
    throw error;
  }
  return prepared.model;
}

function moveInteraction(options: {
  readonly cancel?: (reason?: 'accessibility' | 'user') => boolean;
  readonly lifecycle?: Readonly<MoveIntentLifecycle> | null;
  readonly request: (draft: Omit<MoveIntent, 'intentId'>) => boolean;
}): BoardAccessibilityMoveInteraction {
  return {
    cancel: options.cancel ?? (() => false),
    enabled: true,
    lifecycle: options.lifecycle ?? null,
    request: options.request,
  };
}

function decidingAccessibilityMove(
  targetSquare: 'a2' | 'b2' | null = 'b2',
): Readonly<MoveIntentLifecycle> {
  const initial = createInteractionState({
    boardId: 'accessible-move-board',
    positionRevision: 1,
  });
  return reduceInteraction(initial, {
    intent: {
      basePositionRevision: 1,
      boardId: 'accessible-move-board',
      input: 'accessibility',
      intentId: 'accessible-intent-1',
      piece: { id: 'pawn', pieceType: 'wP' },
      source: { kind: 'board', square: 'a2' },
      targetSquare,
    },
    type: 'request',
  }).state;
}

describe('single-control board accessibility', () => {
  it('exposes one adjustable control and navigates before visual measurement', async () => {
    const result = await render(
      <Chessboard
        boardId="accessible-board"
        position="8/8/8/8/8/8/8/8"
        reduceMotion="never"
      />,
    );
    const root = rootOf(result);

    expect(root).toHaveProp('accessible', true);
    expect(root).toHaveProp('accessibilityRole', 'adjustable');
    expect(root).toHaveProp('importantForAccessibility', 'yes');
    expect(root).toHaveProp('pointerEvents', 'box-none');
    expect(root).toHaveProp(
      'accessibilityLabel',
      'Chessboard, white orientation',
    );
    expect(root).toHaveProp('accessibilityValue', {
      max: 63,
      min: 0,
      now: 0,
      text: 'a8, empty',
    });
    expect(actionNames(root)).toEqual(
      Platform.OS === 'android'
        ? ['increment', 'move-cursor-right', 'move-cursor-down']
        : ['move-cursor-right', 'move-cursor-down'],
    );
    expect(
      root.queryAll((node) => node.props['accessibilityRole'] === 'adjustable'),
    ).toHaveLength(0);

    const handleAction = root.props['onAccessibilityAction'] as (
      event: Readonly<{ nativeEvent: Readonly<{ actionName: string }> }>,
    ) => void;
    await act(() => {
      handleAction({ nativeEvent: { actionName: 'increment' } });
      handleAction({ nativeEvent: { actionName: 'increment' } });
    });
    expect(rootOf(result)).toHaveProp('accessibilityValue', {
      max: 63,
      min: 0,
      now: 2,
      text: 'c8, empty',
    });

    await accessibilityAction(rootOf(result), 'move-cursor-down');
    expect(rootOf(result).props['accessibilityValue']).toEqual(
      expect.objectContaining({ now: 10, text: 'c7, empty' }),
    );

    await accessibilityAction(rootOf(result), 'activate');
    await accessibilityAction(rootOf(result), 'remove-piece');
    await accessibilityAction(rootOf(result), 'unknown-action');
    expect(rootOf(result).props['accessibilityValue']).toEqual(
      expect.objectContaining({ now: 10, text: 'c7, empty' }),
    );
  });

  it.each(['constructor', 'toString', '__proto__'])(
    'announces custom piece type %s without inherited label lookup',
    async (pieceType) => {
      const result = await render(
        <Chessboard
          boardId={`custom-label-${pieceType}`}
          dimensions={{ columns: 1, rows: 1 }}
          position={{ a1: { pieceType } }}
          reduceMotion="always"
        />,
      );

      expect(rootOf(result)).toHaveProp('accessibilityValue', {
        max: 0,
        min: 0,
        now: 0,
        text: `a1, ${pieceType} piece`,
      });
    },
  );

  it('announces the committed cursor value after Android adjustable and custom actions', async () => {
    jest.replaceProperty(Platform, 'OS', 'android');
    const announce = jest
      .spyOn(AccessibilityInfo, 'announceForAccessibility')
      .mockImplementation(() => undefined);
    const request = jest.fn(() => true);
    const model = accessibilityModel({
      position: { a2: { id: 'pawn', pieceType: 'wP' } },
      revision: 1,
    });
    const result = await render(
      <MoveAccessibilityHarness
        interaction={moveInteraction({ request })}
        model={model}
      />,
    );
    const root = rootOf(result);
    expect(announce).not.toHaveBeenCalled();
    expect(actionNames(root)).toContain('increment');

    await accessibilityAction(root, 'increment');
    expect(announce).toHaveBeenLastCalledWith('b2, empty');

    await accessibilityAction(rootOf(result), 'move-cursor-left');
    expect(announce).toHaveBeenLastCalledWith('a2, white pawn');
    expect(announce).toHaveBeenCalledTimes(2);

    await accessibilityAction(rootOf(result), 'activate');
    expect(announce).toHaveBeenLastCalledWith(
      'a2, white pawn; pending move source',
    );
    await accessibilityAction(rootOf(result), 'move-cursor-right');
    expect(announce).toHaveBeenLastCalledWith('b2, empty; pending move target');
    await accessibilityAction(rootOf(result), 'activate');
    expect(request).toHaveBeenCalledTimes(1);
    expect(announce).toHaveBeenLastCalledWith('b2, empty');

    await accessibilityAction(rootOf(result), 'move-cursor-left');
    await accessibilityAction(rootOf(result), 'activate');
    await accessibilityAction(rootOf(result), 'cancel-move');
    expect(announce).toHaveBeenLastCalledWith('a2, white pawn');

    const announceCount = announce.mock.calls.length;
    const cancelPending = jest.fn(() => {
      AccessibilityInfo.announceForAccessibility('Move cancelled.');
      return true;
    });
    await result.rerender(
      <MoveAccessibilityHarness
        interaction={moveInteraction({
          cancel: cancelPending,
          lifecycle: decidingAccessibilityMove(),
          request,
        })}
        model={model}
      />,
    );
    await accessibilityAction(rootOf(result), 'cancel-move');
    expect(cancelPending).toHaveBeenCalledTimes(1);
    expect(announce).toHaveBeenCalledTimes(announceCount + 1);
    expect(announce).toHaveBeenLastCalledWith('Move cancelled.');
  });

  it('[CBN-CONTRACT-018-NONDRAG-ALTERNATIVE] targets a source and requests the same controlled move without mutating position', async () => {
    const inputPosition = Object.freeze({
      a2: Object.freeze({ id: 'pawn', pieceType: 'wP' }),
    });
    const request = jest.fn<boolean, [Omit<MoveIntent, 'intentId'>]>(
      () => true,
    );
    const model = accessibilityModel({
      position: inputPosition,
      revision: 1,
    });
    const result = await render(
      <MoveAccessibilityHarness
        interaction={moveInteraction({ request })}
        model={model}
      />,
    );

    expect(actionNames(rootOf(result))).toEqual([
      ...(Platform.OS === 'android' ? ['increment'] : []),
      'move-cursor-right',
      'move-cursor-down',
      'activate',
      'remove-piece',
    ]);
    expect(actionLabels(rootOf(result))).toEqual([
      'Move cursor right',
      'Move cursor down',
      'Activate square',
      'Remove piece',
    ]);

    await accessibilityAction(rootOf(result), 'activate');
    expect(request).not.toHaveBeenCalled();
    expect(rootOf(result).props['accessibilityValue']).toEqual(
      expect.objectContaining({
        now: 0,
        text: 'a2, white pawn; pending move source',
      }),
    );
    expect(actionNames(rootOf(result))).toContain('cancel-move');

    await accessibilityAction(rootOf(result), 'move-cursor-right');
    expect(rootOf(result).props['accessibilityValue']).toEqual(
      expect.objectContaining({
        now: 1,
        text: 'b2, empty; pending move target',
      }),
    );
    await accessibilityAction(rootOf(result), 'activate');

    expect(request).toHaveBeenCalledTimes(1);
    expect(request).toHaveBeenCalledWith({
      basePositionRevision: 1,
      boardId: 'accessible-move-board',
      input: 'accessibility',
      piece: { id: 'pawn', pieceType: 'wP' },
      source: { kind: 'board', square: 'a2' },
      targetSquare: 'b2',
    });
    expect(request.mock.calls[0]?.[0]).not.toHaveProperty('intentId');
    expect(inputPosition).toEqual({
      a2: { id: 'pawn', pieceType: 'wP' },
    });
    expect(model.position?.value).toEqual({
      a2: { id: 'pawn', pieceType: 'wP' },
    });
    expect(rootOf(result).props['accessibilityValue']).toEqual(
      expect.objectContaining({ text: 'b2, empty' }),
    );
  });

  it('requests an off-board null target through remove-piece', async () => {
    const request = jest.fn<boolean, [Omit<MoveIntent, 'intentId'>]>(
      () => true,
    );
    const result = await render(
      <MoveAccessibilityHarness
        interaction={moveInteraction({ request })}
        model={accessibilityModel({
          position: { a2: { id: 'pawn', pieceType: 'wP' } },
          revision: 4,
        })}
      />,
    );

    await accessibilityAction(rootOf(result), 'remove-piece');

    expect(request).toHaveBeenCalledTimes(1);
    expect(request).toHaveBeenCalledWith(
      expect.objectContaining({
        basePositionRevision: 4,
        input: 'accessibility',
        source: { kind: 'board', square: 'a2' },
        targetSquare: null,
      }),
    );
  });

  it('clears local targeting and delegates cancellation of a pending runtime', async () => {
    const cancel = jest.fn(() => true);
    const request = jest.fn(() => true);
    const model = accessibilityModel({
      position: { a2: { id: 'pawn', pieceType: 'wP' } },
      revision: 1,
    });
    const result = await render(
      <MoveAccessibilityHarness
        interaction={moveInteraction({ cancel, request })}
        model={model}
      />,
    );

    await accessibilityAction(rootOf(result), 'activate');
    await accessibilityAction(rootOf(result), 'cancel-move');
    expect(cancel).toHaveBeenCalledTimes(1);
    expect(request).not.toHaveBeenCalled();
    expect(rootOf(result).props['accessibilityValue']).toEqual(
      expect.objectContaining({ text: 'a2, white pawn' }),
    );
    expect(actionNames(rootOf(result))).not.toContain('cancel-move');

    await result.rerender(
      <MoveAccessibilityHarness
        interaction={moveInteraction({
          cancel,
          lifecycle: decidingAccessibilityMove(),
          request,
        })}
        model={model}
      />,
    );
    expect(rootOf(result).props['accessibilityValue']).toEqual(
      expect.objectContaining({
        text: 'a2, white pawn; pending move source',
      }),
    );
    expect(actionNames(rootOf(result))).toContain('cancel-move');
    expect(actionNames(rootOf(result))).not.toContain('activate');

    await accessibilityAction(rootOf(result), 'move-cursor-right');
    expect(rootOf(result).props['accessibilityValue']).toEqual(
      expect.objectContaining({ text: 'b2, empty; pending move target' }),
    );
    await accessibilityAction(rootOf(result), 'cancel-move');
    expect(cancel).toHaveBeenCalledTimes(2);
  });

  it('clears an accessibility source on orientation, dimensions, controlled revision, piece, and board changes', async () => {
    const request = jest.fn(() => true);
    const first = accessibilityModel({
      position: { a2: { id: 'pawn', pieceType: 'wP' } },
      revision: 1,
    });
    const result = await render(
      <MoveAccessibilityHarness
        interaction={moveInteraction({ request })}
        model={first}
      />,
    );

    await accessibilityAction(rootOf(result), 'activate');
    expect(rootOf(result).props['accessibilityValue']).toEqual(
      expect.objectContaining({
        text: 'a2, white pawn; pending move source',
      }),
    );

    const orientationChanged = accessibilityModel({
      orientation: 'black',
      position: { a2: { id: 'pawn', pieceType: 'wP' } },
      revision: 1,
    });
    await result.rerender(
      <MoveAccessibilityHarness
        interaction={moveInteraction({ request })}
        model={orientationChanged}
      />,
    );
    expect(rootOf(result).props['accessibilityValue']).toEqual(
      expect.objectContaining({ text: 'a2, white pawn' }),
    );
    await accessibilityAction(rootOf(result), 'activate');

    const dimensionsChanged = accessibilityModel({
      dimensions: { columns: 3, rows: 2 },
      orientation: 'black',
      position: { a2: { id: 'pawn', pieceType: 'wP' } },
      revision: 1,
    });
    await result.rerender(
      <MoveAccessibilityHarness
        interaction={moveInteraction({ request })}
        model={dimensionsChanged}
      />,
    );
    expect(rootOf(result).props['accessibilityValue']).toEqual(
      expect.objectContaining({ text: 'a2, white pawn' }),
    );
    await accessibilityAction(rootOf(result), 'activate');

    const revisionChanged = accessibilityModel({
      dimensions: { columns: 3, rows: 2 },
      orientation: 'black',
      position: { a2: { id: 'pawn', pieceType: 'wP' } },
      revision: 2,
    });
    await result.rerender(
      <MoveAccessibilityHarness
        interaction={moveInteraction({ request })}
        model={revisionChanged}
      />,
    );
    expect(rootOf(result).props['accessibilityValue']).toEqual(
      expect.objectContaining({ text: 'a2, white pawn' }),
    );
    await accessibilityAction(rootOf(result), 'activate');

    const pieceChanged = accessibilityModel({
      dimensions: { columns: 3, rows: 2 },
      orientation: 'black',
      position: { a2: { id: 'knight', pieceType: 'bN' } },
      revision: 2,
    });
    await result.rerender(
      <MoveAccessibilityHarness
        interaction={moveInteraction({ request })}
        model={pieceChanged}
      />,
    );
    expect(rootOf(result).props['accessibilityValue']).toEqual(
      expect.objectContaining({ text: 'a2, black knight' }),
    );
    await accessibilityAction(rootOf(result), 'activate');

    await result.rerender(
      <MoveAccessibilityHarness
        interaction={moveInteraction({ request })}
        model={accessibilityModel({
          boardId: 'replacement-board',
          dimensions: { columns: 3, rows: 2 },
          orientation: 'black',
          position: { a2: { id: 'knight', pieceType: 'bN' } },
          revision: 2,
        })}
      />,
    );
    expect(rootOf(result).props['accessibilityValue']).toEqual(
      expect.objectContaining({ text: 'a2, black knight' }),
    );
    expect(request).not.toHaveBeenCalled();
  });

  it('keeps the canonical cursor while current position, selection, and orientation refresh its value', async () => {
    const formatSquareValue = jest.fn(
      (context: {
        square: string;
        piece: Readonly<{ pieceType: string }> | null;
        isSelected: boolean;
        isDestination: boolean;
        isDisabled: boolean;
      }) =>
        [
          context.square,
          context.piece?.pieceType ?? 'empty',
          context.isSelected,
          context.isDestination,
          context.isDisabled,
        ].join(':'),
    );
    const formatActionLabel = jest.fn(
      (context: { action: ChessboardAccessibilityAction; square: string }) =>
        `${context.action} from ${context.square}`,
    );
    const result = await render(
      <Chessboard
        accessibility={{
          boardHint: 'Choose a square.',
          boardLabel: 'Localized analysis board',
          formatActionLabel,
          formatSquareValue,
        }}
        boardId="context-board"
        position={{ e4: { pieceType: 'wN' } }}
        reduceMotion="always"
        selection={{
          destinationSquares: ['e4'],
          disabledSquares: ['e4'],
          selectedSquare: 'e4',
        }}
      />,
    );
    const firstRoot = rootOf(result);

    expect(firstRoot).toHaveProp(
      'accessibilityLabel',
      'Localized analysis board',
    );
    expect(firstRoot).toHaveProp('accessibilityHint', 'Choose a square.');
    expect(firstRoot.props['accessibilityValue']).toEqual(
      expect.objectContaining({ now: 36, text: 'e4:wN:true:true:true' }),
    );
    expect(actionLabels(firstRoot)).toEqual([
      'move-cursor-left from e4',
      'move-cursor-right from e4',
      'move-cursor-up from e4',
      'move-cursor-down from e4',
    ]);

    await result.rerender(
      <Chessboard
        accessibility={{
          boardHint: 'Choose a square.',
          boardLabel: 'Localized analysis board',
          formatActionLabel,
          formatSquareValue,
        }}
        boardId="context-board"
        orientation="black"
        position={{ e4: { pieceType: 'bQ' }, h1: { pieceType: 'wK' } }}
        reduceMotion="never"
        selection={{ destinationSquares: ['h1'], selectedSquare: 'h1' }}
      />,
    );

    expect(rootOf(result)).toBe(firstRoot);
    expect(rootOf(result).props['accessibilityValue']).toEqual(
      expect.objectContaining({ now: 27, text: 'e4:bQ:false:false:false' }),
    );
    expect(formatSquareValue).toHaveBeenLastCalledWith(
      expect.objectContaining({
        boardId: 'context-board',
        orientation: 'black',
        piece: { pieceType: 'bQ' },
        square: 'e4',
      }),
    );
  });

  it('keeps the host and cursor stable across reduced-motion policy changes', async () => {
    const remove = jest.fn();
    const addEventListener = jest
      .spyOn(AccessibilityInfo, 'addEventListener')
      .mockReturnValue({ remove } as never);
    jest
      .spyOn(AccessibilityInfo, 'isReduceMotionEnabled')
      .mockReturnValue(new Promise<boolean>(() => undefined));
    const result = await render(
      <Chessboard
        boardId="motion-policy"
        position="8/8/8/8/8/8/8/8"
        reduceMotion="never"
      />,
    );
    const host = rootOf(result);
    await accessibilityAction(host, 'increment');
    expect(host.props['accessibilityValue']).toEqual(
      expect.objectContaining({ now: 1, text: 'b8, empty' }),
    );

    await result.rerender(
      <Chessboard
        boardId="motion-policy"
        position="8/8/8/8/8/8/8/8"
        reduceMotion="system"
      />,
    );
    expect(rootOf(result)).toBe(host);
    expect(rootOf(result).props['accessibilityValue']).toEqual(
      expect.objectContaining({ now: 1, text: 'b8, empty' }),
    );
    expect(addEventListener).toHaveBeenCalledTimes(1);

    await result.rerender(
      <Chessboard
        boardId="motion-policy"
        position="8/8/8/8/8/8/8/8"
        reduceMotion="always"
      />,
    );
    expect(rootOf(result)).toBe(host);
    expect(rootOf(result).props['accessibilityValue']).toEqual(
      expect.objectContaining({ now: 1, text: 'b8, empty' }),
    );
    expect(remove).toHaveBeenCalledTimes(1);
  });

  it('repairs empty or duplicate custom action labels deterministically', async () => {
    const labels = [
      ' Move cursor right ',
      'Move cursor right',
      '',
      'Move cursor up',
    ];
    const formatActionLabel = jest.fn(() => labels.shift() ?? 'same');
    const result = await render(
      <Chessboard
        accessibility={{ formatActionLabel }}
        boardId="action-labels"
        position={{ e4: { pieceType: 'wP' } }}
        reduceMotion="never"
        selection={{ selectedSquare: 'e4' }}
      />,
    );
    const actions = actionLabels(rootOf(result));

    expect(actions.every((label) => label.trim().length > 0)).toBe(true);
    expect(new Set(actions).size).toBe(actions.length);
    expect(actions).toHaveLength(4);
  });

  it('falls back to the complete default value for an empty custom square value', async () => {
    const result = await render(
      <Chessboard
        accessibility={{ formatSquareValue: () => '   ' }}
        boardId="empty-value"
        position={{ e4: { pieceType: 'wN' } }}
        reduceMotion="never"
        selection={{ destinationSquares: ['e4'], selectedSquare: 'e4' }}
      />,
    );

    expect(rootOf(result).props['accessibilityValue']).toEqual(
      expect.objectContaining({
        now: 36,
        text: 'e4, white knight; selected; possible destination',
      }),
    );
  });

  it('keeps disabled boards discoverable but exposes no actions', async () => {
    const onError = jest.fn<
      undefined,
      [ChessboardError, ChessboardErrorContext]
    >();
    const result = await render(
      <ChessboardRuntime
        boardId="disabled-board"
        development={false}
        onError={onError}
        position="not/fen"
        reduceMotion="never"
      />,
    );
    const root = rootOf(result);

    expect(root).toHaveProp('accessible', true);
    expect(root).toHaveProp('accessibilityRole', 'adjustable');
    expect(root).toHaveProp('accessibilityState', { disabled: true });
    expect(root).toHaveProp('accessibilityActions', []);
    expect(root.props['accessibilityValue']).toEqual(
      expect.objectContaining({ text: 'a8, empty; disabled' }),
    );

    await accessibilityAction(root, 'increment');
    expect(rootOf(result).props['accessibilityValue']).toEqual(
      expect.objectContaining({ now: 0, text: 'a8, empty; disabled' }),
    );
  });

  it('keeps mounted board cursor and announcement histories independent', async () => {
    const announce = jest
      .spyOn(AccessibilityInfo, 'announceForAccessibilityWithOptions')
      .mockImplementation(() => undefined);
    const result = await render(
      <View>
        <Chessboard
          accessibility={{
            announcement: { id: 'shared-id', message: 'Board ready' },
          }}
          boardId="first-cursor"
          dimensions={{ columns: 2, rows: 2 }}
          position={{}}
          reduceMotion="never"
        />
        <Chessboard
          accessibility={{
            announcement: { id: 'shared-id', message: 'Board ready' },
          }}
          boardId="second-cursor"
          dimensions={{ columns: 2, rows: 2 }}
          position={{}}
          reduceMotion="never"
        />
      </View>,
    );
    expect(announce).toHaveBeenCalledTimes(2);
    const boards = rootOf(result).queryAll(
      (node) => node.props['accessibilityRole'] === 'adjustable',
    );
    expect(boards).toHaveLength(2);

    const first = boards[0];
    const second = boards[1];
    if (first === undefined || second === undefined) {
      throw new Error('Expected two accessible board controls.');
    }
    await accessibilityAction(first, 'increment');
    await accessibilityAction(first, 'increment');

    expect(first.props['accessibilityValue']).toEqual(
      expect.objectContaining({ now: 2, text: 'a1, empty' }),
    );
    expect(second.props['accessibilityValue']).toEqual(
      expect.objectContaining({ now: 0, text: 'a2, empty' }),
    );
  });

  it('announces each correlation ID once per mounted board, including Strict Mode replay', async () => {
    const announce = jest
      .spyOn(AccessibilityInfo, 'announceForAccessibilityWithOptions')
      .mockImplementation(() => undefined);
    const first = await render(
      <StrictMode>
        <Chessboard
          accessibility={{
            announcement: { id: 'outcome-1', message: 'Move rejected' },
          }}
          boardId="announcement-board"
          position={{}}
          reduceMotion="never"
        />
      </StrictMode>,
    );
    expect(announce).toHaveBeenCalledTimes(1);
    expect(announce).toHaveBeenLastCalledWith('Move rejected', {
      queue: true,
    });

    await first.rerender(
      <StrictMode>
        <Chessboard
          accessibility={{
            announcement: { id: 'outcome-1', message: 'Changed text' },
          }}
          boardId="announcement-board"
          position={{}}
          reduceMotion="never"
        />
      </StrictMode>,
    );
    expect(announce).toHaveBeenCalledTimes(1);

    await first.rerender(
      <StrictMode>
        <Chessboard
          accessibility={{}}
          boardId="announcement-board"
          position={{}}
          reduceMotion="never"
        />
      </StrictMode>,
    );
    await first.rerender(
      <StrictMode>
        <Chessboard
          accessibility={{
            announcement: { id: 'outcome-1', message: 'Move rejected' },
          }}
          boardId="announcement-board"
          position={{}}
          reduceMotion="never"
        />
      </StrictMode>,
    );
    expect(announce).toHaveBeenCalledTimes(1);

    await first.rerender(
      <StrictMode>
        <Chessboard
          accessibility={{
            announcement: { id: 'outcome-2', message: 'Move rejected' },
          }}
          boardId="announcement-board"
          position={{}}
          reduceMotion="never"
        />
      </StrictMode>,
    );
    expect(announce).toHaveBeenCalledTimes(2);

    await first.unmount();
    await render(
      <Chessboard
        accessibility={{
          announcement: { id: 'outcome-2', message: 'Move rejected' },
        }}
        boardId="announcement-board"
        position={{}}
        reduceMotion="never"
      />,
    );
    expect(announce).toHaveBeenCalledTimes(3);
  });

  it('ignores empty announcement IDs and messages', async () => {
    const announce = jest
      .spyOn(AccessibilityInfo, 'announceForAccessibilityWithOptions')
      .mockImplementation(() => undefined);
    const result = await render(
      <Chessboard
        accessibility={{ announcement: { id: ' ', message: 'Ignored' } }}
        boardId="empty-announcement"
        position={{}}
        reduceMotion="never"
      />,
    );
    await result.rerender(
      <Chessboard
        accessibility={{ announcement: { id: 'valid', message: '   ' } }}
        boardId="empty-announcement"
        position={{}}
        reduceMotion="never"
      />,
    );

    expect(announce).not.toHaveBeenCalled();
  });
});
