import { useLayoutEffect, useMemo, type ReactElement } from 'react';
import { StyleSheet, View, type ViewStyle } from 'react-native';
import Animated, {
  useAnimatedStyle,
  type SharedValue,
} from 'react-native-reanimated';

import type { MoveIntentLifecycle } from '../internal/interaction-reducer';
import type {
  PendingCommitHandoffDescriptor,
  PendingCommitTransitionAcknowledgement,
} from '../internal/pending-commit-handoff';
import {
  MAX_TRANSITION_PRESENTATION_RESIDUALS,
  projectTransitionPresentationActor,
  type PendingTransitionPresentationActor,
} from '../internal/transition-presentation';
import type { MountedPositionTransition } from '../internal/use-position-transition-runtime';
import type { PieceRenderers } from '../public-types';
import type { BoardSurfaceLayout } from './board-layout';
import { InteractionPieceVisual } from './interaction-piece-visual';
import {
  resolvePieceRenderer,
  resolvePieceTransitionAnimatedStyle,
  type PieceTransitionVisual,
} from './piece-layer';
import { useTransitionHostRetirement } from './use-transition-host-retirement';

interface PendingMoveLayerProps {
  readonly boardId: string;
  readonly layout: Readonly<BoardSurfaceLayout>;
  readonly lifecycle: Readonly<MoveIntentLifecycle> | null;
  readonly onPendingCommitActorPrepared?: (
    acknowledgement: Readonly<PendingCommitTransitionAcknowledgement>,
    prepared: boolean,
  ) => void;
  readonly pendingCommitPreparation?: Readonly<PendingCommitHandoffDescriptor> | null;
  readonly pendingCommitPreparationKind?: 'canonical-drain' | 'pending';
  readonly pieceRenderers: PieceRenderers;
  readonly style: Readonly<ViewStyle>;
  readonly transition?: Readonly<MountedPositionTransition> | null;
}

interface PendingHandoffHostDescriptor {
  readonly actor: Readonly<PendingTransitionPresentationActor>;
  readonly key: string;
  readonly left: number;
  readonly nativeDrainToken: string;
  readonly progress: SharedValue<number>;
  readonly renderer: NonNullable<ReturnType<typeof resolvePieceRenderer>>;
  readonly size: number;
  readonly top: number;
  readonly visual: Readonly<PieceTransitionVisual>;
}

interface PendingHandoffHostProps {
  readonly boardId: string;
  readonly descriptor: Readonly<PendingHandoffHostDescriptor>;
  readonly quiescent: boolean;
  readonly style: Readonly<ViewStyle>;
}

function PendingHandoffHost({
  boardId,
  descriptor,
  quiescent,
  style,
}: PendingHandoffHostProps): ReactElement | null {
  const animatedStyle = useAnimatedStyle(
    () =>
      resolvePieceTransitionAnimatedStyle(
        descriptor.visual,
        descriptor.progress.value,
        1,
      ),
    [descriptor.progress, descriptor.visual],
  );
  const { actor, left, renderer, size, top } = descriptor;
  const content =
    actor.rendererSource.kind === 'board' ? (
      <InteractionPieceVisual
        boardId={boardId}
        containerStyle={{ height: size, left: 0, top: 0, width: size }}
        kind="pending"
        piece={actor.piece}
        renderer={renderer}
        size={size}
        source={actor.rendererSource}
        square={actor.rendererSquare}
        style={style}
      />
    ) : (
      <InteractionPieceVisual
        boardId={boardId}
        containerStyle={{ height: size, left: 0, top: 0, width: size }}
        kind="pending"
        piece={actor.piece}
        renderer={renderer}
        size={size}
        source={actor.rendererSource}
        square={actor.rendererSquare}
        style={style}
      />
    );

  return (
    <Animated.View
      accessibilityElementsHidden
      accessible={false}
      collapsable={false}
      importantForAccessibility="no-hide-descendants"
      pointerEvents="none"
      style={[
        styles.handoffHost,
        { height: size, left, top, width: size },
        quiescent ? styles.quiescent : animatedStyle,
      ]}
    >
      {quiescent ? null : content}
    </Animated.View>
  );
}

