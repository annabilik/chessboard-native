import {
  useCallback,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  type ReactElement,
} from 'react';
import {
  AccessibilityInfo,
  Pressable,
  StyleSheet,
  View,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import { useSharedValue } from 'react-native-reanimated';

import { useReducedMotion } from './accessibility/reduced-motion';
import { generateBoardGeometry } from './core/coordinates';
import type {
  BoardDropSessionToken,
  BoardLayoutSnapshot,
} from './internal/board-layout-registry';
import {
  resetInteractionPresentationSharedValues,
  useInteractionPresentationSharedValues,
} from './internal/interaction-presentation';
import { useOptionalChessboardProvider } from './internal/provider-context';
import type {
  ProviderDragOverlayDescriptor,
  ProviderDragOwner,
} from './internal/provider-drag-coordinator';
import { createProviderSpareSelectionToken } from './internal/provider-spare-selection';
import { defaultPieceRenderers } from './pieces';
import type {
  PieceData,
  PieceRenderer,
  PieceRendererProps,
  PieceRenderers,
  PieceVisualState,
  SquareId,
} from './public-types';
import { PIECE_HOST_STRUCTURAL_RESET } from './render/piece-host-style';
import { resolvePieceRenderer } from './render/piece-layer';
import {
  SparePieceGestureLayer,
  type SparePieceHoverSharedValues,
  type SparePieceGestureSignal,
} from './render/spare-piece-gesture-layer';

const DEFAULT_SPARE_PIECE_SIZE = 48;

/** Public external piece source routed to one named board. @public */
export interface SparePieceProps {
  /** Stable source identity carried by every emitted move intent. */
  readonly spareId: string;
  /** Required destination board in the nearest explicit provider. */
  readonly targetBoardId: string;
  /** Detached piece payload copied into controlled move intents. */
  readonly piece: Readonly<PieceData>;
  /** Visual size in points; defaults to 48. */
  readonly size?: number;
  /** Whole-map visual renderer replacement; defaults are not merged into it. */
  readonly pieceRenderers?: PieceRenderers;
  /** Visual paint; interaction geometry and structural positioning stay owned. */
  readonly style?: StyleProp<ViewStyle>;
  /** Disables drag and accessible selection without removing the source. */
  readonly disabled?: boolean;
  /** Accessible button label; defaults from the piece type. */
  readonly accessibilityLabel?: string;
  /** Full accessible hint override. */
  readonly accessibilityHint?: string;
}

interface ActiveSpareDrag {
  readonly gestureToken: number;
  readonly session: BoardDropSessionToken;
}

const STATIC_SPARE_STATE: Readonly<PieceVisualState> = Object.freeze({
  isDragging: false,
  isGhost: false,
  isPending: false,
  isPressed: false,
  isTransitioning: false,
});

const PRESSED_SPARE_STATE: Readonly<PieceVisualState> = Object.freeze({
  ...STATIC_SPARE_STATE,
  isPressed: true,
});

const SOURCE_GHOST_STATE: Readonly<PieceVisualState> = Object.freeze({
  isDragging: false,
  isGhost: true,
  isPending: false,
  isPressed: false,
  isTransitioning: false,
});

const EMPTY_VISUAL_SQUARES: readonly SquareId[] = Object.freeze([]);

function resetHoverSharedValues(
  hover: Readonly<SparePieceHoverSharedValues>,
): void {
  // Disable first so a concurrent worklet cannot observe a partial geometry.
  hover.ready.value = 0;
  hover.candidateSquare.value = null;
  hover.boundsX.value = 0;
  hover.boundsY.value = 0;
  hover.boundsWidth.value = 0;
  hover.boundsHeight.value = 0;
  hover.columns.value = 0;
  hover.rows.value = 0;
  hover.visualSquares.value = EMPTY_VISUAL_SQUARES;
}

function configureHoverSharedValues(
  hover: Readonly<SparePieceHoverSharedValues>,
  snapshot: Readonly<BoardLayoutSnapshot> | null,
): boolean {
  resetHoverSharedValues(hover);
  if (!snapshot?.available || snapshot.cachedBounds === null) {
    return false;
  }
  const { cachedBounds, geometry } = snapshot;
  const visualSquares = Object.freeze(
    generateBoardGeometry(geometry.dimensions, geometry.orientation).flatMap(
      (row) => row.map(({ square }) => square),
    ),
  );
  hover.boundsX.value = cachedBounds.x;
  hover.boundsY.value = cachedBounds.y;
  hover.boundsWidth.value = cachedBounds.width;
  hover.boundsHeight.value = cachedBounds.height;
  hover.columns.value = geometry.dimensions.columns;
  hover.rows.value = geometry.dimensions.rows;
  hover.visualSquares.value = visualSquares;
  hover.ready.value = 1;
  return true;
}

const STANDARD_PIECE_LABELS: Readonly<Record<string, string>> = Object.freeze({
  bB: 'black bishop',
  bK: 'black king',
  bN: 'black knight',
  bP: 'black pawn',
  bQ: 'black queen',
  bR: 'black rook',
  wB: 'white bishop',
  wK: 'white king',
  wN: 'white knight',
  wP: 'white pawn',
  wQ: 'white queen',
  wR: 'white rook',
});

function validateId(value: unknown, name: string): string {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new TypeError(`SparePiece ${name} must be a non-empty string.`);
  }
  return value;
}

