import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ReactElement,
} from 'react';
import type { View } from 'react-native';

import { ReducedMotionProvider } from './accessibility/reduced-motion';
import { defaultAnnotationStyle } from './annotation-style';
import { ChessboardProvider } from './ChessboardProvider';
import { ChessboardError, type OnChessboardError } from './ChessboardError';
import {
  createBoardModelMetadata,
  prepareBoardModel,
  type NormalizedBoardModel,
} from './internal/board-model';
import {
  createBoardLayoutOwnerToken,
  type NotifyProviderSparePieceInteraction,
} from './internal/board-layout-registry';
import { normalizeChessboardGestureOptions } from './internal/gesture-options';
import { createPieceInteractionContext } from './internal/piece-interaction';
import {
  createErrorReportMetadata,
  dispatchChessboardErrorReports,
  planChessboardErrorReports,
} from './internal/error-reporting';
import {
  useChessboardProvider,
  useOptionalChessboardProvider,
  type ChessboardProviderRuntime,
} from './internal/provider-context';
import type { ProviderBoardRegistration } from './internal/provider-board-registration';
import type { ProviderDragCancellationReason } from './internal/provider-drag-coordinator';
import {
  usePieceInteraction,
  type PieceInteractionCallbacks,
} from './internal/use-piece-interaction';
import { normalizeTransitionDurationMs } from './internal/use-position-transition-runtime';
import { defaultPieceRenderers } from './pieces';
import { BoardSurface } from './render/board-surface';
import type {
  AnnotationsProp,
  AnnotationPolicies,
  AnnotationStyle,
  AnnotationTool,
  BoardDimensions,
  BoardOrientation,
  CanDragPiece,
  ChessboardAccessibility,
  ChessboardGestureOptions,
  ChessboardStyles,
  ChessboardTheme,
  InteractionPermissions,
  MoveRequestTimeouts,
  OnMoveRequest,
  OnAnnotationOperation,
  OnPieceDragStart,
  OnPiecePress,
  OnSquareActivate,
  OnSquarePressIn,
  OnSquarePressOut,
  PieceRenderers,
  PositionProp,
  ReduceMotion,
  SelectionProp,
  SquareRenderer,
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
  /** Visual-only square content rendered inside board-owned measured paint. */
  readonly renderSquare?: SquareRenderer;
  /** Whole-map piece renderer replacement; defaults are not merged into it. */
  readonly pieceRenderers?: PieceRenderers;
  /** The only persistent annotation collection when supplied. */
  readonly annotations?: AnnotationsProp;
  /** Whole-value annotation geometry and presentation configuration. */
  readonly annotationStyle?: AnnotationStyle;
  /** Selected native drawing tool; omitted or null keeps drawing disabled. */
  readonly annotationTool?: AnnotationTool;
  /** Independent opt-in policies that request controlled annotation clears. */
  readonly annotationPolicies?: AnnotationPolicies;
  /** Emits immutable deltas without changing the controlled collection. */
  readonly onAnnotationOperation?: OnAnnotationOperation;
  /** Consumer-owned selection presentation when supplied. */
  readonly selection?: SelectionProp;
  /** Emits a controlled square activation without changing selection. */
  readonly onSquareActivate?: OnSquareActivate;
  /** Observes one native square press begin without changing controlled state. */
  readonly onSquarePressIn?: OnSquarePressIn;
  /** Observes the terminal boundary of one accepted native square press. */
  readonly onSquarePressOut?: OnSquarePressOut;
  /**
   * Validates a move intent without committing it. Supplying this callback
   * opens the controlled move-request surface.
   */
  readonly onMoveRequest?: OnMoveRequest;
  /** Declarative input gates; no callback always means read-only. */
  readonly interactionPermissions?: InteractionPermissions;
  /** Native gesture-recognition tuning shared with targeted spare sources. */
  readonly gesture?: ChessboardGestureOptions;
  /** Synchronous current-snapshot gate for board and targeted spare dragging. */
  readonly canDragPiece?: CanDragPiece;
  /** Observes one current piece activation without changing controlled state. */
  readonly onPiecePress?: OnPiecePress;
  /** Observes one accepted native drag start without changing controlled state. */
  readonly onPieceDragStart?: OnPieceDragStart;
  /** Decision and controlled-commit budgets; defaults are 10s and 1.5s. */
  readonly moveRequestTimeouts?: MoveRequestTimeouts;
  /** Labels, formatters, and correlated announcements for the board control. */
  readonly accessibility?: ChessboardAccessibility;
  /** Animation-reduction policy; defaults to the operating-system preference. */
  readonly reduceMotion?: ReduceMotion;
  /** Controlled-position transition duration in milliseconds; defaults to 300. */
  readonly transitionDurationMs?: number;
  /** Receives deduplicated production contract errors after commit. */
  readonly onError?: OnChessboardError;
}

