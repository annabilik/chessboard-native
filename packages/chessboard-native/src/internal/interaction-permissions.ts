import type {
  CanDragPiece,
  InteractionPermissions,
  OnMoveRequest,
  PieceInteractionContext,
} from '../public-types';

export interface ResolvedInteractionPermissions {
  readonly accessibility: boolean;
  readonly drag: boolean;
}

const DISABLED_PERMISSIONS: Readonly<ResolvedInteractionPermissions> =
  Object.freeze({ accessibility: false, drag: false });

/**
 * Resolve public move gates fail-closed. Drag cannot outlive its non-drag
 * accessibility alternative.
 */
export function resolveInteractionPermissions(
  onMoveRequest: OnMoveRequest | undefined,
  permissions: Readonly<InteractionPermissions> | undefined,
): Readonly<ResolvedInteractionPermissions> {
  if (typeof onMoveRequest !== 'function') {
    return DISABLED_PERMISSIONS;
  }

  try {
    const accessibility = permissions?.accessibility !== false;
    return Object.freeze({
      accessibility,
      drag: accessibility && permissions?.drag !== false,
    });
  } catch {
    return DISABLED_PERMISSIONS;
  }
}

/** Evaluate a consumer drag gate without allowing it to break the board. */
export function canDragCurrentPiece(
  canDragPiece: CanDragPiece | undefined,
  context: Readonly<PieceInteractionContext>,
): boolean {
  if (canDragPiece === undefined) {
    return true;
  }
  if (typeof canDragPiece !== 'function') {
    return false;
  }
  try {
    const allowed: unknown = canDragPiece(context);
    return allowed === true;
  } catch {
    return false;
  }
}