function validateSize(value: unknown): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) {
    throw new RangeError('SparePiece size must be a finite positive number.');
  }
  return value;
}

function copyPiece(value: unknown): Readonly<PieceData> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new TypeError('SparePiece piece must be an object.');
  }
  const record = value as Readonly<Record<string, unknown>>;
  if (typeof record['pieceType'] !== 'string') {
    throw new TypeError('SparePiece piece.pieceType must be a string.');
  }
  if (record['id'] !== undefined && typeof record['id'] !== 'string') {
    throw new TypeError('SparePiece piece.id must be a string when present.');
  }
  return Object.freeze({
    ...(record['id'] === undefined ? {} : { id: record['id'] }),
    pieceType: record['pieceType'],
  });
}

function defaultAccessibilityLabel(pieceType: string): string {
  return `${STANDARD_PIECE_LABELS[pieceType] ?? `${pieceType} piece`} spare`;
}

/**
 * Provider-coordinated external piece source.
 *
 * The named target board remains the only move callback and position authority.
 * Drag release is freshly measured before the target board's current runtime
 * creates an ordinary controlled move intent.
 *
 * @public
 */
export function SparePiece({
  accessibilityHint,
  accessibilityLabel: accessibilityLabelProp,
  disabled = false,
  piece: pieceProp,
  pieceRenderers = defaultPieceRenderers,
  size: sizeProp = DEFAULT_SPARE_PIECE_SIZE,
  spareId: spareIdProp,
  style,
  targetBoardId: targetBoardIdProp,
}: SparePieceProps): ReactElement {
  const provider = useOptionalChessboardProvider();
  if (provider === null) {
    throw new Error(
      'SparePiece requires an explicit ChessboardProvider around both the source and its target board.',
    );
  }

  const spareId = validateId(spareIdProp, 'spareId');
  const targetBoardId = validateId(targetBoardIdProp, 'targetBoardId');
  const size = validateSize(sizeProp);
  const validatedPiece = copyPiece(pieceProp);
  const piece = useMemo(
    () => validatedPiece,
    [validatedPiece.id, validatedPiece.pieceType],
  );
  const visualStyle = useMemo<Readonly<ViewStyle>>(
    () => Object.freeze({ ...StyleSheet.flatten(style) }),
    [style],
  );
  const renderer = resolvePieceRenderer(pieceRenderers, piece.pieceType);
  const reducedMotion = useReducedMotion();
  const providerTransientRevision = provider.runtime.getTransientRevision();
  const presentation = useInteractionPresentationSharedValues();
  const hoverBoundsHeight = useSharedValue(0);
  const hoverBoundsWidth = useSharedValue(0);
  const hoverBoundsX = useSharedValue(0);
  const hoverBoundsY = useSharedValue(0);
  const hoverCandidateSquare = useSharedValue<SquareId | null>(null);
  const hoverColumns = useSharedValue(0);
  const hoverReady = useSharedValue(0);
  const hoverRows = useSharedValue(0);
  const hoverVisualSquares =
    useSharedValue<readonly SquareId[]>(EMPTY_VISUAL_SQUARES);
  const hover = useMemo<Readonly<SparePieceHoverSharedValues>>(
    () =>
      Object.freeze({
        boundsHeight: hoverBoundsHeight,
        boundsWidth: hoverBoundsWidth,
        boundsX: hoverBoundsX,
        boundsY: hoverBoundsY,
        candidateSquare: hoverCandidateSquare,
        columns: hoverColumns,
        ready: hoverReady,
        rows: hoverRows,
        visualSquares: hoverVisualSquares,
      }),
    [
      hoverBoundsHeight,
      hoverBoundsWidth,
      hoverBoundsX,
      hoverBoundsY,
      hoverCandidateSquare,
      hoverColumns,
      hoverReady,
      hoverRows,
      hoverVisualSquares,
    ],
  );
  const owner = useRef<ProviderDragOwner>({});
  const activeDrag = useRef<Readonly<ActiveSpareDrag> | null>(null);
  const [providerResetRevision, setProviderResetRevision] = useState(0);
  const providerRuntimeIdentity = useRef({
    revision: 0,
    runtime: provider.runtime,
  });
  if (providerRuntimeIdentity.current.runtime !== provider.runtime) {
    if (providerRuntimeIdentity.current.revision === Number.MAX_SAFE_INTEGER) {
      throw new RangeError('SparePiece provider runtime revision exhausted.');
    }
    providerRuntimeIdentity.current = {
      revision: providerRuntimeIdentity.current.revision + 1,
      runtime: provider.runtime,
    };
  }
  const acceptingSignalGeneration = useRef<object | null>(null);
  const signalGeneration = useMemo(
    () => Object.freeze({}),
    [
      disabled,
      piece.id,
      piece.pieceType,
      provider.geometryRevision,
      provider.lifecycleRevision,
      provider.runtime,
      providerTransientRevision,
      reducedMotion,
      size,
      spareId,
      targetBoardId,
    ],
  );
  const selectionSnapshot = useSyncExternalStore(
    provider.runtime.spareSelection.subscribe,
    provider.runtime.spareSelection.getSnapshot,
    provider.runtime.spareSelection.getSnapshot,
  );
  const dragSnapshot = useSyncExternalStore(
    provider.runtime.drag.subscribe,
    provider.runtime.drag.getSnapshot,
    provider.runtime.drag.getSnapshot,
  );
  const selected = selectionSnapshot.active?.owner === owner.current;
  const source = useMemo(
    () => Object.freeze({ kind: 'spare' as const, spareId }),
    [spareId],
  );
  const accessibilityLabel =
    accessibilityLabelProp ?? defaultAccessibilityLabel(piece.pieceType);
  const resolvedAccessibilityHint =
    accessibilityHint ??
    `Activate to select this spare for placement on board ${targetBoardId}, or drag it to that board.`;

  const finishDrag = useCallback(
    (drag: Readonly<ActiveSpareDrag>, releaseLease: boolean): void => {
      if (activeDrag.current !== drag) {
        return;
      }
      activeDrag.current = null;
      provider.runtime.registry.endDropSession(drag.session);
      if (releaseLease) {
        provider.runtime.drag.release(owner.current, drag.gestureToken);
      }
      resetHoverSharedValues(hover);
      resetInteractionPresentationSharedValues(presentation);
    },
    [hover, presentation, provider.runtime],
  );

  const publishHover = useCallback(
    (
      drag: Readonly<ActiveSpareDrag>,
      targetSquare: SquareId | null,
    ): boolean => {
      if (activeDrag.current !== drag) {
        return false;
      }
      const active = provider.runtime.drag.getSnapshot().active;
      if (
        active?.owner !== owner.current ||
        active.gestureToken !== drag.gestureToken ||
        active.boardId !== targetBoardId ||
        active.source.kind !== 'spare' ||
        active.source.spareId !== spareId
      ) {
        return false;
      }
      presentation.targetSquare.value = targetSquare;
      if (active.targetSquare === targetSquare) {
        return true;
      }
      const next: Readonly<ProviderDragOverlayDescriptor> = Object.freeze({
        ...active,
        targetSquare,
      });
      provider.runtime.drag.claim(next);
      return true;
    },
    [presentation, provider.runtime.drag, spareId, targetBoardId],
  );

  const handleProviderCancellation = useCallback(
    (gestureToken: number): void => {
      const drag = activeDrag.current;
      if (drag?.gestureToken !== gestureToken) {
        return;
      }
      finishDrag(drag, false);
      if (acceptingSignalGeneration.current !== null) {
        setProviderResetRevision((revision) => {
          if (revision === Number.MAX_SAFE_INTEGER) {
            throw new RangeError(
              'SparePiece provider reset revision exhausted.',
            );
          }
          return revision + 1;
        });
      }
    },
    [finishDrag],
  );

  const handleGestureSignal = useCallback(
    (signal: Readonly<SparePieceGestureSignal>): void => {
      // UI-thread work may already have queued this callback when React
      // disables, retargets, replaces, or unmounts the source. Only the
      // generation installed by the latest committed layout effect may
      // create or finish provider coordination.
      if (
        acceptingSignalGeneration.current !== signalGeneration ||
        provider.runtime.getGeometryRevision() !== provider.geometryRevision ||
        provider.runtime.getTransientRevision() !== providerTransientRevision
      ) {
        return;
      }
      if (signal.type === 'start') {
        const previous = activeDrag.current;
        if (previous !== null) {
          finishDrag(previous, true);
        }
        if (
          disabled ||
          !provider.runtime.registry.canStartSpareDrag(
            targetBoardId,
            source,
            piece,
          )
        ) {
          resetHoverSharedValues(hover);
          resetInteractionPresentationSharedValues(presentation);
          return;
        }
        provider.runtime.spareSelection.clearOwner(owner.current);
        const session = provider.runtime.registry.beginDropSession({
          dropEpoch: signal.gestureToken,
          targetBoardId,
        });
        const drag: Readonly<ActiveSpareDrag> = Object.freeze({
          gestureToken: signal.gestureToken,
          session,
        });
        activeDrag.current = drag;
        configureHoverSharedValues(
          hover,
          provider.runtime.registry.getBoardSnapshot(targetBoardId),
        );
        const initialHover = provider.runtime.registry.getCachedHover(session, {
          x: signal.pointerWindowX,
          y: signal.pointerWindowY,
        });
        const targetSquare = initialHover?.targetSquare ?? null;
        hover.candidateSquare.value = targetSquare;
        presentation.targetSquare.value = targetSquare;
        provider.runtime.drag.claim(
          Object.freeze({
            boardId: targetBoardId,
            gestureToken: signal.gestureToken,
            onCancel: () => {
              handleProviderCancellation(signal.gestureToken);
            },
            owner: owner.current,
            piece,
            presentation,
            reducedMotion,
            renderer,
            size,
            sourceGhostStyle: visualStyle,
            source,
            square: null,
            style: visualStyle,
            targetSquare,
          }),
        );
        return;
      }

      const drag = activeDrag.current;
      if (drag?.gestureToken !== signal.gestureToken) {
        return;
      }
      if (signal.type === 'hover') {
        if (signal.targetSquare === null) {
          publishHover(drag, null);
          return;
        }
        const cached = provider.runtime.registry.getCachedHover(drag.session, {
          x: signal.pointerWindowX,
          y: signal.pointerWindowY,
        });
        if (cached?.targetSquare !== signal.targetSquare) {
          // A non-null UI hint that no longer correlates to the active cached
          // session is stale geometry, not permission to keep dragging.
          finishDrag(drag, true);
          return;
        }
        publishHover(drag, cached.targetSquare);
        return;
      }
      if (signal.type === 'cancel') {
        finishDrag(drag, true);
        return;
      }

      void provider.runtime.registry
        .verifyDrop(drag.session, {
          x: signal.pointerWindowX,
          y: signal.pointerWindowY,
        })
        .then((verification) => {
          if (activeDrag.current !== drag) {
            return;
          }
          if (verification.status === 'accepted') {
            provider.runtime.registry.requestVerifiedDrop(
              drag.session,
              verification,
              Object.freeze({
                input: 'drag',
                piece,
                source,
              }),
            );
          }
          finishDrag(drag, true);
        })
        .catch(() => {
          // The registry resolves every expected terminal path. Still fail
          // closed if an unexpected implementation or host promise rejects.
          finishDrag(drag, true);
        });
    },
    [
      disabled,
      finishDrag,
      handleProviderCancellation,
      hover,
      piece,
      presentation,
      provider.runtime,
      provider.geometryRevision,
      providerTransientRevision,
      publishHover,
      reducedMotion,
      renderer,
      size,
      signalGeneration,
      source,
      targetBoardId,
      visualStyle,
    ],
  );

  const selectForAccessibility = useCallback((): void => {
    if (disabled) {
      return;
    }
    const selectionToken = createProviderSpareSelectionToken();
    provider.runtime.spareSelection.select(
      Object.freeze({
        owner: owner.current,
        piece,
        selectionToken,
        spareId,
        targetBoardId,
      }),
    );
    AccessibilityInfo.announceForAccessibility(
      `${accessibilityLabel} selected for ${targetBoardId}.`,
    );
  }, [
    accessibilityLabel,
    disabled,
    piece,
    provider.runtime.spareSelection,
    spareId,
    targetBoardId,
  ]);

  useLayoutEffect(() => {
    return () => {
      provider.runtime.spareSelection.clearOwner(owner.current);
    };
  }, [
    disabled,
    piece.id,
    piece.pieceType,
    provider.runtime.spareSelection,
    spareId,
    targetBoardId,
  ]);

  useLayoutEffect(() => {
    acceptingSignalGeneration.current = signalGeneration;
    return () => {
      if (acceptingSignalGeneration.current === signalGeneration) {
        acceptingSignalGeneration.current = null;
      }
      const drag = activeDrag.current;
      if (drag !== null) {
        finishDrag(drag, true);
      }
    };
  }, [finishDrag, signalGeneration]);

  const activeSourceGhost =
    dragSnapshot.active?.source.kind === 'spare' &&
    dragSnapshot.active.source.spareId === spareId &&
    dragSnapshot.active.boardId === targetBoardId &&
    activeDrag.current?.gestureToken === dragSnapshot.active.gestureToken
      ? dragSnapshot.active
      : null;

  const renderPiece = useCallback(
    (pressed: boolean): ReactElement | null => {
      if (renderer === null) {
        return null;
      }
      const rendererProps: PieceRendererProps = {
        boardId: targetBoardId,
        piece,
        size,
        source,
        square: null,
        state: pressed ? PRESSED_SPARE_STATE : STATIC_SPARE_STATE,
        style: visualStyle,
      };
      const Renderer: PieceRenderer = renderer;
      return (
        <View
          accessibilityElementsHidden
          accessible={false}
          importantForAccessibility="no-hide-descendants"
          pointerEvents="none"
          style={internalStyles.visual}
        >
          <Renderer {...rendererProps} />
        </View>
      );
    },
    [piece, renderer, size, source, targetBoardId, visualStyle],
  );
  const sourceGhost = (() => {
    if (
      activeSourceGhost?.source.kind !== 'spare' ||
      activeSourceGhost.renderer === null
    ) {
      return null;
    }
    const Renderer = activeSourceGhost.renderer;
    return (
      <View
        accessibilityElementsHidden
        accessible={false}
        importantForAccessibility="no-hide-descendants"
        pointerEvents="none"
        style={internalStyles.sourceGhost}
      >
        <Renderer
          boardId={activeSourceGhost.boardId}
          piece={activeSourceGhost.piece}
          size={activeSourceGhost.size}
          source={activeSourceGhost.source}
          square={null}
          state={SOURCE_GHOST_STATE}
          style={activeSourceGhost.sourceGhostStyle}
        />
      </View>
    );
  })();
  const gestureResetKey = JSON.stringify([
    disabled,
    piece.id ?? null,
    piece.pieceType,
    provider.geometryRevision,
    provider.lifecycleRevision,
    providerResetRevision,
    providerRuntimeIdentity.current.revision,
    providerTransientRevision,
    reducedMotion,
    size,
    spareId,
    targetBoardId,
  ]);

  return (
    <View
      pointerEvents="box-none"
      style={[
        activeSourceGhost?.sourceGhostStyle ?? visualStyle,
        PIECE_HOST_STRUCTURAL_RESET,
        internalStyles.host,
        { height: size, width: size },
      ]}
      testID={`chessboard-native:spare:${spareId}`}
    >
      <SparePieceGestureLayer
        enabled={!disabled}
        hover={hover}
        onSignal={handleGestureSignal}
        presentation={presentation}
        resetKey={gestureResetKey}
        spareId={spareId}
      >
        <Pressable
          accessibilityHint={resolvedAccessibilityHint}
          accessibilityLabel={accessibilityLabel}
          accessibilityRole="button"
          accessibilityState={{ disabled, selected }}
          disabled={disabled}
          onPress={selectForAccessibility}
          style={[
            internalStyles.pressable,
            activeSourceGhost === null ? null : internalStyles.hiddenSource,
          ]}
        >
          {({ pressed }) => renderPiece(pressed)}
        </Pressable>
      </SparePieceGestureLayer>
      {sourceGhost}
    </View>
  );
}

const internalStyles = StyleSheet.create({
  host: {
    overflow: 'visible',
    pointerEvents: 'box-none',
    position: 'relative',
  },
  pressable: {
    height: '100%',
    width: '100%',
  },
  hiddenSource: {
    opacity: 0,
  },
  sourceGhost: {
    height: '100%',
    left: 0,
    pointerEvents: 'none',
    position: 'absolute',
    top: 0,
    width: '100%',
  },
  visual: {
    height: '100%',
    pointerEvents: 'none',
    width: '100%',
  },
});
