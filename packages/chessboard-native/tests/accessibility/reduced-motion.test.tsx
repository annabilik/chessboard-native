import { act, render, screen } from '@testing-library/react-native';
import { useState, type Dispatch, type SetStateAction } from 'react';
import { AccessibilityInfo, Text } from 'react-native';

import {
  ReducedMotionProvider,
  resolveReducedMotion,
  useReducedMotion,
} from '../../src/accessibility/reduced-motion';
import type { ReduceMotion } from '../../src/public-types';

function deferred<Value>(): Readonly<{
  promise: Promise<Value>;
  resolve: (value: Value) => void;
}> {
  let resolvePromise: ((value: Value) => void) | undefined;
  const promise = new Promise<Value>((resolve) => {
    resolvePromise = resolve;
  });
  return {
    promise,
    resolve: (value) => {
      if (resolvePromise === undefined) {
        throw new Error('Deferred promise was not initialized.');
      }
      resolvePromise(value);
    },
  };
}

function Probe(): React.ReactElement {
  return <Text>{useReducedMotion() ? 'reduced' : 'full'}</Text>;
}

describe('reduced-motion policy', () => {
  it('resolves explicit preferences without consulting the system value', () => {
    expect(resolveReducedMotion('always', false)).toBe(true);
    expect(resolveReducedMotion('always', true)).toBe(true);
    expect(resolveReducedMotion('never', false)).toBe(false);
    expect(resolveReducedMotion('never', true)).toBe(false);
    expect(resolveReducedMotion('system', false)).toBe(false);
    expect(resolveReducedMotion('system', true)).toBe(true);
  });

  it('defaults system mode to reduced, then follows the native query and events', async () => {
    const query = deferred<boolean>();
    let listener: ((value: boolean) => void) | undefined;
    const remove = jest.fn();
    jest
      .spyOn(AccessibilityInfo, 'isReduceMotionEnabled')
      .mockReturnValue(query.promise);
    jest
      .spyOn(AccessibilityInfo, 'addEventListener')
      .mockImplementation((eventName, handler) => {
        expect(eventName).toBe('reduceMotionChanged');
        listener = handler as unknown as (value: boolean) => void;
        return { remove } as never;
      });

    const result = await render(
      <ReducedMotionProvider preference="system">
        <Probe />
      </ReducedMotionProvider>,
    );
    expect(screen.getByText('reduced')).toBeOnTheScreen();

    await act(() => {
      query.resolve(false);
      return query.promise;
    });
    expect(screen.getByText('full')).toBeOnTheScreen();

    await act(() => {
      listener?.(true);
    });
    expect(screen.getByText('reduced')).toBeOnTheScreen();

    await result.unmount();
    expect(remove).toHaveBeenCalledTimes(1);
  });

  it('lets a newer native event win over a stale system query', async () => {
    const query = deferred<boolean>();
    let listener: ((value: boolean) => void) | undefined;
    jest
      .spyOn(AccessibilityInfo, 'isReduceMotionEnabled')
      .mockReturnValue(query.promise);
    jest
      .spyOn(AccessibilityInfo, 'addEventListener')
      .mockImplementation((_eventName, handler) => {
        listener = handler as unknown as (value: boolean) => void;
        return { remove: jest.fn() } as never;
      });

    await render(
      <ReducedMotionProvider preference="system">
        <Probe />
      </ReducedMotionProvider>,
    );
    await act(() => {
      listener?.(false);
    });
    expect(screen.getByText('full')).toBeOnTheScreen();

    await act(() => {
      query.resolve(true);
      return query.promise;
    });
    expect(screen.getByText('full')).toBeOnTheScreen();
  });

  it('does not subscribe for explicit modes and resets safely when entering system mode', async () => {
    const query = deferred<boolean>();
    let setPreference: Dispatch<SetStateAction<ReduceMotion>> = () => {
      throw new Error('Preference harness did not render.');
    };
    const addEventListener = jest
      .spyOn(AccessibilityInfo, 'addEventListener')
      .mockReturnValue({ remove: jest.fn() } as never);
    const isReduceMotionEnabled = jest
      .spyOn(AccessibilityInfo, 'isReduceMotionEnabled')
      .mockReturnValue(query.promise);

    function Harness(): React.ReactElement {
      const [preference, updatePreference] = useState<ReduceMotion>('never');
      setPreference = updatePreference;
      return (
        <ReducedMotionProvider preference={preference}>
          <Probe />
        </ReducedMotionProvider>
      );
    }

    await render(<Harness />);
    expect(screen.getByText('full')).toBeOnTheScreen();
    expect(addEventListener).not.toHaveBeenCalled();
    expect(isReduceMotionEnabled).not.toHaveBeenCalled();

    await act(() => {
      setPreference('always');
    });
    expect(screen.getByText('reduced')).toBeOnTheScreen();
    expect(addEventListener).not.toHaveBeenCalled();
    expect(isReduceMotionEnabled).not.toHaveBeenCalled();

    await act(() => {
      setPreference('system');
    });
    expect(screen.getByText('reduced')).toBeOnTheScreen();
    expect(addEventListener).toHaveBeenCalledTimes(1);
    expect(isReduceMotionEnabled).toHaveBeenCalledTimes(1);

    await act(() => {
      query.resolve(false);
      return query.promise;
    });
    expect(screen.getByText('full')).toBeOnTheScreen();
  });

  it('ignores a removed listener and re-enters system mode with the reduced fail-safe', async () => {
    const firstQuery = deferred<boolean>();
    const secondQuery = deferred<boolean>();
    const listeners: ((value: boolean) => void)[] = [];
    const remove = jest.fn();
    let setPreference: Dispatch<SetStateAction<ReduceMotion>> = () => {
      throw new Error('Preference harness did not render.');
    };
    jest
      .spyOn(AccessibilityInfo, 'isReduceMotionEnabled')
      .mockReturnValueOnce(firstQuery.promise)
      .mockReturnValueOnce(secondQuery.promise);
    jest
      .spyOn(AccessibilityInfo, 'addEventListener')
      .mockImplementation((_eventName, handler) => {
        listeners.push(handler as unknown as (value: boolean) => void);
        return { remove } as never;
      });

    function Harness(): React.ReactElement {
      const [preference, updatePreference] = useState<ReduceMotion>('system');
      setPreference = updatePreference;
      return (
        <ReducedMotionProvider preference={preference}>
          <Probe />
        </ReducedMotionProvider>
      );
    }

    await render(<Harness />);
    expect(screen.getByText('reduced')).toBeOnTheScreen();
    expect(listeners).toHaveLength(1);

    await act(() => {
      setPreference('never');
    });
    expect(screen.getByText('full')).toBeOnTheScreen();
    expect(remove).toHaveBeenCalledTimes(1);

    await act(() => {
      firstQuery.resolve(true);
      return firstQuery.promise;
    });
    expect(screen.getByText('full')).toBeOnTheScreen();

    await act(() => {
      listeners[0]?.(false);
    });
    await act(() => {
      setPreference('system');
    });
    expect(screen.getByText('reduced')).toBeOnTheScreen();
    expect(listeners).toHaveLength(2);

    await act(() => {
      secondQuery.resolve(false);
      return secondQuery.promise;
    });
    expect(screen.getByText('full')).toBeOnTheScreen();
  });

  it('does not let a synchronous subscription event get overwritten by the query', async () => {
    const query = deferred<boolean>();
    jest
      .spyOn(AccessibilityInfo, 'isReduceMotionEnabled')
      .mockReturnValue(query.promise);
    jest
      .spyOn(AccessibilityInfo, 'addEventListener')
      .mockImplementation((_eventName, handler) => {
        (handler as unknown as (value: boolean) => void)(false);
        return { remove: jest.fn() } as never;
      });

    await render(
      <ReducedMotionProvider preference="system">
        <Probe />
      </ReducedMotionProvider>,
    );
    expect(screen.getByText('full')).toBeOnTheScreen();

    await act(() => {
      query.resolve(true);
      return query.promise;
    });
    expect(screen.getByText('full')).toBeOnTheScreen();
  });

  it('ignores a system query that resolves after unmount', async () => {
    const query = deferred<boolean>();
    const remove = jest.fn();
    jest
      .spyOn(AccessibilityInfo, 'isReduceMotionEnabled')
      .mockReturnValue(query.promise);
    jest
      .spyOn(AccessibilityInfo, 'addEventListener')
      .mockReturnValue({ remove } as never);
    const result = await render(
      <ReducedMotionProvider preference="system">
        <Probe />
      </ReducedMotionProvider>,
    );

    await result.unmount();
    await act(() => {
      query.resolve(false);
      return query.promise;
    });
    expect(remove).toHaveBeenCalledTimes(1);
  });

  it('stays reduced when the native system query rejects', async () => {
    jest
      .spyOn(AccessibilityInfo, 'isReduceMotionEnabled')
      .mockRejectedValue(new Error('native unavailable'));
    jest
      .spyOn(AccessibilityInfo, 'addEventListener')
      .mockReturnValue({ remove: jest.fn() } as never);

    await render(
      <ReducedMotionProvider preference="system">
        <Probe />
      </ReducedMotionProvider>,
    );
    await act(async () => {
      await Promise.resolve();
    });
    expect(screen.getByText('reduced')).toBeOnTheScreen();
  });
});
