import { type ReactElement } from 'react';
import { StyleSheet, View, type ViewStyle } from 'react-native';

import type { MoveIntentLifecycle } from '../internal/interaction-reducer';
import type { PieceRenderers } from '../public-types';
import type { BoardSurfaceLayout } from './board-layout';
import { InteractionPieceVisual } from './interaction-piece-visual';
import { resolvePieceRenderer } from './piece-layer';

interface PendingMoveLayerProps {
  readonly boardId: string;
  readonly layout: Readonly<BoardSurfaceLayout>;
  readonly lifecycle: Readonly<MoveIntentLifecycle> | null;
  readonly pieceRenderers: PieceRenderers;
  readonly style: Readonly<ViewStyle>;
}

/** Presentation-only copy at the requested target while consumer state waits. */
export function PendingMoveLayer({
  boardId,
  layout,
  lifecycle,
  pieceRenderers,
  style,
}: PendingMoveLayerProps): ReactElement | null {
  if (
    lifecycle === null ||
    (lifecycle.phase !== 'deciding' && lifecycle.phase !== 'awaiting-commit') ||
    lifecycle.intent.targetSquare === null
  ) {
    return null;
  }

  const cell = layout.cells.find(
    ({ square }) => square === lifecycle.intent.targetSquare,
  );
  const renderer = resolvePieceRenderer(
    pieceRenderers,
    lifecycle.intent.piece.pieceType,
  );
  if (cell === undefined || renderer === null) {
    return null;
  }

  const size = Math.min(cell.rect.width, cell.rect.height);
  const left = cell.rect.left + (cell.rect.width - size) / 2;
  const top = cell.rect.top + (cell.rect.height - size) / 2;

  return (
    <View
      accessibilityElementsHidden
      accessible={false}
      importantForAccessibility="no-hide-descendants"
      pointerEvents="none"
      style={styles.layer}
    >
      <InteractionPieceVisual
        boardId={boardId}
        containerStyle={{ height: size, left, top, width: size }}
        kind="pending"
        piece={lifecycle.intent.piece}
        renderer={renderer}
        size={size}
        square={lifecycle.intent.targetSquare}
        style={style}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  layer: {
    bottom: 0,
    left: 0,
    position: 'absolute',
    right: 0,
    top: 0,
    zIndex: 50,
  },
});