interface ChessboardRuntimeProps extends ChessboardProps {
  readonly development: boolean;
  readonly logError?: (error: ChessboardError) => void;
  readonly logTransitionWarning?: (message: string) => void;
}

interface ProviderRegistrationState {
  readonly activation: object;
  readonly boardId: string;
  readonly error: ChessboardError | null;
  readonly runtime: ChessboardProviderRuntime;
  readonly status: 'duplicate' | 'registered';
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

function useProviderBoardRegistration(options: {
  readonly activationDistance: number;
  readonly boardId: string | null;
  readonly development: boolean;
  readonly logError: ((error: ChessboardError) => void) | undefined;
  readonly onError: OnChessboardError | undefined;
  readonly pieceInteraction: Readonly<PieceInteractionCallbacks>;
  readonly positionRevision: number | null;
}): Readonly<ProviderBoardRegistration> | null {
  const provider = useOptionalChessboardProvider();
  if (provider === null) {
    throw new Error('Board registration requires a provider.');
  }
  const [owner] = useState(createBoardLayoutOwnerToken);
  const hostRef = useRef<View | null>(null);
  const positionRevisionAtCommit = useRef<number | null>(null);
  const activationDistanceAtCommit = useRef(options.activationDistance);
  const pieceInteractionAtCommit = useRef(options.pieceInteraction);
  const [state, setState] =
    useState<Readonly<ProviderRegistrationState> | null>(null);
  const measureInWindow = useCallback(
    (
      callback: (x: number, y: number, width: number, height: number) => void,
    ) => {
      const host = hostRef.current;
      if (host === null) {
        callback(Number.NaN, Number.NaN, Number.NaN, Number.NaN);
        return;
      }
      host.measureInWindow(callback);
    },
    [],
  );
  const readPositionRevision = useCallback(
    () => positionRevisionAtCommit.current,
    [],
  );
  const readMoveRequest = useCallback(() => null, []);
  const readSpareDragPermission = useCallback(() => null, []);
  const notifySparePieceDragStart =
    useCallback<NotifyProviderSparePieceInteraction>(
      (source, piece): boolean => {
        const boardId = options.boardId;
        const revision = positionRevisionAtCommit.current;
        if (boardId === null || revision === null) {
          return false;
        }
        return pieceInteractionAtCommit.current.dragStart(
          createPieceInteractionContext({
            basePositionRevision: revision,
            boardId,
            piece,
            source,
          }),
        );
      },
      [options.boardId],
    );
  const notifySparePiecePress =
    useCallback<NotifyProviderSparePieceInteraction>(
      (source, piece): boolean => {
        const boardId = options.boardId;
        const revision = positionRevisionAtCommit.current;
        if (boardId === null || revision === null) {
          return false;
        }
        return pieceInteractionAtCommit.current.press(
          createPieceInteractionContext({
            basePositionRevision: revision,
            boardId,
            piece,
            source,
          }),
        );
      },
      [options.boardId],
    );
  const readSparePieceDragStart = useCallback(
    () => notifySparePieceDragStart,
    [notifySparePieceDragStart],
  );
  const readSparePiecePress = useCallback(
    () => notifySparePiecePress,
    [notifySparePiecePress],
  );
  const cancelActiveDrag = useCallback(
    (reason: ProviderDragCancellationReason): void => {
      const boardId = options.boardId;
      const active = provider.runtime.drag.getSnapshot().active;
      if (boardId !== null && active?.boardId === boardId) {
        provider.runtime.drag.cancel(active.owner, active.gestureToken, reason);
      }
    },
    [options.boardId, provider.runtime],
  );

  useLayoutEffect(() => {
    activationDistanceAtCommit.current = options.activationDistance;
    pieceInteractionAtCommit.current = options.pieceInteraction;
    positionRevisionAtCommit.current = options.positionRevision;
  }, [
    options.activationDistance,
    options.pieceInteraction,
    options.positionRevision,
  ]);

  useLayoutEffect(() => {
    const boardId = options.boardId;
    if (boardId === null) {
      return;
    }
    const result = provider.runtime.registry.register({
      available: false,
      boardId,
      dragActivationDistance: activationDistanceAtCommit.current,
      geometry: {
        dimensions: { columns: 8, rows: 8 },
        geometryEpoch: 0,
        layoutRevision: 0,
        orientation: 'white',
      },
      measureInWindow,
      owner,
      readMoveRequest,
      readPositionRevision,
      readSpareDragPermission,
      readSparePieceDragStart,
      readSparePiecePress,
    });
    if (result.status === 'registered') {
      // A preserved Suspense/Offscreen tree can replay layout effects without
      // resetting hook state. Publish a fresh activation on every successful
      // registration so the child surface republishes real geometry after the
      // placeholder identity reservation is recreated.
      setState(
        Object.freeze({
          activation: Object.freeze({}),
          boardId,
          error: null,
          runtime: provider.runtime,
          status: 'registered',
        }),
      );
    } else {
      const error = new ChessboardError(
        result.status === 'duplicate'
          ? `boardId "${boardId}" is already registered in this ChessboardProvider.`
          : `The mounted board registration already owns boardId "${result.registeredBoardId}".`,
        {
          boardId,
          code:
            result.status === 'duplicate'
              ? 'DUPLICATE_BOARD_ID'
              : 'BOARD_ID_CHANGED',
          revision: null,
        },
      );
      setState(
        Object.freeze({
          activation: Object.freeze({}),
          boardId,
          error,
          runtime: provider.runtime,
          status: 'duplicate',
        }),
      );
    }

    return () => {
      const active = provider.runtime.drag.getSnapshot().active;
      if (active?.boardId === boardId) {
        provider.runtime.drag.cancel(
          active.owner,
          active.gestureToken,
          'unmount',
        );
      }
      if (provider.runtime.registry.unregister(boardId, owner)) {
        provider.runtime.spareSelection.clearTarget(boardId);
      }
    };
  }, [
    measureInWindow,
    options.boardId,
    owner,
    provider.runtime,
    readMoveRequest,
    readPositionRevision,
    readSpareDragPermission,
    readSparePieceDragStart,
    readSparePiecePress,
  ]);

  const currentState =
    state?.boardId === options.boardId && state.runtime === provider.runtime
      ? state
      : null;
  useLayoutEffect(() => {
    const boardId = options.boardId;
    if (boardId === null || currentState?.status !== 'registered') {
      return;
    }
    provider.runtime.registry.update(boardId, owner, {
      dragActivationDistance: options.activationDistance,
    });
  }, [
    currentState?.activation,
    currentState?.status,
    options.activationDistance,
    options.boardId,
    owner,
    provider.runtime.registry,
  ]);
  const registrationError = currentState?.error ?? null;
  const registration =
    useMemo<Readonly<ProviderBoardRegistration> | null>(() => {
      if (options.boardId === null) {
        return null;
      }
      return Object.freeze({
        boardId: options.boardId,
        cancelActiveDrag,
        hostRef,
        owner,
        registered: currentState?.status === 'registered',
        registry: provider.runtime.registry,
      });
    }, [
      cancelActiveDrag,
      currentState?.status,
      currentState?.activation,
      options.boardId,
      owner,
      provider.runtime.registry,
    ]);
  usePostCommitErrorReports(
    registrationError === null ? [] : [registrationError],
    options.onError,
    options.logError,
  );
  if (options.development && registrationError !== null) {
    throw registrationError;
  }
  return registration;
}

/** Internal runtime seam for deterministic development/production tests. */
function ChessboardRuntimeContent({
  development,
  logError,
  logTransitionWarning,
  ...props
}: ChessboardRuntimeProps): ReactElement {
  const model = useBoardModel(props, development, logError);
  const gesture = normalizeChessboardGestureOptions(props.gesture);
  const pieceInteraction = usePieceInteraction({
    boardId: model.boardId,
    onPieceDragStart: props.onPieceDragStart,
    onPiecePress: props.onPiecePress,
  });
  const transitionDurationMs = normalizeTransitionDurationMs(
    props.transitionDurationMs,
  );
  const provider = useChessboardProvider();
  const providerRegistration = useProviderBoardRegistration({
    activationDistance: gesture.activationDistance,
    boardId: model.boardId,
    development,
    logError,
    onError: props.onError,
    pieceInteraction,
    positionRevision: model.position?.revision ?? null,
  });

  return (
    <ReducedMotionProvider preference={props.reduceMotion ?? 'system'}>
      <BoardSurface
        activationDistance={gesture.activationDistance}
        accessibility={props.accessibility}
        annotationPolicies={props.annotationPolicies}
        annotationStyle={props.annotationStyle ?? defaultAnnotationStyle}
        annotationTool={props.annotationTool}
        canDragPiece={props.canDragPiece}
        development={development}
        providerGeometryRevision={provider.geometryRevision}
        interactionPermissions={props.interactionPermissions}
        {...(logTransitionWarning === undefined
          ? {}
          : { logTransitionWarning })}
        model={model}
        moveRequestTimeouts={props.moveRequestTimeouts}
        onAnnotationOperation={props.onAnnotationOperation}
        onMoveRequest={props.onMoveRequest}
        onSquareActivate={props.onSquareActivate}
        onSquarePressIn={props.onSquarePressIn}
        onSquarePressOut={props.onSquarePressOut}
        pieceInteraction={pieceInteraction}
        piecePressEnabled={typeof props.onPiecePress === 'function'}
        pieceRenderers={props.pieceRenderers ?? defaultPieceRenderers}
        renderSquare={props.renderSquare}
        providerRegistration={providerRegistration}
        providerLifecycleRevision={provider.lifecycleRevision}
        showNotation={props.showNotation ?? true}
        squareStyles={props.squareStyles}
        styles={props.styles}
        theme={props.theme}
        transitionDurationMs={transitionDurationMs}
      />
    </ReducedMotionProvider>
  );
}

/** Internal runtime seam for deterministic development/production tests. */
export function ChessboardRuntime(props: ChessboardRuntimeProps): ReactElement {
  const provider = useOptionalChessboardProvider();
  if (provider === null) {
    return (
      <ChessboardProvider>
        <ChessboardRuntimeContent {...props} />
      </ChessboardProvider>
    );
  }
  return <ChessboardRuntimeContent {...props} />;
}

/**
 * Controlled, rules-free React Native chessboard.
 *
 * The responsive static surface renders the latest controlled position with
 * measured squares, notation, visual-only default or custom pieces, and one
 * adjustable accessibility control. Move requests are optional, cancellable,
 * rules-free, and never replace the consumer-controlled position.
 *
 * @public
 */
export function Chessboard(props: ChessboardProps): ReactElement {
  const development = typeof __DEV__ !== 'undefined' && __DEV__;
  return <ChessboardRuntime {...props} development={development} />;
}
