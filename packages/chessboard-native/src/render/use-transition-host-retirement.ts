import { useCallback, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Platform } from 'react-native';

/**
 * Reanimated 4.5 retains settled Android Fabric props for two seconds and
 * polls that registry every 500 ms. Keep a conservative extra polling window
 * before an admitted animated native tag can disappear.
 */
export const ANDROID_TRANSITION_HOST_NATIVE_DRAIN_MS = 3_000;

export interface KeyedTransitionHostDescriptor {
  readonly key: string;
  /** One mounted transition epoch, or null when this host is static. */
  readonly nativeDrainToken: string | null;
}

export interface DisplayedTransitionHost<
  Descriptor extends KeyedTransitionHostDescriptor,
> {
  readonly descriptor: Readonly<Descriptor>;
  /** True only when this exact native-host lifetime may attach animated props. */
  readonly nativeDrain: boolean;
  readonly quiescent: boolean;
}

interface StaticHostAdmission {
  readonly kind: 'static';
}

interface DeniedHostAdmission {
  readonly kind: 'denied';
  readonly token: string;
}

interface AdmittedHostAdmission {
  readonly kind: 'admitted';
}

type TransitionHostAdmission =
  AdmittedHostAdmission | DeniedHostAdmission | StaticHostAdmission;

interface RetainedTransitionHost<
  Descriptor extends KeyedTransitionHostDescriptor,
> {
  readonly admission: Readonly<TransitionHostAdmission>;
  readonly descriptor: Readonly<Descriptor>;
}

interface TransitionHostRetirement<
  Descriptor extends KeyedTransitionHostDescriptor,
> {
  readonly retained: Readonly<RetainedTransitionHost<Descriptor>>;
  drainTimer: ReturnType<typeof setTimeout> | null;
  firstFrame: number | null;
  secondFrame: number | null;
}

const STATIC_ADMISSION: Readonly<StaticHostAdmission> = Object.freeze({
  kind: 'static',
});
const ADMITTED: Readonly<AdmittedHostAdmission> = Object.freeze({
  kind: 'admitted',
});

export function transitionHostNativeDrainMs(platform: string): number {
  return platform === 'android' ? ANDROID_TRANSITION_HOST_NATIVE_DRAIN_MS : 0;
}

function validateNativeDrainHostBudget(value: number): number {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new RangeError(
      'Transition native-drain host budget must be a non-negative safe integer.',
    );
  }
  return value;
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

function deniedAdmission(token: string): Readonly<DeniedHostAdmission> {
  return Object.freeze({ kind: 'denied', token });
}

function projectLiveAdmissions<
  Descriptor extends KeyedTransitionHostDescriptor,
>(
  retainedByKey: ReadonlyMap<
    string,
    Readonly<RetainedTransitionHost<Descriptor>>
  >,
  liveByKey: ReadonlyMap<string, Readonly<Descriptor>>,
  maximumNativeDrainHosts: number,
): ReadonlyMap<string, Readonly<TransitionHostAdmission>> {
  let admittedCount = 0;
  for (const retained of retainedByKey.values()) {
    if (retained.admission.kind === 'admitted') {
      admittedCount += 1;
    }
  }

  const projected = new Map<string, Readonly<TransitionHostAdmission>>();
  for (const [key, descriptor] of liveByKey) {
    const prior = retainedByKey.get(key)?.admission;
    if (prior?.kind === 'admitted') {
      projected.set(key, prior);
      continue;
    }

    const token = descriptor.nativeDrainToken;
    if (token === null) {
      projected.set(key, prior ?? STATIC_ADMISSION);
      continue;
    }
    if (prior?.kind === 'denied' && prior.token === token) {
      projected.set(key, prior);
      continue;
    }
    if (admittedCount < maximumNativeDrainHosts) {
      admittedCount += 1;
      projected.set(key, ADMITTED);
      continue;
    }
    projected.set(key, deniedAdmission(token));
  }
  return projected;
}

/**
 * Keep admitted animated hosts mounted until Reanimated's Android registry can
 * no longer replay their synchronous props. Admission is bounded across both
 * live and retiring hosts. Overflow actors remain static for their exact epoch
 * and retire after only two guarded frames because they never attach an
 * animated style or native view descriptor.
 *
 * All render-time projections read committed refs without mutating them; an
 * abandoned concurrent render therefore cannot consume admission capacity or
 * leak a descriptor into the next committed render.
 */
