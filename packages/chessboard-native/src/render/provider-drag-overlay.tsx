import {
  useCallback,
  useLayoutEffect,
  useRef,
  useState,
  useSyncExternalStore,
  type ReactElement,
} from 'react';
import { StyleSheet, View } from 'react-native';
import { useAnimatedRef, useSharedValue } from 'react-native-reanimated';

import { useChessboardProvider } from '../internal/provider-context';
import { DragOverlay } from './drag-overlay';
import { resolveBoardVisualSquare } from './interaction-piece-visual';

interface DragOverlayRetirement {
  readonly epoch: number;
  readonly gestureToken: number;
  readonly owner: object;
  firstFrame: number | null;
  secondFrame: number | null;
}

/**
 * Render the provider's single overlay in provider window space.
 *
 * While the provider remains mounted, a released overlay stays through one
 * full quiescent frame so Reanimated can detach its animated style and drain
 * queued native props before Fabric removes the host. Ancestor teardown cannot
 * wait for these frames and is protected separately by teardown paths that do
 * not publish orphaned shared-value writes and Android's commit-safe layout
 * transport for any residual native terminal frame.
 */
export function ProviderDragOverlay(): ReactElement | null {
  const { runtime } = useChessboardProvider();
  const snapshot = useSyncExternalStore(
    runtime.drag.subscribe,
    runtime.drag.getSnapshot,
    runtime.drag.getSnapshot,
  );
  const hostRef = useAnimatedRef<View>();
  const originX = useSharedValue(0);
  const originY = useSharedValue(0);
  const originReady = useSharedValue(0);
  const renderableActive = snapshot.active?.renderer ? snapshot.active : null;
  const retainedActiveRef = useRef(renderableActive);
  const [, setRetirementRevision] = useState(0);
  const retirementEpochRef = useRef(0);
  const retirementRef = useRef<DragOverlayRetirement | null>(null);
  const originMeasurementGenerationRef = useRef(0);
  const cancelRetirement = useCallback((): void => {
    const retirement = retirementRef.current;
    if (retirement === null) {
      return;
    }
    retirementEpochRef.current += 1;
    if (retirement.firstFrame !== null) {
      cancelAnimationFrame(retirement.firstFrame);
    }
    if (retirement.secondFrame !== null) {
      cancelAnimationFrame(retirement.secondFrame);
    }
    retirementRef.current = null;
  }, []);
  const measureOrigin = useCallback(
    (generation: number): void => {
      hostRef.current?.measureInWindow((x, y) => {
        if (originMeasurementGenerationRef.current !== generation) {
          return;
        }
        if (!Number.isFinite(x) || !Number.isFinite(y)) {
          return;
        }
        originX.value = x;
        originY.value = y;
        originReady.value = 1;
      });
    },
    [originReady, originX, originY],
  );
  const active = renderableActive;
  const activeOwner = active?.owner ?? null;
  const activeGestureToken = active?.gestureToken ?? null;

  useLayoutEffect(() => {
    if (active !== null) {
      cancelRetirement();
      retainedActiveRef.current = active;
      return;
    }

    // The coordinator is already semantically inactive. Keep only the native
    // shell alive through a native-update frame after the quiescent commit has
    // detached its animated style.
    const retainedActive = retainedActiveRef.current;
    if (retainedActive === null || retirementRef.current !== null) {
      return;
    }
    const retirement: DragOverlayRetirement = {
      epoch: retirementEpochRef.current + 1,
      firstFrame: null,
      gestureToken: retainedActive.gestureToken,
      owner: retainedActive.owner,
      secondFrame: null,
    };
    retirementEpochRef.current = retirement.epoch;
    retirementRef.current = retirement;
    retirement.firstFrame = requestAnimationFrame(() => {
      if (retirementRef.current !== retirement) {
        return;
      }
      retirement.firstFrame = null;
      retirement.secondFrame = requestAnimationFrame(() => {
        if (
          retirementRef.current !== retirement ||
          retirementEpochRef.current !== retirement.epoch ||
          runtime.drag.getSnapshot().active?.renderer
        ) {
          return;
        }
        const current = retainedActiveRef.current;
        if (
          current?.owner !== retirement.owner ||
          current.gestureToken !== retirement.gestureToken
        ) {
          return;
        }
        retirement.secondFrame = null;
        retirementRef.current = null;
        retainedActiveRef.current = null;
        setRetirementRevision((revision) => revision + 1);
      });
    });
  }, [active, cancelRetirement, runtime.drag]);

  useLayoutEffect(
    () => () => {
      cancelRetirement();
      originMeasurementGenerationRef.current += 1;
      retainedActiveRef.current = null;
    },
    [cancelRetirement],
  );

  useLayoutEffect(() => {
    originMeasurementGenerationRef.current += 1;
    const generation = originMeasurementGenerationRef.current;
    if (activeGestureToken === null) {
      // Ordinary retirement already detaches the animated style. Retain the
      // last measurement without publishing mapper inputs; a whole-provider
      // deletion cannot wait for retirement frames, while the next gesture
      // hides and remeasures before it can render.
      return;
    }
    originReady.value = 0;
    measureOrigin(generation);
  }, [
    activeGestureToken,
    activeOwner,
    measureOrigin,
    originReady,
    originX,
    originY,
  ]);

  const displayedActive = active ?? retainedActiveRef.current;
  if (displayedActive?.renderer === null || displayedActive === null) {
    return null;
  }
  const quiescent = active === null;

  const shared = {
    boardId: displayedActive.boardId,
    bounds: displayedActive.bounds,
    piece: displayedActive.piece,
    presentation: displayedActive.presentation,
    quiescent,
    reducedMotion: displayedActive.reducedMotion,
    renderer: displayedActive.renderer,
    size: displayedActive.size,
    style: displayedActive.style,
    testID: `chessboard-native:${displayedActive.boardId}:provider-drag-${quiescent ? 'retiring-' : ''}overlay`,
    windowOrigin: { hostRef, ready: originReady, x: originX, y: originY },
  } as const;

  const overlay =
    displayedActive.source.kind === 'board' ? (
      <DragOverlay
        {...shared}
        source={displayedActive.source}
        square={resolveBoardVisualSquare(displayedActive.square)}
      />
    ) : (
      <DragOverlay
        {...shared}
        source={displayedActive.source}
        square={displayedActive.targetSquare}
      />
    );
  return (
    <View
      accessibilityElementsHidden
      accessible={false}
      collapsable={false}
      importantForAccessibility="no-hide-descendants"
      onLayout={() => {
        if (active !== null) {
          measureOrigin(originMeasurementGenerationRef.current);
        }
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
