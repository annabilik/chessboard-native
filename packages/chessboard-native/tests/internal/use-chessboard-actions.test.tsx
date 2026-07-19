import { render } from '@testing-library/react-native';
import { createRef, type ReactElement, type Ref } from 'react';
import { View } from 'react-native';

import { useChessboardActions } from '../../src/internal/use-chessboard-actions';
import type { ChessboardActions } from '../../src/public-types';

function ActionHarness({
  actionsRef,
  cancelMove,
}: {
  readonly actionsRef: Ref<ChessboardActions> | undefined;
  readonly cancelMove: () => boolean;
}): ReactElement {
  useChessboardActions(actionsRef, cancelMove);
  return <View />;
}

function requiredActions(
  ref: Readonly<{ readonly current: ChessboardActions | null }>,
): Readonly<ChessboardActions> {
  if (ref.current === null) {
    throw new Error('Expected a committed action handle.');
  }
  return ref.current;
}

describe('useChessboardActions', () => {
  it('keeps one handle on an attached ref and reads only the committed action', async () => {
    const actionsRef = createRef<ChessboardActions>();
    const firstCancel = jest.fn(() => true);
    const secondCancel = jest.fn(() => false);
    const result = await render(
      <ActionHarness actionsRef={actionsRef} cancelMove={firstCancel} />,
    );
    const actions = requiredActions(actionsRef);

    expect(Object.isFrozen(actions)).toBe(true);
    expect(actions.cancelMove()).toBe(true);
    expect(firstCancel).toHaveBeenCalledTimes(1);

    await result.rerender(
      <ActionHarness actionsRef={actionsRef} cancelMove={secondCancel} />,
    );

    expect(requiredActions(actionsRef)).toBe(actions);
    expect(actions.cancelMove()).toBe(false);
    expect(firstCancel).toHaveBeenCalledTimes(1);
    expect(secondCancel).toHaveBeenCalledTimes(1);
  });

  it('keeps one handle across ref replacement and revokes it on unmount', async () => {
    const firstRef = createRef<ChessboardActions>();
    const secondRef = createRef<ChessboardActions>();
    const cancel = jest.fn(() => true);
    const result = await render(
      <ActionHarness actionsRef={firstRef} cancelMove={cancel} />,
    );
    const firstHandle = requiredActions(firstRef);

    await result.rerender(
      <ActionHarness actionsRef={secondRef} cancelMove={cancel} />,
    );
    const secondHandle = requiredActions(secondRef);

    expect(firstRef.current).toBeNull();
    expect(secondHandle).toBe(firstHandle);
    expect(firstHandle.cancelMove()).toBe(true);
    expect(secondHandle.cancelMove()).toBe(true);
    expect(cancel).toHaveBeenCalledTimes(2);

    await result.unmount();
    expect(secondRef.current).toBeNull();
    expect(secondHandle.cancelMove()).toBe(false);
    expect(cancel).toHaveBeenCalledTimes(2);
  });

  it('publishes the same handle through callback-ref replacement and revokes it before unmount cleanup', async () => {
    const firstCancel = jest.fn(() => true);
    const secondCancel = jest.fn(() => true);
    const retained: { current: Readonly<ChessboardActions> | null } = {
      current: null,
    };
    const cleanupResults: boolean[] = [];
    const firstRef = (value: ChessboardActions | null): void => {
      if (value === null) {
        cleanupResults.push(retained.current?.cancelMove() ?? false);
      } else {
        retained.current = value;
      }
    };
    const secondRef = (value: ChessboardActions | null): void => {
      if (value === null) {
        cleanupResults.push(retained.current?.cancelMove() ?? false);
      } else {
        expect(value).toBe(retained.current);
      }
    };
    const result = await render(
      <ActionHarness actionsRef={firstRef} cancelMove={firstCancel} />,
    );

    await result.rerender(
      <ActionHarness actionsRef={secondRef} cancelMove={secondCancel} />,
    );
    expect(cleanupResults).toEqual([true]);
    expect(firstCancel).toHaveBeenCalledTimes(1);
    expect(secondCancel).not.toHaveBeenCalled();
    expect(retained.current?.cancelMove()).toBe(true);
    expect(secondCancel).toHaveBeenCalledTimes(1);

    await result.unmount();
    expect(cleanupResults).toEqual([true, false]);
    expect(retained.current?.cancelMove()).toBe(false);
    expect(firstCancel).toHaveBeenCalledTimes(1);
    expect(secondCancel).toHaveBeenCalledTimes(1);
  });
});
