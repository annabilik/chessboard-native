import { useCallback, useLayoutEffect, useMemo } from 'react';

import type { OnAnnotationOperation } from '../public-types';
import {
  createAnnotationOperationEmitter,
  type AnnotationOperationEmitter,
  type AnnotationOperationRequest,
} from './annotation-operation';

export interface UseAnnotationOperationOptions {
  readonly boardId: string | null;
  readonly onAnnotationOperation: OnAnnotationOperation | undefined;
}

export interface AnnotationOperationInteraction {
  readonly emit: (
    request: Readonly<AnnotationOperationRequest>,
  ) => string | null;
}

/** Bind committed callback props to one board-scoped annotation emitter. */
export function useAnnotationOperation({
  boardId,
  onAnnotationOperation,
}: Readonly<UseAnnotationOperationOptions>): Readonly<AnnotationOperationInteraction> {
  const emitter = useMemo<AnnotationOperationEmitter | null>(() => {
    if (boardId === null) {
      return null;
    }
    return createAnnotationOperationEmitter({ boardId });
  }, [boardId]);

  useLayoutEffect(() => {
    if (emitter === null) {
      return;
    }
    emitter.setHandler(onAnnotationOperation);

    return () => {
      emitter.setHandler(undefined);
    };
  }, [emitter, onAnnotationOperation]);

  const emit = useCallback(
    (request: Readonly<AnnotationOperationRequest>): string | null =>
      emitter?.emit(request) ?? null,
    [emitter],
  );

  return useMemo(() => Object.freeze({ emit }), [emit]);
}
