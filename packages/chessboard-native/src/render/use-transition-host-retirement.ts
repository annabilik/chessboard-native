import { useCallback, useLayoutEffect, useMemo, useRef, useState } from 'react';

export interface KeyedTransitionHostDescriptor {
  readonly key: string;
}

export interface DisplayedTransitionHost<
  Descriptor extends KeyedTransitionHostDescriptor,
> {
  readonly descriptor: Readonly<Descriptor>;
  readonly quiescent: boolean;
}

interface TransitionHostRetirement<
  Descriptor extends KeyedTransitionHostDescriptor,
> {
  readonly descriptor: Readonly<Descriptor>;
  firstFrame: number | null;
  secondFrame: number | null;
}

function keyedDescriptors<Descriptor extends KeyedTransitionHostDescriptor>(
  descriptors: readonly Readonly<Descriptor>[],
): ReadonlyMap<string, Readonly<Descriptor>> {
  const keyed = new Map<string, Readonly<Descriptor>>();
  for (const descriptor of descriptors) {
    if (keyed.has(descriptor.key)) {
      throw new Error(
        `Transition host descriptor key ${JSON.stringify(descriptor.key)} is duplicated.`,
      );
    }
    keyed.set(descriptor.key, descriptor);
  }
  return keyed;
}

/**
 * Keep disappearing animated hosts mounted through a quiescent native commit.
 *
 * The retained map contains only descriptors from committed renders. A newly
 * missing key is therefore available to the same render that first omits it,
 * without mutating a ref that an abandoned concurrent render could leak. The
 * caller must render quiescent entries under their exact descriptor key while
 * omitting every animated style and renderer child.
 */
export function useTransitionHostRetirement<
  Descriptor extends KeyedTransitionHostDescriptor,
>(
  liveDescriptors: readonly Readonly<Descriptor>[],
): readonly Readonly<DisplayedTransitionHost<Descriptor>>[] {
  const liveByKey = useMemo(
    () => keyedDescriptors(liveDescriptors),
    [liveDescriptors],
  );
  const [retirementRevision, setRetirementRevision] = useState(0);
  const retainedByKeyRef = useRef(new Map<string, Readonly<Descriptor>>());
  const committedLiveByKeyRef = useRef(liveByKey);
  const mountedRef = useRef(false);
  const retirementsRef = useRef(
    new Map<string, TransitionHostRetirement<Descriptor>>(),
  );

  const cancelRetirement = useCallback((key: string): void => {
    const retirement = retirementsRef.current.get(key);
    if (retirement === undefined) {
      return;
    }
    retirementsRef.current.delete(key);
    if (retirement.firstFrame !== null) {
      cancelAnimationFrame(retirement.firstFrame);
    }
    if (retirement.secondFrame !== null) {
      cancelAnimationFrame(retirement.secondFrame);
    }
  }, []);

  const cancelAllRetirements = useCallback((): void => {
    for (const key of retirementsRef.current.keys()) {
      cancelRetirement(key);
    }
  }, [cancelRetirement]);

  useLayoutEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      cancelAllRetirements();
      committedLiveByKeyRef.current = new Map();
      retainedByKeyRef.current.clear();
    };
  }, [cancelAllRetirements]);

  useLayoutEffect(() => {
    committedLiveByKeyRef.current = liveByKey;

    for (const key of liveByKey.keys()) {
      cancelRetirement(key);
    }

    for (const [key, descriptor] of liveByKey) {
      retainedByKeyRef.current.set(key, descriptor);
    }

    for (const [key, descriptor] of retainedByKeyRef.current) {
      if (liveByKey.has(key) || retirementsRef.current.has(key)) {
        continue;
      }
      const retirement: TransitionHostRetirement<Descriptor> = {
        descriptor,
        firstFrame: null,
        secondFrame: null,
      };
      retirementsRef.current.set(key, retirement);
      retirement.firstFrame = requestAnimationFrame(() => {
        if (
          !mountedRef.current ||
          retirementsRef.current.get(key) !== retirement ||
          committedLiveByKeyRef.current.has(key)
        ) {
          return;
        }
        retirement.firstFrame = null;
        retirement.secondFrame = requestAnimationFrame(() => {
          if (
            !mountedRef.current ||
            retirementsRef.current.get(key) !== retirement ||
            committedLiveByKeyRef.current.has(key)
          ) {
            return;
          }
          retirement.secondFrame = null;
          retirementsRef.current.delete(key);
          if (retainedByKeyRef.current.get(key) !== retirement.descriptor) {
            return;
          }
          retainedByKeyRef.current.delete(key);
          setRetirementRevision((revision) => revision + 1);
        });
      });
    }
  }, [cancelRetirement, liveByKey]);

  return useMemo(() => {
    const displayed: Readonly<DisplayedTransitionHost<Descriptor>>[] = [];
    for (const descriptor of liveByKey.values()) {
      displayed.push(Object.freeze({ descriptor, quiescent: false }));
    }
    for (const [key, descriptor] of retainedByKeyRef.current) {
      if (!liveByKey.has(key)) {
        displayed.push(Object.freeze({ descriptor, quiescent: true }));
      }
    }
    return Object.freeze(displayed);
  }, [liveByKey, retirementRevision]);
}
