import {
  useCallback,
  useLayoutEffect,
  useMemo,
  useRef,
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

import type { BoardDropSessionToken } from './internal/board-layout-registry';
import {
  resetInteractionPresentationSharedValues,
  useInteractionPresentationSharedValues,
} from './internal/interaction-presentation';
import { useOptionalChessboardProvider } from './internal/provider-context';
import type { ProviderDragOwner } from './internal/provider-drag-coordinator';
import { createProviderSpareSelectionToken } from './internal/provider-spare-selection';
import { defaultPieceRenderers } from './pieces';
import type {
  PieceData,
  PieceRenderer,
  PieceRendererProps,
  PieceRenderers,
  PieceVisualState,
} from './public-types';
import { PIECE_HOST_STRUCTURAL_RESET } from './render/piece-host-style';
import { resolvePieceRenderer } from './render/piece-layer';
import { ProviderDragOverlay } from './render/provider-drag-overlay';
import {
  SparePieceGestureLayer,
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
  const presentation = useInteractionPresentationSharedValues();
  const owner = useRef<ProviderDragOwner>({});
  const activeDrag = useRef<Readonly<ActiveSpareDrag> | null>(null);
  const selectionSnapshot = useSyncExternalStore(
    provider.runtime.spareSelection.subscribe,
    provider.runtime.spareSelection.getSnapshot,
    provider.runtime.spareSelection.getSnapshot,
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
      resetInteractionPresentationSharedValues(presentation);
    },
    [presentation, provider.runtime],
  );

  const handleProviderCancellation = useCallback(
    (gestureToken: number): void => {
      const drag = activeDrag.current;
      if (drag?.gestureToken !== gestureToken) {
        return;
      }
      finishDrag(drag, false);
    },
    [finishDrag],
  );

  const handleGestureSignal = useCallback(
    (signal: Readonly<SparePieceGestureSignal>): void => {
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
            renderer,
            size,
            source,
            square: null,
            style: visualStyle,
          }),
        );
        return;
      }

      const drag = activeDrag.current;
      if (drag?.gestureToken !== signal.gestureToken) {
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
      piece,
      presentation,
      provider.runtime,
      renderer,
      size,
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
    return () => {
      const drag = activeDrag.current;
      if (drag !== null) {
        finishDrag(drag, true);
      }
    };
  }, [
    disabled,
    finishDrag,
    piece.id,
    piece.pieceType,
    size,
    spareId,
    targetBoardId,
  ]);

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

  return (
    <View
      pointerEvents="box-none"
      style={[
        visualStyle,
        PIECE_HOST_STRUCTURAL_RESET,
        internalStyles.host,
        { height: size, width: size },
      ]}
      testID={`chessboard-native:spare:${spareId}`}
    >
      <SparePieceGestureLayer
        enabled={!disabled}
        onSignal={handleGestureSignal}
        presentation={presentation}
        spareId={spareId}
      >
        <Pressable
          accessibilityHint={resolvedAccessibilityHint}
          accessibilityLabel={accessibilityLabel}
          accessibilityRole="button"
          accessibilityState={{ disabled, selected }}
          disabled={disabled}
          onPress={selectForAccessibility}
          style={internalStyles.pressable}
        >
          {({ pressed }) => renderPiece(pressed)}
        </Pressable>
      </SparePieceGestureLayer>
      <ProviderDragOverlay owner={owner.current} />
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
  visual: {
    height: '100%',
    pointerEvents: 'none',
    width: '100%',
  },
});
