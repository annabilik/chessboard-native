import { act, render } from '@testing-library/react-native';
import {
  startTransition,
  StrictMode,
  Suspense,
  useState,
  type Dispatch,
  type SetStateAction,
} from 'react';

import {
  Chessboard,
  type ChessboardError,
  type ChessboardErrorContext,
} from '../../src/index';
import { ChessboardRuntime } from '../../src/Chessboard';

describe('Chessboard controlled boundary', () => {
  it('renders one decorative layout frame for valid controlled input', async () => {
    const result = await render(
      <Chessboard boardId="diagram" position="8/8/8/8/8/8/8/8" />,
    );

    expect(result.container.children).toHaveLength(1);
    expect(result.root).not.toBeNull();
    expect(result.root).toHaveProp('accessibilityElementsHidden', true);
    expect(result.root).toHaveProp('accessibilityState', { disabled: false });
    expect(result.root).toHaveProp('accessible', false);
    expect(result.root).toHaveProp(
      'importantForAccessibility',
      'no-hide-descendants',
    );
    expect(result.root).toHaveProp('pointerEvents', 'none');
    expect(result.root).toHaveStyle({ aspectRatio: 1, width: '100%' });
  });

  it('reports an invalid production render once across Strict Mode replay, rerenders, and handler changes', async () => {
    const firstHandler = jest.fn<
      undefined,
      [ChessboardError, ChessboardErrorContext]
    >();
    const secondHandler = jest.fn<
      undefined,
      [ChessboardError, ChessboardErrorContext]
    >();
    const result = await render(
      <StrictMode>
        <ChessboardRuntime
          boardId="analysis"
          development={false}
          onError={firstHandler}
          position={{ revision: 1, value: 'not/fen' }}
        />
      </StrictMode>,
    );

    expect(firstHandler).toHaveBeenCalledTimes(1);
    expect(firstHandler.mock.calls[0]?.[0]).toEqual(
      expect.objectContaining({
        code: 'INVALID_FEN',
        domain: 'position',
        revision: 1,
      }),
    );
    expect(result.root).toHaveProp('accessibilityState', { disabled: true });

    await result.rerender(
      <StrictMode>
        <ChessboardRuntime
          boardId="analysis"
          development={false}
          onError={secondHandler}
          position={{ revision: 1, value: 'still/not/fen' }}
        />
      </StrictMode>,
    );
    expect(firstHandler).toHaveBeenCalledTimes(1);
    expect(secondHandler).not.toHaveBeenCalled();

    await result.rerender(
      <StrictMode>
        <ChessboardRuntime
          boardId="analysis"
          development={false}
          onError={secondHandler}
          position={{ revision: 2, value: 'still/not/fen' }}
        />
      </StrictMode>,
    );
    expect(secondHandler).toHaveBeenCalledTimes(1);
    expect(secondHandler.mock.calls[0]?.[0].revision).toBe(2);
  });

  it('logs once after commit when no production handler exists', async () => {
    const logError = jest.fn<undefined, [ChessboardError]>();
    const result = await render(
      <ChessboardRuntime
        boardId="analysis"
        development={false}
        logError={logError}
        position="not/fen"
      />,
    );
    expect(logError).toHaveBeenCalledTimes(1);

    await result.rerender(
      <ChessboardRuntime
        boardId="analysis"
        development={false}
        logError={logError}
        position="still/not/fen"
      />,
    );
    expect(logError).toHaveBeenCalledTimes(1);
  });

  it('enforces mounted tier stability through the public component runtime', async () => {
    const onError = jest.fn<
      undefined,
      [ChessboardError, ChessboardErrorContext]
    >();
    const result = await render(
      <ChessboardRuntime
        boardId="analysis"
        development={false}
        onError={onError}
        position={{ e4: { pieceType: 'wP' } }}
      />,
    );

    await result.rerender(
      <ChessboardRuntime
        boardId="analysis"
        development={false}
        onError={onError}
        position={{ revision: 1, value: { e4: { pieceType: 'wP' } } }}
      />,
    );
    expect(onError).toHaveBeenCalledTimes(1);
    expect(onError.mock.calls[0]?.[0].code).toBe(
      'POSITION_CONTROL_TIER_CHANGED',
    );
    expect(result.root).toHaveProp('accessibilityState', { disabled: true });
  });

  it('resets report and tier lifetimes after unmount', async () => {
    const onError = jest.fn<
      undefined,
      [ChessboardError, ChessboardErrorContext]
    >();
    const first = await render(
      <ChessboardRuntime
        boardId="analysis"
        development={false}
        onError={onError}
        position={{ revision: 2, value: 'not/fen' }}
      />,
    );
    expect(onError).toHaveBeenCalledTimes(1);
    await first.unmount();

    const second = await render(
      <ChessboardRuntime
        boardId="analysis"
        development={false}
        onError={onError}
        position="not/fen"
      />,
    );
    expect(onError).toHaveBeenCalledTimes(2);
    await second.unmount();
  });

  it('does not commit correlation metadata from an abandoned concurrent render', async () => {
    type Scenario = 'initial' | 'suspended' | 'urgent' | 'invalid';
    const never = new Promise<never>(() => undefined);
    const onError = jest.fn<
      undefined,
      [ChessboardError, ChessboardErrorContext]
    >();
    let updateScenario: Dispatch<SetStateAction<Scenario>> = () => {
      throw new Error('Concurrent harness did not render.');
    };

    function SuspendAfterBoard({ scenario }: { scenario: Scenario }) {
      if (scenario === 'suspended') {
        // React Suspense uses thrown thenables to abandon this candidate.
        // eslint-disable-next-line @typescript-eslint/only-throw-error
        throw never;
      }
      return null;
    }

    function ConcurrentHarness() {
      const [scenario, setScenario] = useState<Scenario>('initial');
      updateScenario = setScenario;
      const position =
        scenario === 'initial'
          ? {}
          : scenario === 'suspended'
            ? { a1: { pieceType: 'wR' } }
            : scenario === 'urgent'
              ? { b1: { pieceType: 'wN' } }
              : 'not/fen';

      return (
        <Suspense fallback={null}>
          <ChessboardRuntime
            boardId="concurrent"
            development={false}
            onError={onError}
            position={position}
          />
          <SuspendAfterBoard scenario={scenario} />
        </Suspense>
      );
    }

    await render(<ConcurrentHarness />);
    const setScenario: Dispatch<SetStateAction<Scenario>> = updateScenario;

    await act(() => {
      startTransition(() => {
        setScenario('suspended');
      });
    });
    await act(() => {
      setScenario('urgent');
    });
    await act(() => {
      setScenario('invalid');
    });

    expect(onError).toHaveBeenCalledTimes(1);
    expect(onError.mock.calls[0]?.[0]).toEqual(
      expect.objectContaining({ code: 'INVALID_FEN', revision: 2 }),
    );
  });

  it('throws typed errors during development without reporting them', async () => {
    const onError = jest.fn<
      undefined,
      [ChessboardError, ChessboardErrorContext]
    >();

    await expect(
      render(
        <ChessboardRuntime
          boardId="analysis"
          development
          onError={onError}
          position="not/fen"
        />,
      ),
    ).rejects.toEqual(
      expect.objectContaining({ code: 'INVALID_FEN', name: 'ChessboardError' }),
    );
    expect(onError).not.toHaveBeenCalled();
  });
});
