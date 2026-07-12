import { useEffect, useRef, useState, type ReactElement } from 'react';

import type { ChessboardError, OnChessboardError } from './ChessboardError';
import {
  createBoardModelMetadata,
  prepareBoardModel,
  type NormalizedBoardModel,
} from './internal/board-model';
import {
  createErrorReportMetadata,
  dispatchChessboardErrorReports,
  planChessboardErrorReports,
} from './internal/error-reporting';
import { BoardSurface } from './render/board-surface';
import type {
  AnnotationsProp,
  BoardDimensions,
  BoardOrientation,
  PositionProp,
  SelectionProp,
} from './public-types';

/** Controlled semantic inputs accepted by the native board. @public */
export interface ChessboardProps {
  /** Required stable identity for the mounted board. */
  readonly boardId: string;
  /** The only canonical logical position. */
  readonly position: PositionProp;
  /** Defaults to an 8x8 board. */
  readonly dimensions?: BoardDimensions;
  /** Visual orientation; defaults to white at the bottom. */
  readonly orientation?: BoardOrientation;
  /** Show decorative file and rank labels; defaults to true. */
  readonly showNotation?: boolean;
  /** The only persistent annotation collection when supplied. */
  readonly annotations?: AnnotationsProp;
  /** Consumer-owned selection presentation when supplied. */
  readonly selection?: SelectionProp;
  /** Receives deduplicated production contract errors after commit. */
  readonly onError?: OnChessboardError;
}

interface ChessboardRuntimeProps extends ChessboardProps {
  readonly development: boolean;
  readonly logError?: (error: ChessboardError) => void;
}

function usePostCommitErrorReports(
  errors: readonly ChessboardError[],
  onError: OnChessboardError | undefined,
  logError: ((error: ChessboardError) => void) | undefined,
): void {
  const reportMetadata = useRef(createErrorReportMetadata());

  useEffect(() => {
    const plan = planChessboardErrorReports(errors, reportMetadata.current);
    reportMetadata.current = plan.nextMetadata;
    dispatchChessboardErrorReports(plan.reports, onError, logError);
  }, [errors, logError, onError]);
}

function useBoardModel(
  props: ChessboardProps,
  development: boolean,
  logError: ((error: ChessboardError) => void) | undefined,
): NormalizedBoardModel {
  const [metadata, setMetadata] = useState(createBoardModelMetadata);
  const prepared = prepareBoardModel({
    annotations: props.annotations,
    boardId: props.boardId,
    development,
    dimensions: props.dimensions,
    orientation: props.orientation,
    position: props.position,
    previousMetadata: metadata,
    selection: props.selection,
  });

  if (prepared.nextMetadata !== metadata) {
    setMetadata(prepared.nextMetadata);
  }

  usePostCommitErrorReports(prepared.errors, props.onError, logError);
  return prepared.model;
}

/** Internal runtime seam for deterministic development/production tests. */
export function ChessboardRuntime({
  development,
  logError,
  ...props
}: ChessboardRuntimeProps): ReactElement {
  const model = useBoardModel(props, development, logError);

  return (
    <BoardSurface model={model} showNotation={props.showNotation ?? true} />
  );
}

/**
 * Controlled, rules-free React Native chessboard.
 *
 * The responsive static surface renders controlled dimensions, orientation,
 * and notation. Piece and interaction layers remain later Phase 1 slices.
 *
 * @public
 */
export function Chessboard(props: ChessboardProps): ReactElement {
  const development = typeof __DEV__ !== 'undefined' && __DEV__;
  return <ChessboardRuntime {...props} development={development} />;
}
