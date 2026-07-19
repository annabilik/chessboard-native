import type { Revision } from '../../src/public-types';
import {
  createBoardLayoutOwnerToken,
  createBoardLayoutRegistry,
  type AcceptedBoardDropVerification,
  type BoardDropVerificationResult,
  type BoardLayoutGeometry,
  type BoardLayoutOwnerToken,
  type BoardLayoutRegistration,
  type BoardWindowBounds,
  type CanStartProviderSpareDrag,
  type MeasureBoardInWindow,
  type NotifyProviderSparePieceInteraction,
  type ProviderSpareMove,
  type RequestProviderSpareMove,
} from '../../src/internal/board-layout-registry';

type MeasurementCallback = Parameters<MeasureBoardInWindow>[0];

function deferredMeasurement() {
  const callbacks: MeasurementCallback[] = [];
  const measureInWindow: jest.MockedFunction<MeasureBoardInWindow> = jest.fn(
    (callback) => {
      callbacks.push(callback);
    },
  );

  return {
    callbacks,
    measureInWindow,
    respond(index: number, bounds: BoardWindowBounds): void {
      const callback = callbacks[index];
      if (callback === undefined) {
        throw new Error(`Missing measurement callback ${String(index)}.`);
      }
      callback(bounds.x, bounds.y, bounds.width, bounds.height);
    },
  };
}

function geometry(
  overrides: Partial<BoardLayoutGeometry> = {},
): BoardLayoutGeometry {
  return {
    dimensions: { columns: 8, rows: 8 },
    geometryEpoch: 3,
    layoutRevision: 5,
    orientation: 'white',
    ...overrides,
  };
}

function registration(options: {
  readonly allowDragOffBoard?: boolean;
  readonly available?: boolean;
  readonly boardId?: string;
  readonly geometry?: BoardLayoutGeometry;
  readonly dragActivationDistance?: number;
  readonly measureInWindow: MeasureBoardInWindow;
  readonly owner: BoardLayoutOwnerToken;
  readonly readMoveRequest?: () => RequestProviderSpareMove | null;
  readonly readSparePieceDragStart?: () => NotifyProviderSparePieceInteraction | null;
  readonly readSparePiecePress?: () => NotifyProviderSparePieceInteraction | null;
  readonly readPositionRevision?: () => Revision | null;
  readonly readSpareDragPermission?: () => CanStartProviderSpareDrag | null;
}): BoardLayoutRegistration {
  return {
    allowDragOffBoard: options.allowDragOffBoard ?? true,
    available: options.available ?? true,
    boardId: options.boardId ?? 'analysis',
    dragActivationDistance: options.dragActivationDistance ?? 4,
    geometry: options.geometry ?? geometry(),
    measureInWindow: options.measureInWindow,
    owner: options.owner,
    readMoveRequest: options.readMoveRequest ?? (() => null),
    readPositionRevision: options.readPositionRevision ?? (() => 11),
    readSparePieceDragStart: options.readSparePieceDragStart ?? (() => null),
    readSparePiecePress: options.readSparePiecePress ?? (() => null),
    readSpareDragPermission: options.readSpareDragPermission ?? (() => null),
  };
}

const spareSource = Object.freeze({
  kind: 'spare' as const,
  spareId: 'white-queen',
});
const sparePiece = Object.freeze({ id: 'palette-queen', pieceType: 'wQ' });

function providerSpareMove(
  overrides: Partial<ProviderSpareMove> = {},
): Readonly<ProviderSpareMove> {
  return {
    input: 'drag',
    piece: sparePiece,
    source: spareSource,
    targetSquare: 'a8',
    ...overrides,
  };
}

function providerSpareRequest(
  input: 'accessibility' | 'drag' | 'tap' = 'drag',
): Omit<ProviderSpareMove, 'targetSquare'> {
  return {
    input,
    piece: sparePiece,
    source: spareSource,
  };
}

function expectCancelled(
  result: Readonly<BoardDropVerificationResult>,
  reason: Extract<
    BoardDropVerificationResult,
    { status: 'cancelled' }
  >['reason'],
): void {
  expect(result).toEqual(
    expect.objectContaining({ reason, status: 'cancelled' }),
  );
}

function expectAccepted(
  result: Readonly<BoardDropVerificationResult>,
): asserts result is Readonly<AcceptedBoardDropVerification> {
  expect(result.status).toBe('accepted');
  if (result.status !== 'accepted') {
    throw new Error(`Expected an accepted result, received ${result.status}.`);
  }
}

