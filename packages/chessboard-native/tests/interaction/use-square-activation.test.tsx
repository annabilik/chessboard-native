import { act, render } from '@testing-library/react-native';
import {
  startTransition,
  StrictMode,
  Suspense,
  useLayoutEffect,
  useState,
  type ReactElement,
} from 'react';
import { View } from 'react-native';

import type { SquareActivationIntent } from '../../src/public-types';
import type { SquareActivationRequest } from '../../src/internal/square-activation';
import {
  useSquareActivation,
  type SquareActivationInteraction,
} from '../../src/internal/use-square-activation';

const REQUEST: Readonly<SquareActivationRequest> = Object.freeze({
  action: 'activate',
  basePositionRevision: 3,
  baseSelectionRevision: 2,
  boardId: 'hook-board',
  input: 'touch',
  isDestination: false,
  piece: null,
  selectedSquare: null,
  square: 'a1',
});

function EmitterHarness({
  boardId = 'hook-board',
  onCommit,
  onSquareActivate,
}: {
  readonly boardId?: string;
  readonly onCommit: (interaction: SquareActivationInteraction) => void;
  readonly onSquareActivate?: (intent: SquareActivationIntent) => void;
}): null {
  const interaction = useSquareActivation({
    boardId,
    onSquareActivate,
  });
  useLayoutEffect(() => {
    onCommit(interaction);
  }, [interaction, onCommit]);
  return null;
}

describe('useSquareActivation', () => {
  it('installs and replaces callbacks only after commit without replacing its emitter', async () => {
    const first: SquareActivationIntent[] = [];
    const second: SquareActivationIntent[] = [];
    let interaction: SquareActivationInteraction | undefined;
    const onCommit = (value: SquareActivationInteraction): void => {
      interaction = value;
    };
    const result = await render(
      <EmitterHarness
        onCommit={onCommit}
        onSquareActivate={(intent) => first.push(intent)}
      />,
    );
    const firstInteraction = interaction;
    expect(firstInteraction?.emit(REQUEST)).not.toBeNull();

    await result.rerender(
      <EmitterHarness
        onCommit={onCommit}
        onSquareActivate={(intent) => second.push(intent)}
      />,
    );
    expect(interaction).toBe(firstInteraction);
    expect(interaction?.emit(REQUEST)).not.toBeNull();

    expect(first).toHaveLength(1);
    expect(second).toHaveLength(1);
    expect(second[0]?.intentId).not.toBe(first[0]?.intentId);
  });

  it('keeps the committed callback through an abandoned concurrent render', async () => {
    interface HarnessState {
      readonly mode: 'committed' | 'suspended';
      readonly version: number;
    }

    const committed: SquareActivationIntent[] = [];
    const abandoned: SquareActivationIntent[] = [];
    const never = new Promise<never>(() => undefined);
    let interaction: SquareActivationInteraction | undefined;
    let updateHarness: ((next: HarnessState) => void) | undefined;

    function SuspendForever(): ReactElement {
      // eslint-disable-next-line @typescript-eslint/only-throw-error -- React Suspense uses thrown thenables as its render protocol.
      throw never;
    }

    function ConcurrentHarness(): ReactElement {
      const [state, setState] = useState<HarnessState>({
        mode: 'committed',
        version: 0,
      });
      updateHarness = setState;
      const shouldSuspend = state.mode === 'suspended';
      return (
        <Suspense fallback={<View testID="activation-fallback" />}>
          <EmitterHarness
            boardId="hook-board"
            onCommit={(value) => {
              interaction = value;
            }}
            onSquareActivate={(intent) =>
              (shouldSuspend ? abandoned : committed).push(intent)
            }
          />
          {shouldSuspend ? <SuspendForever /> : null}
        </Suspense>
      );
    }

    const result = await render(<ConcurrentHarness />);
    expect(interaction?.emit(REQUEST)).not.toBeNull();

    const update = updateHarness;
    if (update === undefined) {
      throw new Error('Expected the concurrent harness state setter.');
    }
    await act(() => {
      startTransition(() => {
        update({ mode: 'suspended', version: 1 });
      });
    });
    expect(result.queryByTestId('activation-fallback')).toBeNull();
    expect(interaction?.emit(REQUEST)).not.toBeNull();

    await act(() => {
      update({ mode: 'committed', version: 2 });
    });
    expect(interaction?.emit(REQUEST)).not.toBeNull();

    expect(committed).toHaveLength(3);
    expect(abandoned).toEqual([]);
    expect(new Set(committed.map(({ intentId }) => intentId)).size).toBe(3);
  });

  it('survives Strict Mode replay and disables the captured emitter after unmount', async () => {
    const intents: SquareActivationIntent[] = [];
    let interaction: SquareActivationInteraction | undefined;
    const result = await render(
      <StrictMode>
        <EmitterHarness
          onCommit={(value) => {
            interaction = value;
          }}
          onSquareActivate={(intent) => intents.push(intent)}
        />
      </StrictMode>,
    );
    const committedInteraction = interaction;
    expect(committedInteraction?.emit(REQUEST)).not.toBeNull();
    expect(intents).toHaveLength(1);

    await result.unmount();
    await act(async () => {
      await Promise.resolve();
    });
    expect(committedInteraction?.emit(REQUEST)).toBeNull();
    expect(intents).toHaveLength(1);
  });

  it('returns an inert interaction without a normalized board identity', async () => {
    let interaction: SquareActivationInteraction | undefined;
    await render(
      <EmitterHarness
        boardId="hook-board"
        onCommit={(value) => {
          interaction = value;
        }}
      />,
    );
    expect(interaction?.emit(REQUEST)).toBeNull();
  });
});
