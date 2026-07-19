import { useCallback, useLayoutEffect, useMemo, useRef, useState } from 'react';

import {
  annotationGestureInteractionStatus,
  annotationToolsEqual,
  createAnnotationGestureAdapterState,
  reduceAnnotationGestureAdapter,
  type AnnotationGestureAdapterReduction,
  type AnnotationGestureAdapterState,
  type AnnotationGestureCandidate,
  type AnnotationGestureCorrelation,
  type AnnotationGestureInput,
  type AnnotationGestureInteractionMode,
  type AnnotationGesturePath,
  type AnnotationGestureSnapshot,
} from './annotation-gesture-adapter';
import type { CorrelatedAnnotationDraft } from './annotation-draft-presentation';
import type { SquareId } from '../public-types';

export interface AnnotationInputRuntime {
  readonly activate: (
    input: AnnotationGestureInput,
    square: SquareId,
    expectation?: Readonly<AnnotationInputExpectation>,
  ) => boolean;
  readonly cancel: (
    correlation?: Readonly<AnnotationGestureCorrelation>,
    expectation?: Readonly<AnnotationInputExpectation>,
  ) => boolean;
  readonly finalize: (
    correlation: Readonly<AnnotationGestureCorrelation>,
    targetSquare: SquareId | null,
  ) => boolean;
  readonly mode: AnnotationGestureInteractionMode;
  readonly presentation: Readonly<CorrelatedAnnotationDraft> | null;
  readonly snapshot: Readonly<AnnotationGestureSnapshot> | null;
  readonly sourceSquare: SquareId | null;
  readonly start: (
    input: AnnotationGestureInput,
    path: Exclude<AnnotationGesturePath, 'explicit'>,
    sourceSquare: SquareId,
    targetSquare: SquareId | null,
  ) => Readonly<AnnotationGestureCorrelation> | null;
  readonly update: (
    correlation: Readonly<AnnotationGestureCorrelation>,
    targetSquare: SquareId | null,
  ) => boolean;
  readonly token: number | null;
}

export interface AnnotationInputExpectation {
  readonly mode: AnnotationGestureInteractionMode;
  readonly snapshot: Readonly<AnnotationGestureSnapshot>;
  readonly sourceSquare: SquareId | null;
  readonly token: number | null;
}

export interface UseAnnotationInputRuntimeOptions {
  readonly onCandidate: (
    candidate: Readonly<AnnotationGestureCandidate>,
  ) => void;
  readonly snapshot: Readonly<AnnotationGestureSnapshot> | null;
}

function stateForSnapshot(
  current: Readonly<AnnotationGestureAdapterState> | null,
  snapshot: Readonly<AnnotationGestureSnapshot> | null,
): Readonly<AnnotationGestureAdapterState> | null {
  if (snapshot === null) {
    return current === null
      ? null
      : reduceAnnotationGestureAdapter(current, {
          snapshot: null,
          type: 'synchronize',
        }).state;
  }
  const base =
    current?.boardId === snapshot.boardId
      ? current
      : createAnnotationGestureAdapterState({ boardId: snapshot.boardId });
  return reduceAnnotationGestureAdapter(base, {
    snapshot,
    type: 'synchronize',
  }).state;
}

function matchesExpectation(
  state: Readonly<AnnotationGestureAdapterState>,
  snapshot: Readonly<AnnotationGestureSnapshot>,
  expectation: Readonly<AnnotationInputExpectation>,
): boolean {
  const status = annotationGestureInteractionStatus(state);
  const expectedSnapshot = expectation.snapshot;
  return (
    status.mode === expectation.mode &&
    status.sourceSquare === expectation.sourceSquare &&
    (state.interaction?.correlation.token ?? null) === expectation.token &&
    snapshot.annotationRevision === expectedSnapshot.annotationRevision &&
    snapshot.boardId === expectedSnapshot.boardId &&
    snapshot.geometryEpoch === expectedSnapshot.geometryEpoch &&
    snapshot.positionRevision === expectedSnapshot.positionRevision &&
    snapshot.providerGeometryRevision ===
      expectedSnapshot.providerGeometryRevision &&
    snapshot.providerLifecycleRevision ===
      expectedSnapshot.providerLifecycleRevision &&
    annotationToolsEqual(snapshot.tool, expectedSnapshot.tool)
  );
}