describe('board layout registry', () => {
  it('keeps registration and unregistration owner-token safe', () => {
    const registry = createBoardLayoutRegistry();
    const firstOwner = createBoardLayoutOwnerToken();
    const duplicateOwner = createBoardLayoutOwnerToken();
    const firstMeasure = deferredMeasurement();
    const duplicateMeasure = deferredMeasurement();

    expect(
      registry.register(
        registration({
          measureInWindow: firstMeasure.measureInWindow,
          owner: firstOwner,
        }),
      ),
    ).toEqual({ boardId: 'analysis', status: 'registered' });
    expect(
      registry.register(
        registration({
          geometry: geometry({ geometryEpoch: 99 }),
          measureInWindow: duplicateMeasure.measureInWindow,
          owner: duplicateOwner,
        }),
      ),
    ).toEqual({ boardId: 'analysis', status: 'duplicate' });

    expect(
      registry.update('analysis', duplicateOwner, {
        geometry: geometry({ geometryEpoch: 100 }),
      }),
    ).toBe(false);
    expect(registry.unregister('analysis', duplicateOwner)).toBe(false);
    expect(registry.getBoardSnapshot('analysis')?.geometry.geometryEpoch).toBe(
      3,
    );

    expect(registry.unregister('analysis', firstOwner)).toBe(true);
    expect(
      registry.register(
        registration({
          geometry: geometry({ geometryEpoch: 99 }),
          measureInWindow: duplicateMeasure.measureInWindow,
          owner: duplicateOwner,
        }),
      ),
    ).toEqual({ boardId: 'analysis', status: 'registered' });
    expect(registry.getBoardSnapshot('analysis')?.geometry.geometryEpoch).toBe(
      99,
    );
  });

  it('does not let one owner register under two board IDs', () => {
    const registry = createBoardLayoutRegistry();
    const owner = createBoardLayoutOwnerToken();
    const measurement = deferredMeasurement();
    registry.register(
      registration({ measureInWindow: measurement.measureInWindow, owner }),
    );

    expect(
      registry.register(
        registration({
          boardId: 'other',
          measureInWindow: measurement.measureInWindow,
          owner,
        }),
      ),
    ).toEqual({
      boardId: 'other',
      registeredBoardId: 'analysis',
      status: 'owner-conflict',
    });
    expect(registry.getBoardSnapshot('other')).toBeNull();
  });

  it('reserves an unavailable board identity without authorizing hover or release', async () => {
    const registry = createBoardLayoutRegistry();
    const owner = createBoardLayoutOwnerToken();
    const measurement = deferredMeasurement();
    registry.register(
      registration({
        available: false,
        measureInWindow: measurement.measureInWindow,
        owner,
      }),
    );

    expect(registry.getBoardSnapshot('analysis')?.available).toBe(false);
    await expect(
      registry.refreshCachedBounds('analysis', owner),
    ).resolves.toBeNull();
    const unavailableSession = registry.beginDropSession({
      dropEpoch: 1,
      targetBoardId: 'analysis',
    });
    expectCancelled(
      await registry.verifyDrop(unavailableSession, { x: 5, y: 5 }),
      'board-missing',
    );
    expect(measurement.measureInWindow).not.toHaveBeenCalled();

    expect(registry.update('analysis', owner, { available: true })).toBe(true);
    expect(registry.getBoardSnapshot('analysis')?.available).toBe(true);
    const availableSession = registry.beginDropSession({
      dropEpoch: 2,
      targetBoardId: 'analysis',
    });
    const pending = registry.verifyDrop(availableSession, { x: 5, y: 5 });
    expect(measurement.measureInWindow).toHaveBeenCalledTimes(1);

    expect(registry.update('analysis', owner, { available: false })).toBe(true);
    expectCancelled(await pending, 'stale');
    measurement.respond(0, { height: 80, width: 80, x: 0, y: 0 });
    expect(registry.getBoardSnapshot('analysis')?.available).toBe(false);
    expect(registry.getBoardSnapshot('analysis')?.cachedBounds).toBeNull();
  });

  it('exposes only detached immutable layout diagnostics', async () => {
    const registry = createBoardLayoutRegistry();
    const owner = createBoardLayoutOwnerToken();
    const measurement = deferredMeasurement();
    const readPositionRevision = jest.fn(() => 4);
    registry.register(
      registration({
        measureInWindow: measurement.measureInWindow,
        owner,
        readPositionRevision,
      }),
    );

    const refresh = registry.refreshCachedBounds('analysis', owner);
    measurement.respond(0, { height: 80, width: 80, x: 10, y: 20 });
    await expect(refresh).resolves.toEqual({
      height: 80,
      width: 80,
      x: 10,
      y: 20,
    });

    const snapshot = registry.getBoardSnapshot('analysis');
    expect(snapshot).not.toBeNull();
    expect(Object.keys(snapshot ?? {}).sort()).toEqual([
      'available',
      'boardId',
      'cachedBounds',
      'geometry',
    ]);
    expect(snapshot).not.toHaveProperty('position');
    expect(snapshot).not.toHaveProperty('selection');
    expect(snapshot).not.toHaveProperty('annotations');
    expect(snapshot?.available).toBe(true);
    expect(Object.isFrozen(snapshot)).toBe(true);
    expect(Object.isFrozen(snapshot?.geometry)).toBe(true);
    expect(Object.isFrozen(snapshot?.geometry.dimensions)).toBe(true);
    expect(Object.isFrozen(snapshot?.cachedBounds)).toBe(true);
    expect(readPositionRevision).not.toHaveBeenCalled();
  });

  it('keeps only the newest correlated cached-bounds measurement', async () => {
    const registry = createBoardLayoutRegistry();
    const owner = createBoardLayoutOwnerToken();
    const measurement = deferredMeasurement();
    registry.register(
      registration({ measureInWindow: measurement.measureInWindow, owner }),
    );

    const staleRefresh = registry.refreshCachedBounds('analysis', owner);
    const currentRefresh = registry.refreshCachedBounds('analysis', owner);
    await expect(staleRefresh).resolves.toBeNull();
    measurement.respond(0, { height: 80, width: 80, x: 0, y: 0 });
    expect(registry.getBoardSnapshot('analysis')?.cachedBounds).toBeNull();
    measurement.respond(1, { height: 80, width: 80, x: 100, y: 200 });
    await expect(currentRefresh).resolves.toEqual({
      height: 80,
      width: 80,
      x: 100,
      y: 200,
    });
    expect(registry.getBoardSnapshot('analysis')?.cachedBounds).toEqual({
      height: 80,
      width: 80,
      x: 100,
      y: 200,
    });
  });

  it.each([
    {
      expectedBottomRight: 'd1',
      expectedTopLeft: 'a2',
      orientation: 'white' as const,
    },
    {
      expectedBottomRight: 'a2',
      expectedTopLeft: 'd1',
      orientation: 'black' as const,
    },
  ])(
    'maps cached rectangular $orientation hover with half-open bounds',
    async ({ expectedBottomRight, expectedTopLeft, orientation }) => {
      const registry = createBoardLayoutRegistry();
      const owner = createBoardLayoutOwnerToken();
      const measurement = deferredMeasurement();
      registry.register(
        registration({
          geometry: geometry({
            dimensions: { columns: 4, rows: 2 },
            orientation,
          }),
          measureInWindow: measurement.measureInWindow,
          owner,
        }),
      );
      const refresh = registry.refreshCachedBounds('analysis', owner);
      measurement.respond(0, {
        height: 200,
        width: 400,
        x: 100,
        y: 200,
      });
      await refresh;
      const session = registry.beginDropSession({
        dropEpoch: 7,
        targetBoardId: 'analysis',
      });

      expect(
        registry.getCachedHover(session, { x: 100, y: 200 })?.targetSquare,
      ).toBe(expectedTopLeft);
      expect(
        registry.getCachedHover(session, { x: 499.999, y: 399.999 })
          ?.targetSquare,
      ).toBe(expectedBottomRight);
      expect(
        registry.getCachedHover(session, { x: 200, y: 200 })?.targetSquare,
      ).toBe(orientation === 'white' ? 'b2' : 'c1');
      expect(registry.getCachedHover(session, { x: 500, y: 200 })).toBeNull();
      expect(registry.getCachedHover(session, { x: 100, y: 400 })).toBeNull();
    },
  );

  it('isolates an active target from unrelated board updates and unmounts', async () => {
    const registry = createBoardLayoutRegistry();
    const targetOwner = createBoardLayoutOwnerToken();
    const otherOwner = createBoardLayoutOwnerToken();
    const targetMeasurement = deferredMeasurement();
    const otherMeasurement = deferredMeasurement();
    registry.register(
      registration({
        measureInWindow: targetMeasurement.measureInWindow,
        owner: targetOwner,
      }),
    );
    registry.register(
      registration({
        boardId: 'other',
        measureInWindow: otherMeasurement.measureInWindow,
        owner: otherOwner,
      }),
    );
    const session = registry.beginDropSession({
      dropEpoch: 9,
      targetBoardId: 'analysis',
    });
    const verification = registry.verifyDrop(session, { x: 10, y: 10 });

    expect(
      registry.update('other', otherOwner, {
        geometry: geometry({ layoutRevision: 6 }),
      }),
    ).toBe(true);
    expect(registry.unregister('other', otherOwner)).toBe(true);
    targetMeasurement.respond(0, {
      height: 80,
      width: 80,
      x: 0,
      y: 0,
    });
    await expect(verification).resolves.toEqual(
      expect.objectContaining({
        boardId: 'analysis',
        dropEpoch: 9,
        status: 'accepted',
      }),
    );
  });

  it('[PARITY-BEHAVIOR-B20] always uses a fresh release measurement and reads the revision last', async () => {
    const registry = createBoardLayoutRegistry({
      providerGeometryRevision: 13,
    });
    const owner = createBoardLayoutOwnerToken();
    const measurement = deferredMeasurement();
    const readPositionRevision = jest.fn(() => 21);
    registry.register(
      registration({
        measureInWindow: measurement.measureInWindow,
        owner,
        readPositionRevision,
      }),
    );

    const refresh = registry.refreshCachedBounds('analysis', owner);
    measurement.respond(0, { height: 80, width: 80, x: 0, y: 0 });
    await refresh;
    const session = registry.beginDropSession({
      dropEpoch: 8,
      targetBoardId: 'analysis',
    });
    const verification = registry.verifyDrop(session, { x: 110, y: 110 });

    expect(measurement.measureInWindow).toHaveBeenCalledTimes(2);
    expect(readPositionRevision).not.toHaveBeenCalled();
    measurement.respond(1, { height: 80, width: 80, x: 100, y: 100 });
    await expect(verification).resolves.toEqual({
      boardId: 'analysis',
      bounds: { height: 80, width: 80, x: 100, y: 100 },
      dropEpoch: 8,
      geometryEpoch: 3,
      layoutRevision: 5,
      positionRevision: 21,
      providerGeometryRevision: 13,
      status: 'accepted',
      targetSquare: 'b7',
    });
    expect(readPositionRevision).toHaveBeenCalledTimes(1);

    const result = await verification;
    expect(Object.isFrozen(result)).toBe(true);
    expect(Object.isFrozen(result.status === 'accepted' && result.bounds)).toBe(
      true,
    );
  });

  it('snapshots release coordinates before asynchronous native measurement', async () => {
    const registry = createBoardLayoutRegistry();
    const owner = createBoardLayoutOwnerToken();
    const measurement = deferredMeasurement();
    registry.register(
      registration({ measureInWindow: measurement.measureInWindow, owner }),
    );
    const session = registry.beginDropSession({
      dropEpoch: 1,
      targetBoardId: 'analysis',
    });
    const point = { x: 5, y: 5 };
    const verification = registry.verifyDrop(session, point);

    point.x = 75;
    point.y = 75;
    measurement.respond(0, { height: 80, width: 80, x: 0, y: 0 });

    await expect(verification).resolves.toEqual(
      expect.objectContaining({ status: 'accepted', targetSquare: 'a8' }),
    );
  });

  it.each([
    { expected: 'a2', orientation: 'white' as const },
    { expected: 'd1', orientation: 'black' as const },
  ])(
    'freshly maps a synchronous rectangular $orientation release',
    async ({ expected, orientation }) => {
      const registry = createBoardLayoutRegistry();
      const owner = createBoardLayoutOwnerToken();
      const measureInWindow = jest.fn<undefined, [MeasurementCallback]>(
        (callback) => {
          callback(100, 200, 400, 200);
        },
      );
      registry.register(
        registration({
          geometry: geometry({
            dimensions: { columns: 4, rows: 2 },
            orientation,
          }),
          measureInWindow,
          owner,
        }),
      );
      const session = registry.beginDropSession({
        dropEpoch: 12,
        targetBoardId: 'analysis',
      });

      await expect(
        registry.verifyDrop(session, { x: 150, y: 250 }),
      ).resolves.toEqual(
        expect.objectContaining({
          status: 'accepted',
          targetSquare: expected,
        }),
      );
      expect(measureInWindow).toHaveBeenCalledTimes(1);
    },
  );

  it('accepts a freshly measured off-board point as a null target', async () => {
    const registry = createBoardLayoutRegistry();
    const owner = createBoardLayoutOwnerToken();
    const measurement = deferredMeasurement();
    registry.register(
      registration({ measureInWindow: measurement.measureInWindow, owner }),
    );
    const session = registry.beginDropSession({
      dropEpoch: 1,
      targetBoardId: 'analysis',
    });
    const verification = registry.verifyDrop(session, { x: 90, y: 40 });
    measurement.respond(0, { height: 80, width: 80, x: 100, y: 20 });

    await expect(verification).resolves.toEqual(
      expect.objectContaining({ status: 'accepted', targetSquare: null }),
    );
  });

  it('fails closed for invalid points, bounds, and position revisions', async () => {
    const registry = createBoardLayoutRegistry();
    const owner = createBoardLayoutOwnerToken();
    const measurement = deferredMeasurement();
    const readPositionRevision = jest.fn<Revision | null, []>(() => null);
    registry.register(
      registration({
        measureInWindow: measurement.measureInWindow,
        owner,
        readPositionRevision,
      }),
    );

    const invalidPointSession = registry.beginDropSession({
      dropEpoch: 1,
      targetBoardId: 'analysis',
    });
    const invalidPoint = registry.verifyDrop(invalidPointSession, {
      x: Number.NaN,
      y: 10,
    });
    expectCancelled(await invalidPoint, 'invalid-point');
    expect(measurement.measureInWindow).not.toHaveBeenCalled();
    expect(readPositionRevision).not.toHaveBeenCalled();

    const invalidBoundsSession = registry.beginDropSession({
      dropEpoch: 2,
      targetBoardId: 'analysis',
    });
    const invalidBounds = registry.verifyDrop(invalidBoundsSession, {
      x: 10,
      y: 10,
    });
    measurement.respond(0, { height: 80, width: 0, x: 0, y: 0 });
    expectCancelled(await invalidBounds, 'measurement-failed');
    expect(readPositionRevision).not.toHaveBeenCalled();

    const invalidRevisionSession = registry.beginDropSession({
      dropEpoch: 3,
      targetBoardId: 'analysis',
    });
    const invalidRevision = registry.verifyDrop(invalidRevisionSession, {
      x: 10,
      y: 10,
    });
    measurement.respond(1, { height: 80, width: 80, x: 0, y: 0 });
    expectCancelled(await invalidRevision, 'position-unavailable');
    expect(readPositionRevision).toHaveBeenCalledTimes(1);
  });

  it('uses the commit-current revision accessor after measurement verification', async () => {
    const registry = createBoardLayoutRegistry();
    const owner = createBoardLayoutOwnerToken();
    const measurement = deferredMeasurement();
    const staleReader = jest.fn(() => 1);
    const currentReader = jest.fn(() => 9);
    registry.register(
      registration({
        measureInWindow: measurement.measureInWindow,
        owner,
        readPositionRevision: staleReader,
      }),
    );
    const session = registry.beginDropSession({
      dropEpoch: 4,
      targetBoardId: 'analysis',
    });
    const verification = registry.verifyDrop(session, { x: 10, y: 10 });
    expect(
      registry.update('analysis', owner, {
        readPositionRevision: currentReader,
      }),
    ).toBe(true);
    measurement.respond(0, { height: 80, width: 80, x: 0, y: 0 });

    await expect(verification).resolves.toEqual(
      expect.objectContaining({ positionRevision: 9, status: 'accepted' }),
    );
    expect(staleReader).not.toHaveBeenCalled();
    expect(currentReader).toHaveBeenCalledTimes(1);
  });

  it('uses commit-current target authority when preflighting a spare drag', () => {
    const registry = createBoardLayoutRegistry();
    const owner = createBoardLayoutOwnerToken();
    const measurement = deferredMeasurement();
    const stalePermission = jest.fn<
      ReturnType<CanStartProviderSpareDrag>,
      Parameters<CanStartProviderSpareDrag>
    >(() => false);
    const currentPermission = jest.fn<
      ReturnType<CanStartProviderSpareDrag>,
      Parameters<CanStartProviderSpareDrag>
    >(() => true);
    const staleReader = jest.fn(() => stalePermission);
    const currentReader = jest.fn(() => currentPermission);
    registry.register(
      registration({
        measureInWindow: measurement.measureInWindow,
        owner,
        readSpareDragPermission: staleReader,
      }),
    );

    expect(
      registry.update('analysis', owner, {
        readSpareDragPermission: currentReader,
      }),
    ).toBe(true);
    expect(
      registry.canStartSpareDrag('analysis', spareSource, sparePiece),
    ).toBe(true);
    expect(staleReader).not.toHaveBeenCalled();
    expect(stalePermission).not.toHaveBeenCalled();
    expect(currentReader).toHaveBeenCalledTimes(1);
    expect(currentPermission).toHaveBeenCalledWith(spareSource, sparePiece);
  });

  it('fails spare-drag preflight closed for missing authority and exceptions', () => {
    const registry = createBoardLayoutRegistry();
    const owner = createBoardLayoutOwnerToken();
    const measurement = deferredMeasurement();
    const throwingReader = jest.fn((): CanStartProviderSpareDrag | null => {
      throw new Error('permission accessor failed');
    });
    const throwingPermission: CanStartProviderSpareDrag = () => {
      throw new Error('permission failed');
    };
    registry.register(
      registration({
        measureInWindow: measurement.measureInWindow,
        owner,
        readSpareDragPermission: throwingReader,
      }),
    );

    expect(
      registry.canStartSpareDrag('analysis', spareSource, sparePiece),
    ).toBe(false);
    expect(throwingReader).toHaveBeenCalledTimes(1);

    expect(
      registry.update('analysis', owner, {
        readSpareDragPermission: () => throwingPermission,
      }),
    ).toBe(true);
    expect(
      registry.canStartSpareDrag('analysis', spareSource, sparePiece),
    ).toBe(false);

    expect(
      registry.update('analysis', owner, {
        readSpareDragPermission: () => null,
      }),
    ).toBe(true);
    expect(
      registry.canStartSpareDrag('analysis', spareSource, sparePiece),
    ).toBe(false);
    expect(registry.canStartSpareDrag('missing', spareSource, sparePiece)).toBe(
      false,
    );

    expect(registry.update('analysis', owner, { available: false })).toBe(true);
    expect(
      registry.canStartSpareDrag('analysis', spareSource, sparePiece),
    ).toBe(false);
  });

  it('invokes the commit-current target adapter after a successful verification', async () => {
    const registry = createBoardLayoutRegistry();
    const owner = createBoardLayoutOwnerToken();
    const measurement = deferredMeasurement();
    const staleRequest = jest.fn(() => true);
    const currentRequest: jest.MockedFunction<RequestProviderSpareMove> =
      jest.fn((move) => {
        void move;
        return true;
      });
    const staleReader = jest.fn(() => staleRequest);
    const currentReader = jest.fn(() => currentRequest);
    registry.register(
      registration({
        measureInWindow: measurement.measureInWindow,
        owner,
        readMoveRequest: staleReader,
      }),
    );
    const session = registry.beginDropSession({
      dropEpoch: 20,
      targetBoardId: 'analysis',
    });
    const pending = registry.verifyDrop(session, { x: 5, y: 5 });
    measurement.respond(0, { height: 80, width: 80, x: 0, y: 0 });
    const verification = await pending;
    expectAccepted(verification);

    expect(
      registry.update('analysis', owner, { readMoveRequest: currentReader }),
    ).toBe(true);
    expect(
      registry.requestVerifiedDrop(
        session,
        verification,
        providerSpareRequest(),
      ),
    ).toBe(true);
    expect(staleReader).not.toHaveBeenCalled();
    expect(staleRequest).not.toHaveBeenCalled();
    expect(currentReader).toHaveBeenCalledTimes(1);
    expect(currentRequest).toHaveBeenCalledWith({
      input: 'drag',
      piece: { id: 'palette-queen', pieceType: 'wQ' },
      source: { kind: 'spare', spareId: 'white-queen' },
      targetSquare: 'a8',
    });
    const emitted = currentRequest.mock.calls[0]?.[0];
    expect(Object.isFrozen(emitted)).toBe(true);
    expect(Object.isFrozen(emitted?.piece)).toBe(true);
    expect(Object.isFrozen(emitted?.source)).toBe(true);
  });

  it('requires the exact session and verification capability and consumes it once', async () => {
    const registry = createBoardLayoutRegistry();
    const owner = createBoardLayoutOwnerToken();
    const request: jest.MockedFunction<RequestProviderSpareMove> = jest.fn(
      (move) => {
        void move;
        return true;
      },
    );
    const measureInWindow: MeasureBoardInWindow = (callback) => {
      callback(0, 0, 80, 80);
    };
    registry.register(
      registration({
        measureInWindow,
        owner,
        readMoveRequest: () => request,
      }),
    );
    const oldSession = registry.beginDropSession({
      dropEpoch: 19,
      targetBoardId: 'analysis',
    });
    const session = registry.beginDropSession({
      dropEpoch: 20,
      targetBoardId: 'analysis',
    });
    const verification = await registry.verifyDrop(session, { x: 5, y: 5 });
    expectAccepted(verification);
    const lookalike = Object.freeze({
      ...verification,
    }) as Readonly<AcceptedBoardDropVerification>;

    expect(
      registry.requestVerifiedDrop(
        oldSession,
        verification,
        providerSpareRequest(),
      ),
    ).toBe(false);
    expect(
      registry.requestVerifiedDrop(session, lookalike, providerSpareRequest()),
    ).toBe(false);
    expect(request).not.toHaveBeenCalled();

    expect(
      registry.requestVerifiedDrop(
        session,
        verification,
        providerSpareRequest(),
      ),
    ).toBe(true);
    expect(
      registry.requestVerifiedDrop(
        session,
        verification,
        providerSpareRequest(),
      ),
    ).toBe(false);
    expect(request).toHaveBeenCalledTimes(1);
  });

  it('rejects an accepted verification after target layout authority becomes stale', async () => {
    const registry = createBoardLayoutRegistry();
    const owner = createBoardLayoutOwnerToken();
    const request: jest.MockedFunction<RequestProviderSpareMove> = jest.fn(
      (move) => {
        void move;
        return true;
      },
    );
    const measureInWindow: MeasureBoardInWindow = (callback) => {
      callback(0, 0, 80, 80);
    };
    registry.register(
      registration({
        measureInWindow,
        owner,
        readMoveRequest: () => request,
      }),
    );
    const session = registry.beginDropSession({
      dropEpoch: 21,
      targetBoardId: 'analysis',
    });
    const verification = await registry.verifyDrop(session, { x: 5, y: 5 });
    expectAccepted(verification);

    expect(
      registry.update('analysis', owner, {
        geometry: geometry({ layoutRevision: 6 }),
      }),
    ).toBe(true);
    expect(
      registry.requestVerifiedDrop(
        session,
        verification,
        providerSpareRequest(),
      ),
    ).toBe(false);
    expect(request).not.toHaveBeenCalled();
  });

  it('passes a freshly verified off-board null target to the move adapter', async () => {
    const registry = createBoardLayoutRegistry();
    const owner = createBoardLayoutOwnerToken();
    const measurement = deferredMeasurement();
    const request: jest.MockedFunction<RequestProviderSpareMove> = jest.fn(
      (move) => {
        void move;
        return true;
      },
    );
    registry.register(
      registration({
        measureInWindow: measurement.measureInWindow,
        owner,
        readMoveRequest: () => request,
      }),
    );
    const session = registry.beginDropSession({
      dropEpoch: 22,
      targetBoardId: 'analysis',
    });
    const pending = registry.verifyDrop(session, { x: 90, y: 40 });
    measurement.respond(0, { height: 80, width: 80, x: 100, y: 20 });
    const verification = await pending;
    expectAccepted(verification);
    expect(verification.targetSquare).toBeNull();

    expect(
      registry.requestVerifiedDrop(
        session,
        verification,
        providerSpareRequest(),
      ),
    ).toBe(true);
    expect(request).toHaveBeenCalledWith(
      expect.objectContaining({ input: 'drag', targetSquare: null }),
    );
  });

  it.each(['accessibility', 'tap'] as const)(
    'routes a selected-spare %s request through the commit-current adapter',
    (input) => {
      const registry = createBoardLayoutRegistry();
      const owner = createBoardLayoutOwnerToken();
      const measurement = deferredMeasurement();
      const readPositionRevision = jest.fn(() => 12);
      const staleRequest = jest.fn(() => true);
      const currentRequest: jest.MockedFunction<RequestProviderSpareMove> =
        jest.fn((move) => {
          void move;
          return true;
        });
      const staleReader = jest.fn(() => staleRequest);
      const currentReader = jest.fn(() => currentRequest);
      registry.register(
        registration({
          measureInWindow: measurement.measureInWindow,
          owner,
          readMoveRequest: staleReader,
          readPositionRevision,
        }),
      );

      expect(
        registry.update('analysis', owner, { readMoveRequest: currentReader }),
      ).toBe(true);
      const move = providerSpareMove({ input, targetSquare: 'h1' });
      expect(registry.requestSelectedSpare('analysis', move)).toBe(true);
      expect(staleReader).not.toHaveBeenCalled();
      expect(staleRequest).not.toHaveBeenCalled();
      expect(currentReader).toHaveBeenCalledTimes(1);
      expect(currentRequest).toHaveBeenCalledWith({
        input,
        piece: { id: 'palette-queen', pieceType: 'wQ' },
        source: { kind: 'spare', spareId: 'white-queen' },
        targetSquare: 'h1',
      });
      expect(readPositionRevision).not.toHaveBeenCalled();
      expect(registry.requestSelectedSpare('missing', move)).toBe(false);
    },
  );

  it('fails accessible spare routing closed when current adapter access throws', () => {
    const registry = createBoardLayoutRegistry();
    const owner = createBoardLayoutOwnerToken();
    const measurement = deferredMeasurement();
    registry.register(
      registration({
        measureInWindow: measurement.measureInWindow,
        owner,
        readMoveRequest: () => {
          throw new Error('adapter accessor failed');
        },
      }),
    );

    expect(
      registry.requestSelectedSpare(
        'analysis',
        providerSpareMove({ input: 'accessibility' }),
      ),
    ).toBe(false);
    expect(
      registry.update('analysis', owner, {
        readMoveRequest: () => () => {
          throw new Error('adapter failed');
        },
      }),
    ).toBe(true);
    expect(
      registry.requestSelectedSpare(
        'analysis',
        providerSpareMove({ input: 'accessibility' }),
      ),
    ).toBe(false);
  });

  it.each([
    {
      invalidate: (
        registry: ReturnType<typeof createBoardLayoutRegistry>,
        owner: BoardLayoutOwnerToken,
      ) =>
        registry.update('analysis', owner, {
          geometry: geometry({ geometryEpoch: 4 }),
        }),
      name: 'board geometry epoch',
    },
    {
      invalidate: (
        registry: ReturnType<typeof createBoardLayoutRegistry>,
        owner: BoardLayoutOwnerToken,
      ) =>
        registry.update('analysis', owner, {
          geometry: geometry({ layoutRevision: 6 }),
        }),
      name: 'layout revision',
    },
    {
      invalidate: (
        registry: ReturnType<typeof createBoardLayoutRegistry>,
        owner: BoardLayoutOwnerToken,
      ) => {
        void owner;
        registry.setProviderGeometryRevision(1);
      },
      name: 'provider geometry revision',
    },
  ])(
    'makes a late callback inert after $name changes',
    async ({ invalidate }) => {
      const registry = createBoardLayoutRegistry();
      const owner = createBoardLayoutOwnerToken();
      const measurement = deferredMeasurement();
      const readPositionRevision = jest.fn(() => 3);
      registry.register(
        registration({
          measureInWindow: measurement.measureInWindow,
          owner,
          readPositionRevision,
        }),
      );
      const session = registry.beginDropSession({
        dropEpoch: 2,
        targetBoardId: 'analysis',
      });
      const verification = registry.verifyDrop(session, { x: 10, y: 10 });

      invalidate(registry, owner);
      expectCancelled(await verification, 'stale');
      measurement.respond(0, { height: 80, width: 80, x: 0, y: 0 });
      expect(readPositionRevision).not.toHaveBeenCalled();
    },
  );

  it('invalidates an old drop epoch and ignores its late measurement', async () => {
    const registry = createBoardLayoutRegistry();
    const owner = createBoardLayoutOwnerToken();
    const measurement = deferredMeasurement();
    const readPositionRevision = jest.fn(() => 6);
    registry.register(
      registration({
        measureInWindow: measurement.measureInWindow,
        owner,
        readPositionRevision,
      }),
    );
    const firstSession = registry.beginDropSession({
      dropEpoch: 1,
      targetBoardId: 'analysis',
    });
    const first = registry.verifyDrop(firstSession, { x: 10, y: 10 });
    const secondSession = registry.beginDropSession({
      dropEpoch: 2,
      targetBoardId: 'analysis',
    });

    expectCancelled(await first, 'stale');
    measurement.respond(0, { height: 80, width: 80, x: 0, y: 0 });
    expect(readPositionRevision).not.toHaveBeenCalled();

    const second = registry.verifyDrop(secondSession, { x: 10, y: 10 });
    measurement.respond(1, { height: 80, width: 80, x: 0, y: 0 });
    await expect(second).resolves.toEqual(
      expect.objectContaining({ dropEpoch: 2, status: 'accepted' }),
    );
  });

  it('does not revive a verification when the same board ID remounts', async () => {
    const registry = createBoardLayoutRegistry();
    const firstOwner = createBoardLayoutOwnerToken();
    const nextOwner = createBoardLayoutOwnerToken();
    const firstMeasurement = deferredMeasurement();
    const nextMeasurement = deferredMeasurement();
    const nextReader = jest.fn(() => 8);
    registry.register(
      registration({
        measureInWindow: firstMeasurement.measureInWindow,
        owner: firstOwner,
      }),
    );
    const session = registry.beginDropSession({
      dropEpoch: 5,
      targetBoardId: 'analysis',
    });
    const verification = registry.verifyDrop(session, { x: 10, y: 10 });

    registry.unregister('analysis', firstOwner);
    registry.register(
      registration({
        measureInWindow: nextMeasurement.measureInWindow,
        owner: nextOwner,
        readPositionRevision: nextReader,
      }),
    );
    expectCancelled(await verification, 'stale');
    firstMeasurement.respond(0, { height: 80, width: 80, x: 0, y: 0 });
    expect(nextReader).not.toHaveBeenCalled();
    expect(registry.getCachedHover(session, { x: 10, y: 10 })).toBeNull();
  });

  it('correlates multiple release measurements within one session', async () => {
    const registry = createBoardLayoutRegistry();
    const owner = createBoardLayoutOwnerToken();
    const measurement = deferredMeasurement();
    const readPositionRevision = jest.fn(() => 2);
    registry.register(
      registration({
        measureInWindow: measurement.measureInWindow,
        owner,
        readPositionRevision,
      }),
    );
    const session = registry.beginDropSession({
      dropEpoch: 3,
      targetBoardId: 'analysis',
    });
    const first = registry.verifyDrop(session, { x: 10, y: 10 });
    const second = registry.verifyDrop(session, { x: 20, y: 20 });

    expectCancelled(await first, 'stale');
    measurement.respond(0, { height: 80, width: 80, x: 0, y: 0 });
    expect(readPositionRevision).not.toHaveBeenCalled();
    measurement.respond(1, { height: 80, width: 80, x: 0, y: 0 });
    await expect(second).resolves.toEqual(
      expect.objectContaining({ status: 'accepted', targetSquare: 'c6' }),
    );
    expect(readPositionRevision).toHaveBeenCalledTimes(1);
  });

  it('times out verification and leaves a late callback inert', async () => {
    jest.useFakeTimers();
    try {
      const registry = createBoardLayoutRegistry({
        verificationTimeoutMs: 20,
      });
      const owner = createBoardLayoutOwnerToken();
      const measurement = deferredMeasurement();
      const readPositionRevision = jest.fn(() => 1);
      registry.register(
        registration({
          measureInWindow: measurement.measureInWindow,
          owner,
          readPositionRevision,
        }),
      );
      const session = registry.beginDropSession({
        dropEpoch: 1,
        targetBoardId: 'analysis',
      });
      const verification = registry.verifyDrop(session, { x: 10, y: 10 });

      jest.advanceTimersByTime(20);
      expectCancelled(await verification, 'measurement-timeout');
      measurement.respond(0, { height: 80, width: 80, x: 0, y: 0 });
      expect(readPositionRevision).not.toHaveBeenCalled();
    } finally {
      jest.useRealTimers();
    }
  });

  it('fails closed after measurement-token exhaustion', async () => {
    const registry = createBoardLayoutRegistry({
      initialMeasurementToken: Number.MAX_SAFE_INTEGER,
    });
    const owner = createBoardLayoutOwnerToken();
    const measurement = deferredMeasurement();
    registry.register(
      registration({ measureInWindow: measurement.measureInWindow, owner }),
    );
    const session = registry.beginDropSession({
      dropEpoch: 1,
      targetBoardId: 'analysis',
    });
    const first = registry.verifyDrop(session, { x: 10, y: 10 });
    measurement.respond(0, { height: 80, width: 80, x: 0, y: 0 });
    await expect(first).resolves.toEqual(
      expect.objectContaining({ status: 'accepted' }),
    );

    expectCancelled(
      await registry.verifyDrop(session, { x: 10, y: 10 }),
      'token-exhausted',
    );
    expect(measurement.measureInWindow).toHaveBeenCalledTimes(1);
  });

  it('fails closed when measurement throws or the target is absent', async () => {
    const registry = createBoardLayoutRegistry();
    const missingSession = registry.beginDropSession({
      dropEpoch: 1,
      targetBoardId: 'missing',
    });
    expectCancelled(
      await registry.verifyDrop(missingSession, { x: 1, y: 1 }),
      'board-missing',
    );

    const owner = createBoardLayoutOwnerToken();
    const throwingMeasure: MeasureBoardInWindow = () => {
      throw new Error('native host unavailable');
    };
    registry.register(
      registration({ measureInWindow: throwingMeasure, owner }),
    );
    const throwingSession = registry.beginDropSession({
      dropEpoch: 2,
      targetBoardId: 'analysis',
    });
    expectCancelled(
      await registry.verifyDrop(throwingSession, { x: 1, y: 1 }),
      'measurement-failed',
    );
  });

  it('cancels pending work and rejects new registration after disposal', async () => {
    const registry = createBoardLayoutRegistry();
    const owner = createBoardLayoutOwnerToken();
    const measurement = deferredMeasurement();
    const readPositionRevision = jest.fn(() => 1);
    const entry = registration({
      measureInWindow: measurement.measureInWindow,
      owner,
      readPositionRevision,
    });
    registry.register(entry);
    const session = registry.beginDropSession({
      dropEpoch: 1,
      targetBoardId: 'analysis',
    });
    const verification = registry.verifyDrop(session, { x: 1, y: 1 });

    registry.dispose();
    expectCancelled(await verification, 'disposed');
    measurement.respond(0, { height: 80, width: 80, x: 0, y: 0 });
    expect(readPositionRevision).not.toHaveBeenCalled();
    expect(() => registry.register(entry)).toThrow('disposed');
  });

  it('cancelTransient invalidates pending measurement while preserving registration and fresh recovery', async () => {
    const registry = createBoardLayoutRegistry();
    const owner = createBoardLayoutOwnerToken();
    const measurement = deferredMeasurement();
    registry.register(
      registration({ measureInWindow: measurement.measureInWindow, owner }),
    );
    const session = registry.beginDropSession({
      dropEpoch: 1,
      targetBoardId: 'analysis',
    });
    const pending = registry.verifyDrop(session, { x: 10, y: 10 });

    registry.cancelTransient();

    expectCancelled(await pending, 'stale');
    expect(registry.getBoardSnapshot('analysis')).toEqual(
      expect.objectContaining({
        available: true,
        boardId: 'analysis',
        cachedBounds: null,
      }),
    );
    measurement.respond(0, { height: 80, width: 80, x: 0, y: 0 });
    expect(registry.getBoardSnapshot('analysis')?.cachedBounds).toBeNull();

    const freshSession = registry.beginDropSession({
      dropEpoch: 2,
      targetBoardId: 'analysis',
    });
    const freshVerification = registry.verifyDrop(freshSession, {
      x: 10,
      y: 10,
    });
    measurement.respond(1, { height: 80, width: 80, x: 0, y: 0 });
    expectAccepted(await freshVerification);
  });

  it('publishes only targeted activation-distance changes and unregisters the configuration', () => {
    const registry = createBoardLayoutRegistry();
    const owner = createBoardLayoutOwnerToken();
    const variationOwner = createBoardLayoutOwnerToken();
    const measurement = deferredMeasurement();
    const listener = jest.fn();
    const variationListener = jest.fn();
    const unsubscribeThrowing = registry.subscribeBoardConfiguration(
      'analysis',
      () => {
        throw new Error('observer failed');
      },
    );
    const unsubscribe = registry.subscribeBoardConfiguration(
      'analysis',
      listener,
    );
    registry.subscribeBoardConfiguration('variation', variationListener);

    expect(registry.getSpareDragActivationDistance('analysis')).toBeNull();
    expect(registry.getSpareAllowDragOffBoard('analysis')).toBeNull();
    expect(registry.getSpareGestureConfigurationEpoch('analysis')).toBe(0);
    expect(() =>
      registry.register(
        registration({ measureInWindow: measurement.measureInWindow, owner }),
      ),
    ).not.toThrow();
    const registeredEpoch =
      registry.getSpareGestureConfigurationEpoch('analysis');
    expect(registeredEpoch).toBeGreaterThan(0);
    expect(registry.getSpareDragActivationDistance('analysis')).toBe(4);
    expect(registry.getSpareAllowDragOffBoard('analysis')).toBe(true);
    expect(listener).toHaveBeenCalledTimes(1);
    expect(variationListener).not.toHaveBeenCalled();

    expect(
      registry.update('analysis', owner, { dragActivationDistance: 12.5 }),
    ).toBe(true);
    const updatedEpoch = registry.getSpareGestureConfigurationEpoch('analysis');
    expect(updatedEpoch).toBeGreaterThan(registeredEpoch);
    expect(registry.getSpareDragActivationDistance('analysis')).toBe(12.5);
    expect(listener).toHaveBeenCalledTimes(2);

    expect(
      registry.update('analysis', owner, { dragActivationDistance: 12.5 }),
    ).toBe(true);
    expect(registry.getSpareGestureConfigurationEpoch('analysis')).toBe(
      updatedEpoch,
    );
    expect(listener).toHaveBeenCalledTimes(2);
    expect(
      registry.update('analysis', owner, { dragActivationDistance: 0 }),
    ).toBe(true);
    expect(registry.getSpareDragActivationDistance('analysis')).toBe(0);
    expect(listener).toHaveBeenCalledTimes(3);

    expect(
      registry.update('analysis', variationOwner, {
        dragActivationDistance: 8,
      }),
    ).toBe(false);
    expect(listener).toHaveBeenCalledTimes(3);
    registry.register(
      registration({
        boardId: 'variation',
        dragActivationDistance: 9,
        measureInWindow: measurement.measureInWindow,
        owner: variationOwner,
      }),
    );
    expect(variationListener).toHaveBeenCalledTimes(1);
    expect(listener).toHaveBeenCalledTimes(3);

    expect(registry.unregister('analysis', variationOwner)).toBe(false);
    expect(registry.unregister('analysis', owner)).toBe(true);
    const unregisteredEpoch =
      registry.getSpareGestureConfigurationEpoch('analysis');
    expect(unregisteredEpoch).toBeGreaterThan(updatedEpoch);
    expect(registry.getSpareDragActivationDistance('analysis')).toBeNull();
    expect(registry.getSpareAllowDragOffBoard('analysis')).toBeNull();
    expect(listener).toHaveBeenCalledTimes(4);

    unsubscribe();
    unsubscribeThrowing();
    registry.register(
      registration({
        dragActivationDistance: 6,
        measureInWindow: measurement.measureInWindow,
        owner: createBoardLayoutOwnerToken(),
      }),
    );
    expect(
      registry.getSpareGestureConfigurationEpoch('analysis'),
    ).toBeGreaterThan(unregisteredEpoch);
    expect(listener).toHaveBeenCalledTimes(4);
  });

  it('publishes only real target drag-bounds policy changes', () => {
    const registry = createBoardLayoutRegistry();
    const owner = createBoardLayoutOwnerToken();
    const measurement = deferredMeasurement();
    const listener = jest.fn();
    registry.subscribeBoardConfiguration('analysis', listener);
    registry.register(
      registration({ measureInWindow: measurement.measureInWindow, owner }),
    );
    const registeredEpoch =
      registry.getSpareGestureConfigurationEpoch('analysis');

    expect(registry.getSpareAllowDragOffBoard('analysis')).toBe(true);
    expect(listener).toHaveBeenCalledTimes(1);
    expect(
      registry.update('analysis', owner, { allowDragOffBoard: false }),
    ).toBe(true);
    const updatedEpoch = registry.getSpareGestureConfigurationEpoch('analysis');
    expect(updatedEpoch).toBeGreaterThan(registeredEpoch);
    expect(registry.getSpareAllowDragOffBoard('analysis')).toBe(false);
    expect(listener).toHaveBeenCalledTimes(2);

    expect(
      registry.update('analysis', owner, { allowDragOffBoard: false }),
    ).toBe(true);
    expect(registry.getSpareGestureConfigurationEpoch('analysis')).toBe(
      updatedEpoch,
    );
    expect(listener).toHaveBeenCalledTimes(2);

    expect(() =>
      registry.update('analysis', owner, {
        allowDragOffBoard: 'false' as never,
      }),
    ).toThrow('allowDragOffBoard must be a boolean.');
  });

  it('routes targeted spare press and drag-start notifications through current readers with detached inputs', () => {
    const registry = createBoardLayoutRegistry();
    const owner = createBoardLayoutOwnerToken();
    const measurement = deferredMeasurement();
    const firstPress = jest.fn<
      boolean,
      Parameters<NotifyProviderSparePieceInteraction>
    >(() => true);
    const replacementPress = jest.fn<
      boolean,
      Parameters<NotifyProviderSparePieceInteraction>
    >(() => true);
    const firstDragStart = jest.fn<
      boolean,
      Parameters<NotifyProviderSparePieceInteraction>
    >(() => true);
    const replacementDragStart = jest.fn<
      boolean,
      Parameters<NotifyProviderSparePieceInteraction>
    >(() => true);
    let currentPress: NotifyProviderSparePieceInteraction | null = firstPress;
    let currentDragStart: NotifyProviderSparePieceInteraction | null =
      firstDragStart;
    const readSparePiecePress = jest.fn(() => currentPress);
    const readSparePieceDragStart = jest.fn(() => currentDragStart);
    registry.register(
      registration({
        measureInWindow: measurement.measureInWindow,
        owner,
        readSparePieceDragStart,
        readSparePiecePress,
      }),
    );
    const source: { kind: 'spare'; spareId: string } = {
      kind: 'spare',
      spareId: 'palette-source',
    };
    const piece: { id: string; pieceType: string } = {
      id: 'palette-piece',
      pieceType: 'wQ',
    };

    expect(registry.notifySparePiecePress('analysis', source, piece)).toBe(
      true,
    );
    expect(registry.notifySparePieceDragStart('analysis', source, piece)).toBe(
      true,
    );
    expect(firstPress).toHaveBeenCalledTimes(1);
    expect(firstDragStart).toHaveBeenCalledTimes(1);
    const [pressSource, pressPiece] = firstPress.mock.calls[0] ?? [];
    const [dragSource, dragPiece] = firstDragStart.mock.calls[0] ?? [];
    expect(pressSource).toEqual(source);
    expect(pressPiece).toEqual(piece);
    expect(dragSource).toEqual(source);
    expect(dragPiece).toEqual(piece);
    expect(pressSource).not.toBe(source);
    expect(pressPiece).not.toBe(piece);
    expect(dragSource).not.toBe(source);
    expect(dragPiece).not.toBe(piece);
    expect(Object.isFrozen(pressSource)).toBe(true);
    expect(Object.isFrozen(pressPiece)).toBe(true);
    expect(Object.isFrozen(dragSource)).toBe(true);
    expect(Object.isFrozen(dragPiece)).toBe(true);

    source.spareId = 'mutated-source';
    piece.pieceType = 'bR';
    expect(pressSource).toEqual({ kind: 'spare', spareId: 'palette-source' });
    expect(pressPiece).toEqual({ id: 'palette-piece', pieceType: 'wQ' });

    currentPress = replacementPress;
    currentDragStart = replacementDragStart;
    expect(
      registry.notifySparePiecePress('analysis', spareSource, sparePiece),
    ).toBe(true);
    expect(
      registry.notifySparePieceDragStart('analysis', spareSource, sparePiece),
    ).toBe(true);
    expect(replacementPress).toHaveBeenCalledTimes(1);
    expect(replacementDragStart).toHaveBeenCalledTimes(1);
    expect(readSparePiecePress).toHaveBeenCalledTimes(2);
    expect(readSparePieceDragStart).toHaveBeenCalledTimes(2);

    currentPress = null;
    currentDragStart = null;
    expect(
      registry.notifySparePiecePress('analysis', spareSource, sparePiece),
    ).toBe(false);
    expect(
      registry.notifySparePieceDragStart('analysis', spareSource, sparePiece),
    ).toBe(false);
  });

  it('isolates targeted spare notification reader and callback failures', () => {
    const registry = createBoardLayoutRegistry();
    const owner = createBoardLayoutOwnerToken();
    const measurement = deferredMeasurement();
    registry.register(
      registration({
        measureInWindow: measurement.measureInWindow,
        owner,
        readSparePieceDragStart: () => {
          throw new Error('reader failed');
        },
        readSparePiecePress: () => () => {
          throw new Error('callback failed');
        },
      }),
    );

    expect(() =>
      registry.notifySparePiecePress('analysis', spareSource, sparePiece),
    ).not.toThrow();
    expect(
      registry.notifySparePiecePress('analysis', spareSource, sparePiece),
    ).toBe(false);
    expect(() =>
      registry.notifySparePieceDragStart('analysis', spareSource, sparePiece),
    ).not.toThrow();
    expect(
      registry.notifySparePieceDragStart('analysis', spareSource, sparePiece),
    ).toBe(false);

    expect(
      registry.update('analysis', owner, {
        readSparePieceDragStart: () => () => false,
        readSparePiecePress: () => () => undefined as never,
      }),
    ).toBe(true);
    expect(
      registry.notifySparePiecePress('analysis', spareSource, sparePiece),
    ).toBe(false);
    expect(
      registry.notifySparePieceDragStart('analysis', spareSource, sparePiece),
    ).toBe(false);

    registry.dispose();
    expect(
      registry.notifySparePiecePress('analysis', spareSource, sparePiece),
    ).toBe(false);
    expect(
      registry.notifySparePieceDragStart('analysis', spareSource, sparePiece),
    ).toBe(false);
  });

  it('deactivates transient work without preventing a later registration', async () => {
    const registry = createBoardLayoutRegistry();
    const owner = createBoardLayoutOwnerToken();
    const replacementOwner = createBoardLayoutOwnerToken();
    const measurement = deferredMeasurement();
    registry.register(
      registration({ measureInWindow: measurement.measureInWindow, owner }),
    );
    const session = registry.beginDropSession({
      dropEpoch: 1,
      targetBoardId: 'analysis',
    });
    const verification = registry.verifyDrop(session, { x: 1, y: 1 });

    registry.deactivate();
    expectCancelled(await verification, 'stale');
    expect(registry.getBoardSnapshot('analysis')).toBeNull();
    expect(
      registry.register(
        registration({
          measureInWindow: measurement.measureInWindow,
          owner: replacementOwner,
        }),
      ),
    ).toEqual({ boardId: 'analysis', status: 'registered' });
  });
});
