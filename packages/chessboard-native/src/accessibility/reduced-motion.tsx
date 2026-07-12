import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactElement,
  type ReactNode,
} from 'react';
import { AccessibilityInfo } from 'react-native';

import type { ReduceMotion } from '../public-types';

interface ReducedMotionSnapshot {
  readonly preference: ReduceMotion;
  readonly systemValue: boolean;
}

interface ReducedMotionProviderProps {
  readonly children: ReactNode;
  readonly preference: ReduceMotion;
}

const ReducedMotionContext = createContext(true);

export function resolveReducedMotion(
  preference: ReduceMotion,
  systemValue: boolean,
): boolean {
  switch (preference) {
    case 'always':
      return true;
    case 'never':
      return false;
    case 'system':
      return systemValue;
  }
}

function useResolvedReducedMotion(preference: ReduceMotion): boolean {
  const [snapshot, setSnapshot] = useState<ReducedMotionSnapshot>(() => ({
    preference,
    systemValue: true,
  }));
  let currentSnapshot = snapshot;

  if (snapshot.preference !== preference) {
    currentSnapshot = { preference, systemValue: true };
    setSnapshot(currentSnapshot);
  }

  useEffect(() => {
    if (preference !== 'system') {
      return undefined;
    }

    let active = true;
    let eventVersion = 0;
    const queryVersion = eventVersion;
    const subscription = AccessibilityInfo.addEventListener(
      'reduceMotionChanged',
      (value) => {
        if (!active) {
          return;
        }
        eventVersion += 1;
        setSnapshot((previous) =>
          previous.preference !== 'system' || previous.systemValue === value
            ? previous
            : { preference: 'system', systemValue: value },
        );
      },
    );

    void AccessibilityInfo.isReduceMotionEnabled().then(
      (value) => {
        if (!active || eventVersion !== queryVersion) {
          return;
        }
        setSnapshot((previous) =>
          previous.preference !== 'system' || previous.systemValue === value
            ? previous
            : { preference: 'system', systemValue: value },
        );
      },
      () => {
        // The fail-safe initial value remains reduced when the native query fails.
      },
    );

    return () => {
      active = false;
      subscription.remove();
    };
  }, [preference]);

  return resolveReducedMotion(preference, currentSnapshot.systemValue);
}

/** Internal source of truth for every present and future animation path. */
export function ReducedMotionProvider({
  children,
  preference,
}: ReducedMotionProviderProps): ReactElement {
  const reducedMotion = useResolvedReducedMotion(preference);
  return (
    <ReducedMotionContext.Provider value={reducedMotion}>
      {children}
    </ReducedMotionContext.Provider>
  );
}

/** Internal hook for visual layers; semantic timeouts never consume this value. */
export function useReducedMotion(): boolean {
  return useContext(ReducedMotionContext);
}
