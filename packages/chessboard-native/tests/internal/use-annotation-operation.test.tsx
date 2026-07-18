import { act, render } from '@testing-library/react-native';
import {
  StrictMode,
  Suspense,
  useLayoutEffect,
  useState,
  type ReactElement,
} from 'react';
import { View } from 'react-native';

import type { AnnotationOperation } from '../../src/public-types';
import type { AnnotationOperationRequest } from '../../src/internal/annotation-operation';
import {
  useAnnotationOperation,
  type AnnotationOperationInteraction,
} from '../../src/internal/use-annotation-operation';

const REQUEST: Readonly<AnnotationOperationRequest> = Object.freeze({
  annotationIdsAtBase: Object.freeze(['one']),
  baseAnnotationRevision: 2,
  input: 'touch',
  reason: 'board-press',
  type: 'clear',
});

function Harness({
  boardId = 'hook-board',
  onAnnotationOperation,
  onCommit,
}: {
  readonly boardId?: string | null;
  readonly onAnnotationOperation?: (
    operation: Readonly<AnnotationOperation>,
  ) => void;
  readonly onCommit: (interaction: AnnotationOperationInteraction) => void;
}): null {
  const interaction = useAnnotationOperation({
    boardId,
    onAnnotationOperation,
  });
  useLayoutEffect(() => {
    onCommit(interaction);
  }, [interaction, onCommit]);
  return null;
}

describe('useAnnotationOperation', () => {
  it('keeps one emitter while routing through the latest committed callback', async () => {
    const first: Readonly<AnnotationOperation>[] = [];
    const second: Readonly<AnnotationOperation>[] = [];
    let interaction: AnnotationOperationInteraction | undefined;
    const onCommit = (value: AnnotationOperationInteraction): void => {
      interaction = value;
    };
    const result = await render(
      <Harness
        onAnnotationOperation={(operation) => first.push(operation)}
        onCommit={onCommit}
      />,
    );
    const initial = interaction;
    expect(initial?.emit(REQUEST)).not.toBeNull();

    await result.rerender(
      <Harness
        onAnnotationOperation={(operation) => second.push(operation)}
        onCommit={onCommit}
      />,
    );
    expect(interaction).toBe(initial);
    expect(interaction?.emit(REQUEST)).not.toBeNull();
    expect(first).toHaveLength(1);
    expect(second).toHaveLength(1);
    expect(second[0]?.operationId).not.toBe(first[0]?.operationId);
  });

  it('survives Strict Mode replay and disables a captured interaction after unmount', async () => {
    const operations: Readonly<AnnotationOperation>[] = [];
    let interaction: AnnotationOperationInteraction | undefined;
    const result = await render(
      <StrictMode>
        <Harness
          onAnnotationOperation={(operation) => operations.push(operation)}
          onCommit={(value) => {
            interaction = value;
          }}
        />
      </StrictMode>,
    );
    const committed = interaction;
    expect(committed?.emit(REQUEST)).not.toBeNull();
    expect(operations).toHaveLength(1);

    await result.unmount();
    await act(async () => {
      await Promise.resolve();
    });
    expect(committed?.emit(REQUEST)).toBeNull();
    expect(operations).toHaveLength(1);
  });

  it('reconnects the same emitter after Suspense hides and reveals committed content', async () => {
    const operations: Readonly<AnnotationOperation>[] = [];
    const never = new Promise<never>(() => undefined);
    let interaction: AnnotationOperationInteraction | undefined;
    let setHidden: ((hidden: boolean) => void) | undefined;

    function SuspendForever(): ReactElement {
      // eslint-disable-next-line @typescript-eslint/only-throw-error -- React Suspense uses thrown thenables as its render protocol.
      throw never;
    }

    function SuspenseHarness(): ReactElement {
      const [hidden, updateHidden] = useState(false);
      setHidden = updateHidden;
      return (
        <Suspense fallback={<View testID="annotation-operation-fallback" />}>
          <Harness
            onAnnotationOperation={(operation) => operations.push(operation)}
            onCommit={(value) => {
              interaction = value;
            }}
          />
          {hidden ? <SuspendForever /> : null}
        </Suspense>
      );
    }

    const result = await render(<SuspenseHarness />);
    const initial = interaction;
    expect(initial?.emit(REQUEST)).not.toBeNull();
    const updateHidden = setHidden;
    if (updateHidden === undefined) {
      throw new Error('Expected the Suspense state setter.');
    }

    await act(() => {
      updateHidden(true);
    });
    expect(result.queryByTestId('annotation-operation-fallback')).toBeTruthy();
    expect(initial?.emit(REQUEST)).toBeNull();

    await act(() => {
      updateHidden(false);
    });
    expect(result.queryByTestId('annotation-operation-fallback')).toBeNull();
    expect(interaction).toBe(initial);
    expect(initial?.emit(REQUEST)).not.toBeNull();
    expect(operations).toHaveLength(2);
  });

  it('is inert without a normalized board identity or committed callback', async () => {
    let interaction: AnnotationOperationInteraction | undefined;
    const result = await render(
      <Harness
        boardId={null}
        onCommit={(value) => {
          interaction = value;
        }}
      />,
    );
    expect(interaction?.emit(REQUEST)).toBeNull();

    await result.rerender(
      <Harness
        onCommit={(value) => {
          interaction = value;
        }}
      />,
    );
    expect(interaction?.emit(REQUEST)).toBeNull();
  });
});
