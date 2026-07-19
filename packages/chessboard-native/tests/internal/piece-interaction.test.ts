import {
  createPieceInteractionEmitter,
  type PieceInteractionEmitter,
} from '../../src/internal/piece-interaction';
import type {
  OnPieceDragStart,
  OnPiecePress,
  PieceInteractionContext,
} from '../../src/public-types';

function boardContext(
  options: {
    readonly pieceId?: string;
    readonly revision?: number;
    readonly square?: string;
  } = {},
): PieceInteractionContext {
  return {
    basePositionRevision: options.revision ?? 7,
    boardId: 'analysis',
    piece: {
      ...(options.pieceId === undefined ? {} : { id: options.pieceId }),
      pieceType: 'wN',
    },
    source: { kind: 'board', square: options.square ?? 'b1' },
  };
}

function spareContext(
  options: {
    readonly revision?: number;
    readonly spareId?: string;
  } = {},
): PieceInteractionContext {
  return {
    basePositionRevision: options.revision ?? 9,
    boardId: 'analysis',
    piece: { id: 'palette-queen', pieceType: 'wQ' },
    source: {
      kind: 'spare',
      spareId: options.spareId ?? 'white-queen',
    },
  };
}

function handlers(options: {
  readonly onPieceDragStart?: OnPieceDragStart;
  readonly onPiecePress?: OnPiecePress;
}): Parameters<PieceInteractionEmitter['setHandlers']>[0] {
  return options;
}

describe('piece interaction emitter', () => {
  it('routes press and drag notifications with detached frozen current contexts', () => {
    const emitter = createPieceInteractionEmitter('analysis');
    const presses: Readonly<PieceInteractionContext>[] = [];
    const dragStarts: Readonly<PieceInteractionContext>[] = [];
    emitter.setHandlers(
      handlers({
        onPieceDragStart: (context) => {
          dragStarts.push(context);
        },
        onPiecePress: (context) => {
          presses.push(context);
        },
      }),
    );
    const pressContext = boardContext({ pieceId: 'knight', revision: 3 });
    const dragContext = spareContext({ revision: 4 });

    expect(emitter.emitPress(pressContext)).toBe(true);
    expect(emitter.emitDragStart(dragContext)).toBe(true);

    expect(presses).toEqual([pressContext]);
    expect(dragStarts).toEqual([dragContext]);
    expect(presses[0]).not.toBe(pressContext);
    expect(presses[0]?.piece).not.toBe(pressContext.piece);
    expect(presses[0]?.source).not.toBe(pressContext.source);
    expect(dragStarts[0]).not.toBe(dragContext);
    expect(Object.isFrozen(presses[0])).toBe(true);
    expect(Object.isFrozen(presses[0]?.piece)).toBe(true);
    expect(Object.isFrozen(presses[0]?.source)).toBe(true);
    expect(Object.isFrozen(dragStarts[0])).toBe(true);
    expect(Object.isFrozen(dragStarts[0]?.piece)).toBe(true);
    expect(Object.isFrozen(dragStarts[0]?.source)).toBe(true);

    expect(emitter.emitPress(boardContext({ revision: 5, square: 'c3' }))).toBe(
      true,
    );
    expect(presses[1]).toEqual(
      expect.objectContaining({
        basePositionRevision: 5,
        source: { kind: 'board', square: 'c3' },
      }),
    );
    expect(presses).toHaveLength(2);
    expect(dragStarts).toHaveLength(1);
  });

  it('ignores callback return values and isolates callback exceptions', () => {
    const emitter = createPieceInteractionEmitter('analysis');
    const press = jest.fn(() => 'consumer-result');
    const dragStart = jest.fn(() => {
      throw new Error('consumer failed');
    });
    emitter.setHandlers({ onPieceDragStart: dragStart, onPiecePress: press });

    expect(emitter.emitPress(boardContext())).toBe(true);
    expect(() => emitter.emitDragStart(spareContext())).not.toThrow();
    expect(emitter.emitDragStart(spareContext())).toBe(true);
    expect(press).toHaveBeenCalledTimes(1);
    expect(dragStart).toHaveBeenCalledTimes(2);
  });

  it('uses replacement handlers, clears omitted handlers, and stays inert after disposal', () => {
    const emitter = createPieceInteractionEmitter('analysis');
    const firstPress = jest.fn();
    const replacementPress = jest.fn();
    const dragStart = jest.fn();

    expect(emitter.emitPress(boardContext())).toBe(false);
    expect(emitter.emitDragStart(boardContext())).toBe(false);

    emitter.setHandlers({
      onPieceDragStart: dragStart,
      onPiecePress: firstPress,
    });
    expect(emitter.emitPress(boardContext({ revision: 1 }))).toBe(true);

    emitter.setHandlers({ onPiecePress: replacementPress });
    expect(emitter.emitPress(boardContext({ revision: 2 }))).toBe(true);
    expect(emitter.emitDragStart(boardContext({ revision: 2 }))).toBe(false);
    expect(firstPress).toHaveBeenCalledTimes(1);
    expect(replacementPress).toHaveBeenCalledTimes(1);
    expect(dragStart).not.toHaveBeenCalled();

    emitter.dispose();
    emitter.setHandlers({
      onPieceDragStart: dragStart,
      onPiecePress: firstPress,
    });
    expect(emitter.emitPress(boardContext({ revision: 3 }))).toBe(false);
    expect(emitter.emitDragStart(boardContext({ revision: 3 }))).toBe(false);
    expect(firstPress).toHaveBeenCalledTimes(1);
    expect(replacementPress).toHaveBeenCalledTimes(1);
    expect(dragStart).not.toHaveBeenCalled();
  });

  it('rejects a context for another board before invoking either handler', () => {
    const emitter = createPieceInteractionEmitter('analysis');
    const onPieceDragStart = jest.fn();
    const onPiecePress = jest.fn();
    emitter.setHandlers({ onPieceDragStart, onPiecePress });
    const foreign = { ...boardContext(), boardId: 'variation' };

    expect(emitter.emitPress(foreign)).toBe(false);
    expect(emitter.emitDragStart(foreign)).toBe(false);
    expect(onPiecePress).not.toHaveBeenCalled();
    expect(onPieceDragStart).not.toHaveBeenCalled();
  });
});
