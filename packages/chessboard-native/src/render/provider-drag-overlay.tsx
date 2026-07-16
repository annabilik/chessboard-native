import { useSyncExternalStore, type ReactElement } from 'react';

import { useChessboardProvider } from '../internal/provider-context';
import type { ProviderDragOwner } from '../internal/provider-drag-coordinator';
import { DragOverlay } from './drag-overlay';
import { resolveBoardVisualSquare } from './interaction-piece-visual';

interface ProviderDragOverlayProps {
  readonly owner: ProviderDragOwner;
}

/** Render the provider's single active overlay from its owning board host. */
export function ProviderDragOverlay({
  owner,
}: ProviderDragOverlayProps): ReactElement | null {
  const { runtime } = useChessboardProvider();
  const snapshot = useSyncExternalStore(
    runtime.drag.subscribe,
    runtime.drag.getSnapshot,
    runtime.drag.getSnapshot,
  );
  const active = snapshot.active;
  if (active?.owner !== owner || active.renderer === null) {
    return null;
  }

  const shared = {
    boardId: active.boardId,
    piece: active.piece,
    presentation: active.presentation,
    renderer: active.renderer,
    size: active.size,
    style: active.style,
    testID: `chessboard-native:${active.boardId}:provider-drag-overlay`,
  } as const;
  return active.source.kind === 'board' ? (
    <DragOverlay
      {...shared}
      source={active.source}
      square={resolveBoardVisualSquare(active.square)}
    />
  ) : (
    <DragOverlay {...shared} source={active.source} square={active.square} />
  );
}
