import type { RefObject } from 'react';
import type { View } from 'react-native';

import type {
  BoardLayoutOwnerToken,
  BoardLayoutRegistry,
} from './board-layout-registry';
import type { ProviderDragCancellationReason } from './provider-drag-coordinator';

/** Commit-correlated bridge from one board surface to its nearest provider. */
export interface ProviderBoardRegistration {
  readonly boardId: string;
  readonly cancelActiveDrag: (
    reason: ProviderDragCancellationReason,
  ) => boolean;
  readonly hostRef: RefObject<View | null>;
  readonly owner: BoardLayoutOwnerToken;
  readonly registered: boolean;
  readonly registry: BoardLayoutRegistry;
}