const EMPTY_PENDING_ACTORS: readonly Readonly<PendingTransitionPresentationActor>[] =
  Object.freeze([]);

/** Residual cap plus the single correlated pending handoff actor. */
export const PENDING_MOVE_NATIVE_DRAIN_HOST_BUDGET =
  MAX_TRANSITION_PRESENTATION_RESIDUALS + 1;

/** Presentation-only copy at the requested target while consumer state waits. */
export function PendingMoveLayer({
  boardId,
  layout,
  lifecycle,
  onPendingCommitActorPrepared,
  pendingCommitPreparation = null,
  pendingCommitPreparationKind = 'pending',
  pieceRenderers,
  style,
  transition = null,
}: PendingMoveLayerProps): ReactElement | null {
  const pendingActors =
    transition?.presentation.pending ?? EMPTY_PENDING_ACTORS;
  const liveHandoffHosts = useMemo(() => {
    if (transition === null) {
      return Object.freeze([]);
    }
    const hosts: Readonly<PendingHandoffHostDescriptor>[] = [];
    for (const actor of pendingActors) {
      const cell = layout.cells.find(
        ({ square }) => square === actor.rendererSquare,
      );
      const renderer = resolvePieceRenderer(
        pieceRenderers,
        actor.piece.pieceType,
      );
      const projection = projectTransitionPresentationActor(actor, layout);
      if (cell === undefined || renderer === null || projection === null) {
        continue;
      }
      const size = Math.min(cell.rect.width, cell.rect.height);
      hosts.push(
        Object.freeze({
          actor,
          key: actor.actorKey,
          left: cell.rect.left + (cell.rect.width - size) / 2,
          nativeDrainToken: `transition:${String(transition.presentation.epoch)}`,
          progress: transition.progress,
          renderer,
          size,
          top: cell.rect.top + (cell.rect.height - size) / 2,
          visual: Object.freeze({ ...projection, kind: actor.kind }),
        }),
      );
    }
    return Object.freeze(hosts);
  }, [layout, pendingActors, pieceRenderers, transition]);
  const displayedHandoffHosts = useTransitionHostRetirement(
    liveHandoffHosts,
    PENDING_MOVE_NATIVE_DRAIN_HOST_BUDGET,
  ).filter(({ nativeDrain }) => nativeDrain);
  const directPreparationMatches =
    pendingCommitPreparation?.boardId === boardId &&
    pendingCommitPreparation.targetSquare !== null;
  const canonicalDrainActive =
    directPreparationMatches &&
    pendingCommitPreparationKind === 'canonical-drain';
  const preparedPendingActor = canonicalDrainActive
    ? undefined
    : displayedHandoffHosts.find(
        ({ descriptor, quiescent }) =>
          !quiescent && descriptor.actor.kind === 'pending-handoff',
      )?.descriptor.actor;
  useLayoutEffect(() => {
    if (
      preparedPendingActor === undefined ||
      transition === null ||
      onPendingCommitActorPrepared === undefined
    ) {
      return;
    }
    const acknowledgement = Object.freeze({
      actorKey: preparedPendingActor.actorKey,
      presentationEpoch: transition.presentation.epoch,
    });
    onPendingCommitActorPrepared(acknowledgement, true);
    return () => {
      onPendingCommitActorPrepared(acknowledgement, false);
    };
  }, [
    onPendingCommitActorPrepared,
    preparedPendingActor?.actorKey,
    transition?.presentation.epoch,
  ]);
  const candidateLiveLifecycle =
    lifecycle !== null &&
    (lifecycle.phase === 'deciding' || lifecycle.phase === 'awaiting-commit') &&
    lifecycle.intent.targetSquare !== null
      ? lifecycle
      : null;
  const liveLifecycle = canonicalDrainActive ? null : candidateLiveLifecycle;
  const preparedPendingCommit =
    liveLifecycle === null &&
    (canonicalDrainActive || preparedPendingActor === undefined) &&
    directPreparationMatches
      ? pendingCommitPreparation
      : null;
  const preparedVisualKind =
    preparedPendingCommit === null ? 'pending' : pendingCommitPreparationKind;
  const preparedVisualTestId =
    preparedPendingCommit === null ||
    preparedVisualKind !== 'canonical-drain' ||
    preparedPendingCommit.targetSquare === null
      ? undefined
      : `chessboard-native:${boardId}:canonical-drain:${preparedPendingCommit.targetSquare}`;
  if (
    liveLifecycle === null &&
    preparedPendingCommit === null &&
    displayedHandoffHosts.length === 0
  ) {
    return null;
  }

  const liveSource =
    liveLifecycle?.intent.source ?? preparedPendingCommit?.source ?? null;
  const livePiece =
    liveLifecycle?.intent.piece ?? preparedPendingCommit?.piece ?? null;
  const liveTargetSquare =
    liveLifecycle?.intent.targetSquare ??
    preparedPendingCommit?.targetSquare ??
    null;
  const liveCell =
    liveTargetSquare === null
      ? undefined
      : layout.cells.find(({ square }) => square === liveTargetSquare);
  const liveRenderer =
    livePiece === null
      ? null
      : resolvePieceRenderer(pieceRenderers, livePiece.pieceType);
  const liveSize =
    liveCell === undefined
      ? null
      : Math.min(liveCell.rect.width, liveCell.rect.height);
  const liveLeft =
    liveCell === undefined || liveSize === null
      ? null
      : liveCell.rect.left + (liveCell.rect.width - liveSize) / 2;
  const liveTop =
    liveCell === undefined || liveSize === null
      ? null
      : liveCell.rect.top + (liveCell.rect.height - liveSize) / 2;

  return (
    <View
      accessibilityElementsHidden
      accessible={false}
      importantForAccessibility="no-hide-descendants"
      pointerEvents="none"
      style={styles.layer}
    >
      {liveRenderer === null ||
      liveSize === null ||
      liveLeft === null ||
      liveTop === null ||
      liveTargetSquare === null ||
      liveSource === null ||
      livePiece === null ? null : liveSource.kind === 'board' ? (
        <InteractionPieceVisual
          boardId={boardId}
          containerStyle={{
            height: liveSize,
            left: liveLeft,
            top: liveTop,
            width: liveSize,
          }}
          kind={preparedVisualKind}
          piece={livePiece}
          renderer={liveRenderer}
          size={liveSize}
          source={liveSource}
          square={liveTargetSquare}
          style={style}
          {...(preparedVisualTestId === undefined
            ? {}
            : { testID: preparedVisualTestId })}
        />
      ) : (
        <InteractionPieceVisual
          boardId={boardId}
          containerStyle={{
            height: liveSize,
            left: liveLeft,
            top: liveTop,
            width: liveSize,
          }}
          kind={preparedVisualKind}
          piece={livePiece}
          renderer={liveRenderer}
          size={liveSize}
          source={liveSource}
          square={liveTargetSquare}
          style={style}
          {...(preparedVisualTestId === undefined
            ? {}
            : { testID: preparedVisualTestId })}
        />
      )}
      {displayedHandoffHosts.map(({ descriptor, quiescent }) => (
        <PendingHandoffHost
          boardId={boardId}
          descriptor={descriptor}
          key={descriptor.key}
          quiescent={canonicalDrainActive || quiescent}
          style={style}
        />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  handoffHost: {
    margin: 0,
    padding: 0,
    position: 'absolute',
  },
  layer: {
    bottom: 0,
    left: 0,
    position: 'absolute',
    right: 0,
    top: 0,
    zIndex: 50,
  },
  quiescent: {
    opacity: 0,
  },
});