/** One board-scoped transient annotation session shared by every input mode. */
export function useAnnotationInputRuntime({
  onCandidate,
  snapshot,
}: Readonly<UseAnnotationInputRuntimeOptions>): Readonly<AnnotationInputRuntime> {
  const [renderState, setRenderState] =
    useState<Readonly<AnnotationGestureAdapterState> | null>(null);
  const projectedState = useMemo(
    () => stateForSnapshot(renderState, snapshot),
    [renderState, snapshot],
  );
  const stateAtCommit = useRef<Readonly<AnnotationGestureAdapterState> | null>(
    null,
  );
  const snapshotAtCommit = useRef<Readonly<AnnotationGestureSnapshot> | null>(
    null,
  );
  const onCandidateAtCommit = useRef(onCandidate);
  const acceptingInput = useRef(false);
  const nextToken = useRef<number | null>(0);

  const applyReduction = useCallback(
    (reduction: Readonly<AnnotationGestureAdapterReduction>): boolean => {
      const current = stateAtCommit.current;
      if (!acceptingInput.current || current === null) {
        return false;
      }
      const handled =
        reduction.state !== current || reduction.candidate !== null;
      stateAtCommit.current = reduction.state;
      if (reduction.state !== current) {
        setRenderState(reduction.state);
      }
      if (reduction.candidate !== null) {
        onCandidateAtCommit.current(reduction.candidate);
      }
      return handled;
    },
    [],
  );

  const allocateCorrelation =
    useCallback((): Readonly<AnnotationGestureCorrelation> | null => {
      const currentSnapshot = snapshotAtCommit.current;
      const token = nextToken.current;
      if (currentSnapshot === null || token === null) {
        return null;
      }
      nextToken.current = token === Number.MAX_SAFE_INTEGER ? null : token + 1;
      return Object.freeze({
        annotationRevision: currentSnapshot.annotationRevision,
        boardId: currentSnapshot.boardId,
        geometryEpoch: currentSnapshot.geometryEpoch,
        positionRevision: currentSnapshot.positionRevision,
        providerGeometryRevision: currentSnapshot.providerGeometryRevision,
        providerLifecycleRevision: currentSnapshot.providerLifecycleRevision,
        token,
      });
    }, []);

  const activate = useCallback<AnnotationInputRuntime['activate']>(
    (input, square, expectation): boolean => {
      const current = stateAtCommit.current;
      const currentSnapshot = snapshotAtCommit.current;
      if (current === null || currentSnapshot === null) {
        return false;
      }
      if (
        expectation !== undefined &&
        !matchesExpectation(current, currentSnapshot, expectation)
      ) {
        return false;
      }
      const correlation = allocateCorrelation();
      if (correlation === null) {
        return false;
      }
      return applyReduction(
        reduceAnnotationGestureAdapter(current, {
          correlation,
          input,
          snapshot: currentSnapshot,
          square,
          type: 'activate',
        }),
      );
    },
    [allocateCorrelation, applyReduction],
  );

  const start = useCallback<AnnotationInputRuntime['start']>(
    (input, path, sourceSquare, targetSquare) => {
      const current = stateAtCommit.current;
      const currentSnapshot = snapshotAtCommit.current;
      const correlation = allocateCorrelation();
      if (
        current === null ||
        currentSnapshot === null ||
        correlation === null
      ) {
        return null;
      }
      const reduction = reduceAnnotationGestureAdapter(current, {
        correlation,
        input,
        path,
        snapshot: currentSnapshot,
        sourceSquare,
        targetSquare,
        type: 'start',
      });
      return applyReduction(reduction) ? correlation : null;
    },
    [allocateCorrelation, applyReduction],
  );

  const update = useCallback<AnnotationInputRuntime['update']>(
    (correlation, targetSquare): boolean => {
      const current = stateAtCommit.current;
      return current !== null
        ? applyReduction(
            reduceAnnotationGestureAdapter(current, {
              correlation,
              targetSquare,
              type: 'update',
            }),
          )
        : false;
    },
    [applyReduction],
  );

  const finalize = useCallback<AnnotationInputRuntime['finalize']>(
    (correlation, targetSquare): boolean => {
      const current = stateAtCommit.current;
      const currentSnapshot = snapshotAtCommit.current;
      return current !== null && currentSnapshot !== null
        ? applyReduction(
            reduceAnnotationGestureAdapter(current, {
              correlation,
              snapshot: currentSnapshot,
              targetSquare,
              type: 'finalize',
            }),
          )
        : false;
    },
    [applyReduction],
  );

  const cancel = useCallback<AnnotationInputRuntime['cancel']>(
    (correlation, expectation): boolean => {
      const current = stateAtCommit.current;
      const currentSnapshot = snapshotAtCommit.current;
      if (current === null || currentSnapshot === null) {
        return false;
      }
      if (
        expectation !== undefined &&
        !matchesExpectation(current, currentSnapshot, expectation)
      ) {
        return false;
      }
      return applyReduction(
        reduceAnnotationGestureAdapter(current, {
          ...(correlation === undefined ? {} : { correlation }),
          type: 'cancel',
        }),
      );
    },
    [applyReduction],
  );

  useLayoutEffect(() => {
    onCandidateAtCommit.current = onCandidate;
    snapshotAtCommit.current = snapshot;
    stateAtCommit.current = projectedState;
    if (renderState !== projectedState) {
      setRenderState(projectedState);
    }
  }, [onCandidate, projectedState, renderState, snapshot]);

  useLayoutEffect(() => {
    acceptingInput.current = true;
    return () => {
      acceptingInput.current = false;
      snapshotAtCommit.current = null;
      stateAtCommit.current = null;
    };
  }, []);

  const status =
    projectedState === null
      ? Object.freeze({ mode: 'idle' as const, sourceSquare: null })
      : annotationGestureInteractionStatus(projectedState);
  const token = projectedState?.interaction?.correlation.token ?? null;

  return useMemo(
    () =>
      Object.freeze({
        activate,
        cancel,
        finalize,
        mode: status.mode,
        presentation: projectedState?.presentation ?? null,
        snapshot,
        sourceSquare: status.sourceSquare,
        start,
        token,
        update,
      }),
    [
      activate,
      cancel,
      finalize,
      projectedState?.presentation,
      snapshot,
      start,
      status.mode,
      status.sourceSquare,
      token,
      update,
    ],
  );
}