export function useTransitionHostRetirement<
  Descriptor extends KeyedTransitionHostDescriptor,
>(
  liveDescriptors: readonly Readonly<Descriptor>[],
  maximumNativeDrainHosts: number,
  nativeDrainMs = transitionHostNativeDrainMs(Platform.OS),
): readonly Readonly<DisplayedTransitionHost<Descriptor>>[] {
  const configuredNativeDrainHostBudget = validateNativeDrainHostBudget(
    maximumNativeDrainHosts,
  );
  const nativeDrainHostBudget =
    nativeDrainMs === 0
      ? Number.MAX_SAFE_INTEGER
      : configuredNativeDrainHostBudget;
  const liveByKey = useMemo(
    () => keyedDescriptors(liveDescriptors),
    [liveDescriptors],
  );
  const [retirementRevision, setRetirementRevision] = useState(0);
  const retainedByKeyRef = useRef(
    new Map<string, Readonly<RetainedTransitionHost<Descriptor>>>(),
  );
  const committedLiveByKeyRef = useRef(liveByKey);
  const mountedRef = useRef(false);
  const retirementsRef = useRef(
    new Map<string, TransitionHostRetirement<Descriptor>>(),
  );
  const liveAdmissions = useMemo(
    () =>
      projectLiveAdmissions(
        retainedByKeyRef.current,
        liveByKey,
        nativeDrainHostBudget,
      ),
    [liveByKey, nativeDrainHostBudget, retirementRevision],
  );

  const cancelRetirement = useCallback((key: string): void => {
    const retirement = retirementsRef.current.get(key);
    if (retirement === undefined) {
      return;
    }
    retirementsRef.current.delete(key);
    if (retirement.drainTimer !== null) {
      clearTimeout(retirement.drainTimer);
    }
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
      const admission = liveAdmissions.get(key);
      if (admission === undefined) {
        throw new Error('Transition host admission projection is incomplete.');
      }
      retainedByKeyRef.current.set(
        key,
        Object.freeze({ admission, descriptor }),
      );
    }

    for (const [key, retained] of retainedByKeyRef.current) {
      if (liveByKey.has(key) || retirementsRef.current.has(key)) {
        continue;
      }
      const retirement: TransitionHostRetirement<Descriptor> = {
        retained,
        drainTimer: null,
        firstFrame: null,
        secondFrame: null,
      };
      retirementsRef.current.set(key, retirement);
      const scheduleRemovalFrames = (): void => {
        if (
          !mountedRef.current ||
          retirementsRef.current.get(key) !== retirement ||
          committedLiveByKeyRef.current.has(key)
        ) {
          return;
        }
        retirement.drainTimer = null;
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
            if (retainedByKeyRef.current.get(key) !== retirement.retained) {
              return;
            }
            retainedByKeyRef.current.delete(key);
            setRetirementRevision((revision) => revision + 1);
          });
        });
      };
      if (retained.admission.kind !== 'admitted' || nativeDrainMs === 0) {
        scheduleRemovalFrames();
      } else {
        retirement.drainTimer = setTimeout(
          scheduleRemovalFrames,
          nativeDrainMs,
        );
      }
    }
  }, [cancelRetirement, liveAdmissions, liveByKey, nativeDrainMs]);

  return useMemo(() => {
    const displayed: Readonly<DisplayedTransitionHost<Descriptor>>[] = [];
    for (const [key, descriptor] of liveByKey) {
      const admission = liveAdmissions.get(key);
      if (admission === undefined) {
        throw new Error('Transition host admission projection is incomplete.');
      }
      displayed.push(
        Object.freeze({
          descriptor,
          nativeDrain: admission.kind === 'admitted',
          quiescent: false,
        }),
      );
    }
    for (const [key, retained] of retainedByKeyRef.current) {
      if (!liveByKey.has(key)) {
        displayed.push(
          Object.freeze({
            descriptor: retained.descriptor,
            nativeDrain: retained.admission.kind === 'admitted',
            quiescent: true,
          }),
        );
      }
    }
    return Object.freeze(displayed);
  }, [liveAdmissions, liveByKey, retirementRevision]);
}
