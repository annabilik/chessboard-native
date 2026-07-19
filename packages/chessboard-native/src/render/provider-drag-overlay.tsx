import {
  useCallback,
  useLayoutEffect,
  useRef,
  useSyncExternalStore,
  type ReactElement,
} from 'react';
import { StyleSheet, View } from 'react-native';
import { useSharedValue } from 'react-native-reanimated';

import { useChessboardProvider } from '../internal/provider-context';
import { DragOverlay } from './drag-overlay';
import { resolveBoardVisualSquare } from './interaction-piece-visual';

/** Render the provider's single active overlay in provider window space. */
export function ProviderDragOverlay(): ReactElement | null {
  const { runtime } = useChessboardProvider();
  const snapshot = useSyncExternalStore(
    runtime.drag.subscribe,
    runtime.drag.getSnapshot,
    runtime.drag.getSnapshot,
  );
  const hostRef = useRef<View | null>(null);
  const originX = useSharedValue(0);
  const originY = useSharedValue(0);
  const originReady = useSharedValue(0);
  const measureOrigin = useCallback((): void => {
    hostRef.current?.measureInWindow((x, y) => {
      if (!Number.isFinite(x) || !Number.isFinite(y)) {
        return;
      }
      originX.value = x;
      originY.value = y;
      originReady.value = 1;
    });
  }, [originReady, originX, originY]);
  const active = snapshot.active;
  const activeOwner = active?.owner ?? null;
  const activeGestureToken = active?.gestureToken ?? null;

  useLayoutEffect(() => {
    if (activeGestureToken === null) {
      originX.value = 0;
      originY.value = 0;
      originReady.value = 0;
      return;
    }
    originReady.value = 0;
    measureOrigin();
  }, [
    activeGestureToken,
    activeOwner,
    measureOrigin,
    originReady,
    originX,
    originY,
  ]);

  if (!active?.renderer) {
    return null;
  }

  const shared = {
    boardId: active.boardId,
    piece: active.piece,
    presentation: active.presentation,
    reducedMotion: active.reducedMotion,
    renderer: active.renderer,
    size: active.size,
    style: active.style,
    testID: `chessboard-native:${active.boardId}:provider-drag-overlay`,
    windowOrigin: { ready: originReady, x: originX, y: originY },
  } as const;

  const overlay =
    active.source.kind === 'board' ? (
      <DragOverlay
        {...shared}
        source={active.source}
        square={resolveBoardVisualSquare(active.square)}
      />
    ) : (
      <DragOverlay
        {...shared}
        source={active.source}
        square={active.targetSquare}
      />
    );
  return (
    <View
      accessibilityElementsHidden
      accessible={false}
      collapsable={false}
      importantForAccessibility="no-hide-descendants"
      onLayout={() => {
        measureOrigin();
      }}
      pointerEvents="none"
      ref={hostRef}
      style={styles.host}
      testID="chessboard-native:provider-drag-host"
    >
      {overlay}
    </View>
  );
}

const styles = StyleSheet.create({
  host: {
    bottom: 0,
    elevation: 1000,
    left: 0,
    overflow: 'visible',
    pointerEvents: 'none',
    position: 'absolute',
    right: 0,
    top: 0,
    zIndex: 1000,
  },
});
