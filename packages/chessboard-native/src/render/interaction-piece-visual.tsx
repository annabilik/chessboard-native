import { type ReactElement } from 'react';
import { View, type StyleProp, type ViewStyle } from 'react-native';

import type {
  PieceData,
  PieceRenderer,
  PieceRendererProps,
  PieceVisualState,
  MoveSource,
  SquareId,
} from '../public-types';
import { PIECE_HOST_STRUCTURAL_RESET } from './piece-host-style';

export type InteractionPieceVisualKind =
  'drag-overlay' | 'source-ghost' | 'pending';

type InteractionPieceVisualProps = {
  readonly boardId: string;
  readonly containerStyle?: StyleProp<ViewStyle>;
  readonly kind: InteractionPieceVisualKind;
  readonly piece: Readonly<PieceData>;
  readonly renderer: PieceRenderer;
  readonly size: number;
  readonly style: Readonly<ViewStyle>;
  readonly testID?: string;
} & (
  | {
      readonly source: Extract<MoveSource, { readonly kind: 'board' }>;
      readonly square: SquareId;
    }
  | {
      readonly source: Extract<MoveSource, { readonly kind: 'spare' }>;
      readonly square: SquareId | null;
    }
);

const DRAG_OVERLAY_STATE: Readonly<PieceVisualState> = Object.freeze({
  isDragging: true,
  isGhost: false,
  isPending: false,
  isPressed: false,
  isTransitioning: false,
});

const SOURCE_GHOST_STATE: Readonly<PieceVisualState> = Object.freeze({
  isDragging: false,
  isGhost: true,
  isPending: false,
  isPressed: false,
  isTransitioning: false,
});

const PENDING_STATE: Readonly<PieceVisualState> = Object.freeze({
  isDragging: false,
  isGhost: false,
  isPending: true,
  isPressed: false,
  isTransitioning: false,
});

/** Frozen renderer state for one board-owned transient piece visual. */
export function interactionPieceVisualState(
  kind: InteractionPieceVisualKind,
): Readonly<PieceVisualState> {
  switch (kind) {
    case 'drag-overlay':
      return DRAG_OVERLAY_STATE;
    case 'source-ghost':
      return SOURCE_GHOST_STATE;
    case 'pending':
      return PENDING_STATE;
  }
}

/** Fail loudly if an internal board-source visual loses its canonical square. */
export function resolveBoardVisualSquare(square: SquareId | null): SquareId {
  if (square === null) {
    throw new Error('A board-source piece visual requires a board square.');
  }
  return square;
}

/**
 * Pointerless piece primitive for a gesture layer's animated container. It is
 * deliberately unaware of positions, reducers, gestures, and shared values.
 */
export function InteractionPieceVisual(
  props: InteractionPieceVisualProps,
): ReactElement {
  const {
    boardId,
    containerStyle,
    kind,
    piece,
    renderer: Renderer,
    size,
    style,
    testID,
  } = props;
  const sharedRendererProps = {
    boardId,
    piece,
    size,
    state: interactionPieceVisualState(kind),
    style,
  };
  const rendererProps: PieceRendererProps =
    props.source.kind === 'board'
      ? {
          ...sharedRendererProps,
          source: props.source,
          square: resolveBoardVisualSquare(props.square),
        }
      : {
          ...sharedRendererProps,
          source: props.source,
          square: props.square,
        };

  return (
    <View
      accessibilityElementsHidden
      accessible={false}
      importantForAccessibility="no-hide-descendants"
      pointerEvents="none"
      style={[style, PIECE_HOST_STRUCTURAL_RESET, containerStyle]}
      testID={testID}
    >
      <Renderer {...rendererProps} />
    </View>
  );
}
