import type { PieceInteractionContext } from '../../src/public-types';
import {
  canDragCurrentPiece,
  resolveInteractionPermissions,
} from '../../src/internal/interaction-permissions';

const CONTEXT: Readonly<PieceInteractionContext> = Object.freeze({
  basePositionRevision: 3,
  boardId: 'analysis',
  piece: Object.freeze({ pieceType: 'wP' }),
  source: Object.freeze({ kind: 'board', square: 'e2' }),
});

describe('interaction permissions', () => {
  it('[PARITY-BEHAVIOR-B17] requires a move callback and keeps a non-drag alternative with drag', () => {
    const onMoveRequest = jest.fn(() => ({ status: 'accepted' as const }));

    expect(resolveInteractionPermissions(undefined, undefined)).toEqual({
      accessibility: false,
      drag: false,
    });
    expect(resolveInteractionPermissions(onMoveRequest, undefined)).toEqual({
      accessibility: true,
      drag: true,
    });
    expect(
      resolveInteractionPermissions(onMoveRequest, { drag: false }),
    ).toEqual({ accessibility: true, drag: false });
    expect(
      resolveInteractionPermissions(onMoveRequest, { accessibility: false }),
    ).toEqual({ accessibility: false, drag: false });
  });

  it('evaluates the synchronous drag callback fail-closed', () => {
    expect(canDragCurrentPiece(undefined, CONTEXT)).toBe(true);
    expect(canDragCurrentPiece(() => true, CONTEXT)).toBe(true);
    expect(canDragCurrentPiece(() => false, CONTEXT)).toBe(false);
    expect(
      canDragCurrentPiece(() => {
        throw new Error('permission failed');
      }, CONTEXT),
    ).toBe(false);
  });
});
