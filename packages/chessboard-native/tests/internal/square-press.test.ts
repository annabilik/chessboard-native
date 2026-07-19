import {
  createSquarePressContext,
  emitSquarePress,
} from '../../src/internal/square-press';
import type { SquarePressContext } from '../../src/public-types';

describe('square press callbacks', () => {
  it('detaches and freezes occupied and empty current-position contexts', () => {
    const piece = Object.freeze({ id: 'white-knight', pieceType: 'wN' });
    const occupied = createSquarePressContext({
      basePositionRevision: 7,
      boardId: 'analysis',
      piece,
      square: 'b1',
    });
    const empty = createSquarePressContext({
      basePositionRevision: 8,
      boardId: 'analysis',
      piece: null,
      square: 'c3',
    });

    expect(occupied).toEqual({
      basePositionRevision: 7,
      boardId: 'analysis',
      piece,
      square: 'b1',
    });
    expect(occupied.piece).not.toBe(piece);
    expect(Object.isFrozen(occupied)).toBe(true);
    expect(Object.isFrozen(occupied.piece)).toBe(true);
    expect(empty).toEqual({
      basePositionRevision: 8,
      boardId: 'analysis',
      piece: null,
      square: 'c3',
    });
    expect(Object.isFrozen(empty)).toBe(true);
  });

  it('freshly detaches each delivery, ignores results, and isolates exceptions', () => {
    const context: SquarePressContext = {
      basePositionRevision: 5,
      boardId: 'analysis',
      piece: { id: 'pawn', pieceType: 'wP' },
      square: 'a2',
    };
    const deliveries: Readonly<SquarePressContext>[] = [];

    expect(
      emitSquarePress((value) => {
        deliveries.push(value);
        return 'ignored';
      }, context),
    ).toBe(true);
    expect(deliveries).toHaveLength(1);
    expect(deliveries[0]).not.toBe(context);
    expect(deliveries[0]?.piece).not.toBe(context.piece);
    expect(Object.isFrozen(deliveries[0])).toBe(true);
    expect(Object.isFrozen(deliveries[0]?.piece)).toBe(true);
    expect(() =>
      emitSquarePress(() => {
        throw new Error('consumer failed');
      }, context),
    ).not.toThrow();
    expect(emitSquarePress(undefined, context)).toBe(false);
  });
});
