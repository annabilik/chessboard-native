import { AccessibilityInfo } from 'react-native';

import type {
  ChessboardAccessibility,
  MoveOutcomeAccessibilityContext,
} from '../public-types';

/** English fallback for a terminal move-request presentation outcome. */
export function formatDefaultMoveOutcome(
  context: Readonly<MoveOutcomeAccessibilityContext>,
): string {
  switch (context.outcome) {
    case 'committed':
      return 'Move committed.';
    case 'rejected':
      return context.reason === undefined
        ? 'Move rejected.'
        : `Move rejected: ${context.reason}`;
    case 'cancelled':
      return 'Move cancelled.';
    case 'timed-out':
      return 'Move request timed out.';
  }
}

/** Queue one reducer-correlated terminal outcome for assistive technology. */
export function announceMoveOutcome(
  context: Readonly<MoveOutcomeAccessibilityContext>,
  formatter: ChessboardAccessibility['formatMoveOutcome'] | undefined,
): void {
  const fallback = formatDefaultMoveOutcome(context);
  let formatted: string | null | undefined;
  try {
    formatted = formatter?.(context);
  } catch {
    formatted = undefined;
  }
  if (formatted === null) {
    return;
  }
  const trimmed = formatted?.trim();
  const message =
    trimmed === undefined || trimmed.length === 0 ? fallback : trimmed;
  AccessibilityInfo.announceForAccessibilityWithOptions(message, {
    queue: true,
  });
}
