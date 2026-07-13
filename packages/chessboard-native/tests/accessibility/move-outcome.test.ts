import { AccessibilityInfo } from 'react-native';

import type { MoveOutcomeAccessibilityContext } from '../../src/public-types';
import {
  announceMoveOutcome,
  formatDefaultMoveOutcome,
} from '../../src/accessibility/move-outcome';

const CONTEXT: Readonly<MoveOutcomeAccessibilityContext> = Object.freeze({
  intent: Object.freeze({
    basePositionRevision: 4,
    boardId: 'analysis',
    input: 'accessibility',
    intentId: 'move-5',
    piece: Object.freeze({ pieceType: 'wP' }),
    source: Object.freeze({ kind: 'board', square: 'e2' }),
    targetSquare: 'e4',
  }),
  outcome: 'committed',
});

describe('move outcome accessibility', () => {
  it('formats all terminal outcomes without treating acceptance as a commit', () => {
    expect(formatDefaultMoveOutcome(CONTEXT)).toBe('Move committed.');
    expect(
      formatDefaultMoveOutcome({
        ...CONTEXT,
        outcome: 'rejected',
        reason: 'not permitted',
      }),
    ).toBe('Move rejected: not permitted');
    expect(formatDefaultMoveOutcome({ ...CONTEXT, outcome: 'cancelled' })).toBe(
      'Move cancelled.',
    );
    expect(formatDefaultMoveOutcome({ ...CONTEXT, outcome: 'timed-out' })).toBe(
      'Move request timed out.',
    );
  });

  it('queues custom or fallback output and honors an explicit null', () => {
    const announce = jest
      .spyOn(AccessibilityInfo, 'announceForAccessibilityWithOptions')
      .mockImplementation(() => undefined);

    announceMoveOutcome(CONTEXT, () => '  Custom committed move.  ');
    expect(announce).toHaveBeenLastCalledWith('Custom committed move.', {
      queue: true,
    });

    announceMoveOutcome(CONTEXT, () => '   ');
    expect(announce).toHaveBeenLastCalledWith('Move committed.', {
      queue: true,
    });

    announceMoveOutcome(CONTEXT, () => null);
    expect(announce).toHaveBeenCalledTimes(2);
  });
});
