import { useEffect, useRef } from 'react';
import { AccessibilityInfo } from 'react-native';

import type { ChessboardAccessibility } from '../public-types';

/** Speak each consumer correlation ID at most once during one board mount. */
export function useAccessibilityAnnouncement(
  announcement: ChessboardAccessibility['announcement'] | undefined,
): void {
  const announcedIds = useRef(new Set<string>());
  const id = announcement?.id;
  const message = announcement?.message;

  useEffect(() => {
    if (
      id === undefined ||
      message === undefined ||
      id.trim().length === 0 ||
      message.trim().length === 0 ||
      announcedIds.current.has(id)
    ) {
      return;
    }

    announcedIds.current.add(id);
    AccessibilityInfo.announceForAccessibilityWithOptions(message.trim(), {
      queue: true,
    });
  }, [id, message]);
}
