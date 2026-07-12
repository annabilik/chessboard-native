import { useEffect, useRef, useState, type ReactElement } from 'react';

import { ReducedMotionProvider } from './accessibility/reduced-motion';
import { defaultAnnotationStyle } from './annotation-style';
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
import { defaultPieceRenderers } from './pieces';
import { BoardSurface } from './render/board-surface';
import type {
  AnnotationsProp,
  AnnotationStyle,
  BoardDimensions,
  BoardOrientation,
  ChessboardAccessibility,
  ChessboardStyles,
  ChessboardTheme,
  PieceRenderers,
  PositionProp,
  ReduceMotion,
  SelectionProp,
  SquareStyles,
} from './public-types';

/** Controlled semantic inputs and visual configuration accepted by the board. @public */
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
  /** Reusable visual defaults applied over the built-in theme. */
  readonly theme?: ChessboardTheme;
  /** Per-instance visual overrides applied after the theme. */
  readonly styles?: ChessboardStyles;
  /** Declarative visual overrides keyed by canonical square ID. */
  readonly squareStyles?: SquareStyles;
  /** Whole-map piece renderer replacement; defaults are not merged into it. */
  readonly pieceRenderers?: PieceRenderers;
  /** The only persistent annotation collection when supplied. */
  readonly annotations?: AnnotationsProp;
  /** Whole-value annotation geometry and presentation configuration. */
  readonly annotationStyle?: AnnotationStyle;
  /** Consumer-owned selection presentation when supplied. */
  readonly selection?: SelectionProp;
  /** Labels, formatters, and correlated announcements for the board control. */
  readonly accessibility?: ChessboardAccessibility;
  /** Animation-reduction policy; defaults to the operating-system preference. */
  readonly reduceMotion?: ReduceMotion;
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
    <ReducedMotionProvider preference={props.reduceMotion ?? 'system'}>
      <BoardSurface
        accessibility={props.accessibility}
        annotationStyle={props.annotationStyle ?? defaultAnnotationStyle}
        model={model}
        pieceRenderers={props.pieceRenderers ?? defaultPieceRenderers}
        showNotation={props.showNotation ?? true}
        squareStyles={props.squareStyles}
        styles={props.styles}
        theme={props.theme}
      />
    </ReducedMotionProvider>
  );
}

/**
 * Controlled, rules-free React Native chessboard.
 *
 * The responsive static surface renders the latest controlled position with
 * measured squares, notation, visual-only default or custom pieces, and one
 * adjustable accessibility control. Semantic interaction remains controlled
 * by later APIs.
 *
 * @public
 */
export function Chessboard(props: ChessboardProps): ReactElement {
  const development = typeof __DEV__ !== 'undefined' && __DEV__;
  return <ChessboardRuntime {...props} development={development} />;
}
