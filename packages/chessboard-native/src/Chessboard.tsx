import { useEffect, useRef, useState, type ReactElement } from 'react';
import { StyleSheet, View } from 'react-native';

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
import type {
  AnnotationsProp,
  BoardDimensions,
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
    <View
      accessibilityElementsHidden
      accessibilityState={{ disabled: model.status === 'disabled' }}
      accessible={false}
      importantForAccessibility="no-hide-descendants"
      pointerEvents="none"
      style={styles.frame}
    />
  );
}

/**
 * Controlled, rules-free React Native chessboard.
 *
 * Static square and piece rendering lands in the next Phase 1 slice; this
 * frame already enforces standalone controlled-value normalization.
 *
 * @public
 */
export function Chessboard(props: ChessboardProps): ReactElement {
  const development = typeof __DEV__ !== 'undefined' && __DEV__;
  return <ChessboardRuntime {...props} development={development} />;
}

const styles = StyleSheet.create({
  frame: {
    width: '100%',
    aspectRatio: 1,
    backgroundColor: '#e7e0d2',
    borderColor: '#9c8f7a',
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
  },
});
