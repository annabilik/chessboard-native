import { hitTestBoardPoint } from '../core/hit-test';
import {
  validateBoardDimensions,
  validateOrientation,
  type ValidatedBoardDimensions,
} from '../core/dimensions';
import type {
  BoardDimensions,
  BoardOrientation,
  MoveInput,
  PieceData,
  Revision,
  SquareId,
} from '../public-types';

declare const boardLayoutOwnerTokenBrand: unique symbol;
declare const boardDropSessionTokenBrand: unique symbol;

/** Opaque identity for one committed board mount. */
export type BoardLayoutOwnerToken = Readonly<{
  [boardLayoutOwnerTokenBrand]: true;
}>;

/** Opaque identity for one provider-coordinated drag/drop epoch. */
export type BoardDropSessionToken = Readonly<{
  [boardDropSessionTokenBrand]: true;
}>;

/** Native window-space point. */
export interface BoardWindowPoint {
  readonly x: number;
  readonly y: number;
}

/** Detached native window bounds for one measured board. */
export interface BoardWindowBounds {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

/** Callback-shaped React Native `measureInWindow` boundary. */
export type MeasureBoardInWindow = (
  callback: (x: number, y: number, width: number, height: number) => void,
) => void;

/** Provider-private spare request before the target board adds identity/revision. */
export type ProviderSpareSource = Readonly<{
  readonly kind: 'spare';
  readonly spareId: string;
}>;

export interface ProviderSpareMove {
  readonly input: Extract<MoveInput, 'drag' | 'accessibility'>;
  readonly piece: Readonly<PieceData>;
  readonly source: ProviderSpareSource;
  readonly targetSquare: SquareId | null;
}

/** Commit-current target-board adapter. It owns callback and revision lookup. */
export type RequestProviderSpareMove = (
  move: Readonly<ProviderSpareMove>,
) => boolean;

/** Commit-current target gate evaluated before a spare drag activates. */
export type CanStartProviderSpareDrag = (
  source: ProviderSpareSource,
  piece: Readonly<PieceData>,
) => boolean;

/** Commit-current target-board notification for one spare piece boundary. */
export type NotifyProviderSparePieceInteraction = (
  source: ProviderSpareSource,
  piece: Readonly<PieceData>,
) => boolean;

/** Current non-semantic coordinate mapping for one registered board. */
export interface BoardLayoutGeometry {
  readonly dimensions: BoardDimensions;
  readonly orientation: BoardOrientation;
  readonly geometryEpoch: number;
  readonly layoutRevision: number;
}

/** Commit-owned registry input. It deliberately contains no board position. */
export interface BoardLayoutRegistration {
  /** Identity may be reserved before layout, but drops fail closed until true. */
  readonly available: boolean;
  readonly boardId: string;
  readonly owner: BoardLayoutOwnerToken;
  readonly geometry: BoardLayoutGeometry;
  readonly measureInWindow: MeasureBoardInWindow;
  /** Native activation threshold inherited by targeted spare sources. */
  readonly dragActivationDistance: number;
  /** Read only after a fresh release measurement passes every correlation. */
  readonly readPositionRevision: () => Revision | null;
  /** Read only after the registry has atomically authorized an external move. */
  readonly readMoveRequest: () => RequestProviderSpareMove | null;
  readonly readSparePieceDragStart: () => NotifyProviderSparePieceInteraction | null;
  readonly readSparePiecePress: () => NotifyProviderSparePieceInteraction | null;
  readonly readSpareDragPermission: () => CanStartProviderSpareDrag | null;
}

/** Token-safe update for an existing committed registration. */
export interface BoardLayoutUpdate {
  readonly available?: boolean;
  readonly dragActivationDistance?: number;
  readonly geometry?: BoardLayoutGeometry;
  readonly measureInWindow?: MeasureBoardInWindow;
  readonly readPositionRevision?: () => Revision | null;
  readonly readMoveRequest?: () => RequestProviderSpareMove | null;
  readonly readSparePieceDragStart?: () => NotifyProviderSparePieceInteraction | null;
  readonly readSparePiecePress?: () => NotifyProviderSparePieceInteraction | null;
  readonly readSpareDragPermission?: () => CanStartProviderSpareDrag | null;
}

export type BoardLayoutRegistrationResult =
  | { readonly status: 'registered'; readonly boardId: string }
  | { readonly status: 'duplicate'; readonly boardId: string }
  | {
      readonly status: 'owner-conflict';
      readonly boardId: string;
      readonly registeredBoardId: string;
    };

/** Detached diagnostic projection; it cannot expose registry accessors. */
export interface BoardLayoutSnapshot {
  readonly available: boolean;
  readonly boardId: string;
  readonly geometry: Readonly<BoardLayoutGeometry>;
  readonly cachedBounds: Readonly<BoardWindowBounds> | null;
}

export interface BeginBoardDropSessionOptions {
  readonly dropEpoch: number;
  readonly targetBoardId: string;
}

/** Hover is a cached hint and never an authorization to emit a move. */
export interface CachedBoardHover {
  readonly boardId: string;
  readonly bounds: Readonly<BoardWindowBounds>;
  readonly geometryEpoch: number;
  readonly layoutRevision: number;
  readonly targetSquare: SquareId;
}

export type BoardDropCancellationReason =
  | 'board-missing'
  | 'disposed'
  | 'invalid-point'
  | 'measurement-failed'
  | 'measurement-timeout'
  | 'position-unavailable'
  | 'stale'
  | 'token-exhausted';

export interface AcceptedBoardDropVerification {
  readonly status: 'accepted';
  readonly boardId: string;
  readonly bounds: Readonly<BoardWindowBounds>;
  readonly dropEpoch: number;
  readonly geometryEpoch: number;
  readonly layoutRevision: number;
  readonly positionRevision: Revision;
  readonly providerGeometryRevision: Revision;
  readonly targetSquare: SquareId | null;
}

export interface CancelledBoardDropVerification {
  readonly status: 'cancelled';
  readonly boardId: string;
  readonly reason: BoardDropCancellationReason;
}

export type BoardDropVerificationResult =
  AcceptedBoardDropVerification | CancelledBoardDropVerification;

export interface BoardLayoutRegistryOptions {
  /** Defaults to zero. */
  readonly providerGeometryRevision?: Revision;
  /** Defaults to 250 ms. */
  readonly verificationTimeoutMs?: number;
  /** Test seam for deterministic token-exhaustion coverage. */
  readonly initialMeasurementToken?: number;
}

export interface BoardLayoutRegistry {
  readonly register: (
    registration: BoardLayoutRegistration,
  ) => Readonly<BoardLayoutRegistrationResult>;
  readonly update: (
    boardId: string,
    owner: BoardLayoutOwnerToken,
    update: BoardLayoutUpdate,
  ) => boolean;
  readonly unregister: (
    boardId: string,
    owner: BoardLayoutOwnerToken,
  ) => boolean;
  readonly setProviderGeometryRevision: (revision: Revision) => void;
  readonly refreshCachedBounds: (
    boardId: string,
    owner: BoardLayoutOwnerToken,
  ) => Promise<Readonly<BoardWindowBounds> | null>;
  readonly getBoardSnapshot: (
    boardId: string,
  ) => Readonly<BoardLayoutSnapshot> | null;
  readonly getSpareDragActivationDistance: (
    targetBoardId: string,
  ) => number | null;
  /** Monotonic target/config identity used to reject retained native signals. */
  readonly getSpareGestureConfigurationEpoch: (targetBoardId: string) => number;
  readonly subscribeBoardConfiguration: (
    targetBoardId: string,
    listener: () => void,
  ) => () => void;
  readonly beginDropSession: (
    options: BeginBoardDropSessionOptions,
  ) => BoardDropSessionToken;
  readonly getCachedHover: (
    session: BoardDropSessionToken,
    point: BoardWindowPoint,
  ) => Readonly<CachedBoardHover> | null;
  readonly verifyDrop: (
    session: BoardDropSessionToken,
    point: BoardWindowPoint,
  ) => Promise<Readonly<BoardDropVerificationResult>>;
  readonly requestVerifiedDrop: (
    session: BoardDropSessionToken,
    verification: Readonly<AcceptedBoardDropVerification>,
    move: Omit<ProviderSpareMove, 'targetSquare'>,
  ) => boolean;
  readonly requestAccessibleSpare: (
    targetBoardId: string,
    move: Readonly<ProviderSpareMove>,
  ) => boolean;
  readonly canStartSpareDrag: (
    targetBoardId: string,
    source: ProviderSpareSource,
    piece: Readonly<PieceData>,
  ) => boolean;
  readonly notifySparePieceDragStart: (
    targetBoardId: string,
    source: ProviderSpareSource,
    piece: Readonly<PieceData>,
  ) => boolean;
  readonly notifySparePiecePress: (
    targetBoardId: string,
    source: ProviderSpareSource,
    piece: Readonly<PieceData>,
  ) => boolean;
  readonly endDropSession: (session: BoardDropSessionToken) => boolean;
  /** Cancel only transient drop work while preserving board registrations. */
  readonly cancelTransient: () => void;
  /** Reversible cleanup for a provider tree whose effects were deactivated. */
  readonly deactivate: () => void;
  readonly dispose: () => void;
}

interface NormalizedBoardLayoutGeometry {
  readonly dimensions: ValidatedBoardDimensions;
  readonly orientation: BoardOrientation;
  readonly geometryEpoch: number;
  readonly layoutRevision: number;
}

interface CachedBoundsRecord {
  readonly bounds: Readonly<BoardWindowBounds>;
  readonly entryVersion: number;
  readonly providerEpoch: object;
}

interface RegistryEntry {
  available: boolean;
  readonly boardId: string;
  readonly owner: BoardLayoutOwnerToken;
  geometry: Readonly<NormalizedBoardLayoutGeometry>;
  dragActivationDistance: number;
  measureInWindow: MeasureBoardInWindow;
  readMoveRequest: () => RequestProviderSpareMove | null;
  readSparePieceDragStart: () => NotifyProviderSparePieceInteraction | null;
  readSparePiecePress: () => NotifyProviderSparePieceInteraction | null;
  readSpareDragPermission: () => CanStartProviderSpareDrag | null;
  readPositionRevision: () => Revision | null;
  version: number | null;
  cachedBounds: Readonly<CachedBoundsRecord> | null;
  cacheMeasurementToken: number | null;
}

interface AvailableRegistryEntry extends RegistryEntry {
  available: true;
  version: number;
}

interface ActiveDropSession {
  readonly token: BoardDropSessionToken;
  readonly dropEpoch: number;
  readonly targetBoardId: string;
  readonly targetOwner: BoardLayoutOwnerToken | null;
  readonly targetEntryVersion: number | null;
  readonly providerEpoch: object;
  readonly providerGeometryRevision: Revision;
  acceptedVerification: Readonly<AcceptedBoardDropVerification> | null;
  verificationToken: number | null;
}

type PendingMeasurementKind = 'cache' | 'verification';

interface PendingMeasurement {
  readonly boardId: string;
  readonly kind: PendingMeasurementKind;
  readonly owner: BoardLayoutOwnerToken;
  readonly session: BoardDropSessionToken | null;
  readonly cancel: (reason: BoardDropCancellationReason) => void;
}

const DEFAULT_VERIFICATION_TIMEOUT_MS = 250;
const ABSENT_SPARE_GESTURE_CONFIGURATION_EPOCH = 0;
const DISPOSED_SPARE_GESTURE_CONFIGURATION_EPOCH = -1;

function validateNonNegativeSafeInteger(value: unknown, name: string): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value)) {
    throw new TypeError(`${name} must be a safe integer.`);
  }
  if (value < 0) {
    throw new RangeError(`${name} must be non-negative.`);
  }
  return value;
}

function validateBoardId(value: unknown): string {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new TypeError('boardId must be a non-empty string.');
  }
  return value;
}

function validateTimeout(value: unknown): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new TypeError('verificationTimeoutMs must be finite.');
  }
  if (value <= 0) {
    throw new RangeError('verificationTimeoutMs must be greater than zero.');
  }
  return value;
}

function validateDragActivationDistance(value: unknown): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) {
    throw new RangeError(
      'dragActivationDistance must be a finite non-negative number.',
    );
  }
  return value;
}

function normalizeGeometry(
  geometry: BoardLayoutGeometry,
): Readonly<NormalizedBoardLayoutGeometry> {
  return Object.freeze({
    dimensions: validateBoardDimensions(geometry.dimensions),
    geometryEpoch: validateNonNegativeSafeInteger(
      geometry.geometryEpoch,
      'geometryEpoch',
    ),
    layoutRevision: validateNonNegativeSafeInteger(
      geometry.layoutRevision,
      'layoutRevision',
    ),
    orientation: validateOrientation(geometry.orientation),
  });
}

function geometryMatches(
  left: Readonly<NormalizedBoardLayoutGeometry>,
  right: Readonly<NormalizedBoardLayoutGeometry>,
): boolean {
  return (
    left.geometryEpoch === right.geometryEpoch &&
    left.layoutRevision === right.layoutRevision &&
    left.orientation === right.orientation &&
    left.dimensions.columns === right.dimensions.columns &&
    left.dimensions.rows === right.dimensions.rows
  );
}

function copyGeometry(
  geometry: Readonly<NormalizedBoardLayoutGeometry>,
): Readonly<BoardLayoutGeometry> {
  return Object.freeze({
    dimensions: Object.freeze({
      columns: geometry.dimensions.columns,
      rows: geometry.dimensions.rows,
    }),
    geometryEpoch: geometry.geometryEpoch,
    layoutRevision: geometry.layoutRevision,
    orientation: geometry.orientation,
  });
}

function normalizeBounds(
  x: unknown,
  y: unknown,
  width: unknown,
  height: unknown,
): Readonly<BoardWindowBounds> | null {
  if (
    typeof x !== 'number' ||
    typeof y !== 'number' ||
    typeof width !== 'number' ||
    typeof height !== 'number' ||
    !Number.isFinite(x) ||
    !Number.isFinite(y) ||
    !Number.isFinite(width) ||
    !Number.isFinite(height) ||
    width <= 0 ||
    height <= 0
  ) {
    return null;
  }
  return Object.freeze({ height, width, x, y });
}

function copyBounds(
  bounds: Readonly<BoardWindowBounds>,
): Readonly<BoardWindowBounds> {
  return Object.freeze({
    height: bounds.height,
    width: bounds.width,
    x: bounds.x,
    y: bounds.y,
  });
}

function copyProviderSpareMove(
  move: Readonly<ProviderSpareMove>,
): Readonly<ProviderSpareMove> {
  return Object.freeze({
    input: move.input,
    piece: Object.freeze({
      ...(move.piece.id === undefined ? {} : { id: move.piece.id }),
      pieceType: move.piece.pieceType,
    }),
    source: Object.freeze({ kind: 'spare', spareId: move.source.spareId }),
    targetSquare: move.targetSquare,
  });
}

function invokeMoveRequest(
  entry: Readonly<RegistryEntry>,
  move: Readonly<ProviderSpareMove>,
): boolean {
  let request: RequestProviderSpareMove | null;
  try {
    request = entry.readMoveRequest();
  } catch {
    return false;
  }
  if (request === null) {
    return false;
  }
  try {
    const requested: unknown = request(copyProviderSpareMove(move));
    return requested === true;
  } catch {
    return false;
  }
}

function invokeSparePieceInteraction(
  readInteraction: () => NotifyProviderSparePieceInteraction | null,
  source: ProviderSpareSource,
  piece: Readonly<PieceData>,
): boolean {
  let interaction: NotifyProviderSparePieceInteraction | null;
  try {
    interaction = readInteraction();
  } catch {
    return false;
  }
  if (interaction === null) {
    return false;
  }
  try {
    const notified: unknown = interaction(
      Object.freeze({ kind: 'spare', spareId: source.spareId }),
      Object.freeze({
        ...(piece.id === undefined ? {} : { id: piece.id }),
        pieceType: piece.pieceType,
      }),
    );
    return notified === true;
  } catch {
    return false;
  }
}

function isFinitePoint(point: BoardWindowPoint): boolean {
  return Number.isFinite(point.x) && Number.isFinite(point.y);
}

function hitTestWindowPoint(
  point: BoardWindowPoint,
  bounds: Readonly<BoardWindowBounds>,
  geometry: Readonly<NormalizedBoardLayoutGeometry>,
): SquareId | null {
  return hitTestBoardPoint(
    { x: point.x - bounds.x, y: point.y - bounds.y },
    { height: bounds.height, width: bounds.width },
    geometry.dimensions,
    geometry.orientation,
  );
}

function nextVersion(current: number | null): number | null {
  if (current === null || current === Number.MAX_SAFE_INTEGER) {
    return null;
  }
  return current + 1;
}

function isAvailableEntry(
  entry: RegistryEntry | null | undefined,
): entry is AvailableRegistryEntry {
  return entry?.available === true && entry.version !== null;
}

function isCurrentCachedBounds(
  cached: Readonly<CachedBoundsRecord> | null,
  entryVersion: number,
  currentProviderEpoch: object,
): cached is Readonly<CachedBoundsRecord> {
  return (
    cached?.entryVersion === entryVersion &&
    cached.providerEpoch === currentProviderEpoch
  );
}

function cancelled(
  boardId: string,
  reason: BoardDropCancellationReason,
): Readonly<CancelledBoardDropVerification> {
  return Object.freeze({ boardId, reason, status: 'cancelled' });
}

export function createBoardLayoutOwnerToken(): BoardLayoutOwnerToken {
  return Object.freeze({}) as BoardLayoutOwnerToken;
}

function createBoardDropSessionToken(): BoardDropSessionToken {
  return Object.freeze({}) as BoardDropSessionToken;
}

/**
 * Create one provider-private board registry and external-drop verifier.
 *
 * The registry is intentionally mutable coordination infrastructure, not a
 * render source. Every value returned to a caller is a detached immutable
 * projection, and terminal drop verification always performs a fresh native
 * measurement.
 */
export function createBoardLayoutRegistry(
  options: BoardLayoutRegistryOptions = {},
): BoardLayoutRegistry {
  let providerGeometryRevision = validateNonNegativeSafeInteger(
    options.providerGeometryRevision ?? 0,
    'providerGeometryRevision',
  );
  const verificationTimeoutMs = validateTimeout(
    options.verificationTimeoutMs ?? DEFAULT_VERIFICATION_TIMEOUT_MS,
  );
  let nextMeasurementToken: number | null = validateNonNegativeSafeInteger(
    options.initialMeasurementToken ?? 0,
    'initialMeasurementToken',
  );
  let providerEpoch = Object.freeze({});
  let activeSession: ActiveDropSession | null = null;
  let disposed = false;
  let nextSpareGestureConfigurationEpoch: number | null = 1;
  const entries = new Map<string, RegistryEntry>();
  const boardIdByOwner = new Map<BoardLayoutOwnerToken, string>();
  const pendingMeasurements = new Map<number, PendingMeasurement>();
  const spareGestureConfigurationEpochs = new Map<string, number>();
  const configurationListeners = new Map<string, Set<() => void>>();

  const notifyConfigurationListeners = (boardId: string): void => {
    const listeners = configurationListeners.get(boardId);
    if (listeners === undefined) {
      return;
    }
    for (const listener of [...listeners]) {
      try {
        listener();
      } catch {
        // One observer cannot prevent other targeted spares from refreshing.
      }
    }
  };

  const publishSpareGestureConfiguration = (boardId: string): void => {
    const epoch = nextSpareGestureConfigurationEpoch;
    if (epoch === null) {
      throw new RangeError('Spare gesture configuration epoch exhausted.');
    }
    nextSpareGestureConfigurationEpoch =
      epoch === Number.MAX_SAFE_INTEGER ? null : epoch + 1;
    spareGestureConfigurationEpochs.set(boardId, epoch);
    notifyConfigurationListeners(boardId);
  };

  const allocateMeasurementToken = (): number | null => {
    const token = nextMeasurementToken;
    if (token === null) {
      return null;
    }
    nextMeasurementToken = token === Number.MAX_SAFE_INTEGER ? null : token + 1;
    return token;
  };

  const cancelPending = (
    predicate: (pending: Readonly<PendingMeasurement>) => boolean,
    reason: BoardDropCancellationReason,
  ): void => {
    for (const pending of [...pendingMeasurements.values()]) {
      if (predicate(pending)) {
        pending.cancel(reason);
      }
    }
  };

  const invalidateActiveSession = (
    reason: BoardDropCancellationReason,
  ): void => {
    const session = activeSession;
    if (session === null) {
      return;
    }
    activeSession = null;
    cancelPending(
      (pending) =>
        pending.kind === 'verification' && pending.session === session.token,
      reason,
    );
  };

  const invalidateSessionForEntry = (
    entry: Readonly<RegistryEntry>,
    reason: BoardDropCancellationReason,
  ): void => {
    const session = activeSession;
    if (
      session?.targetBoardId === entry.boardId &&
      session.targetOwner === entry.owner
    ) {
      invalidateActiveSession(reason);
    }
  };

  const entryForOwner = (
    boardId: string,
    owner: BoardLayoutOwnerToken,
  ): RegistryEntry | null => {
    const entry = entries.get(boardId);
    return entry?.owner === owner ? entry : null;
  };

  const register: BoardLayoutRegistry['register'] = (registration) => {
    if (disposed) {
      throw new Error('Board layout registry is disposed.');
    }
    const boardId = validateBoardId(registration.boardId);
    if (typeof registration.measureInWindow !== 'function') {
      throw new TypeError('measureInWindow must be a function.');
    }
    const dragActivationDistance = validateDragActivationDistance(
      registration.dragActivationDistance,
    );
    if (typeof registration.readPositionRevision !== 'function') {
      throw new TypeError('readPositionRevision must be a function.');
    }
    if (typeof registration.readMoveRequest !== 'function') {
      throw new TypeError('readMoveRequest must be a function.');
    }
    if (typeof registration.readSparePieceDragStart !== 'function') {
      throw new TypeError('readSparePieceDragStart must be a function.');
    }
    if (typeof registration.readSparePiecePress !== 'function') {
      throw new TypeError('readSparePiecePress must be a function.');
    }
    if (typeof registration.readSpareDragPermission !== 'function') {
      throw new TypeError('readSpareDragPermission must be a function.');
    }
    if (typeof registration.available !== 'boolean') {
      throw new TypeError('available must be a boolean.');
    }
    const registeredBoardId = boardIdByOwner.get(registration.owner);
    if (registeredBoardId !== undefined && registeredBoardId !== boardId) {
      return Object.freeze({
        boardId,
        registeredBoardId,
        status: 'owner-conflict',
      });
    }

    const existing = entries.get(boardId);
    if (existing !== undefined && existing.owner !== registration.owner) {
      return Object.freeze({ boardId, status: 'duplicate' });
    }

    const geometry = normalizeGeometry(registration.geometry);
    if (existing !== undefined) {
      update(boardId, registration.owner, {
        available: registration.available,
        dragActivationDistance,
        geometry,
        measureInWindow: registration.measureInWindow,
        readMoveRequest: registration.readMoveRequest,
        readPositionRevision: registration.readPositionRevision,
        readSpareDragPermission: registration.readSpareDragPermission,
        readSparePieceDragStart: registration.readSparePieceDragStart,
        readSparePiecePress: registration.readSparePiecePress,
      });
      return Object.freeze({ boardId, status: 'registered' });
    }

    entries.set(boardId, {
      available: registration.available,
      boardId,
      cachedBounds: null,
      cacheMeasurementToken: null,
      dragActivationDistance,
      geometry,
      measureInWindow: registration.measureInWindow,
      owner: registration.owner,
      readMoveRequest: registration.readMoveRequest,
      readPositionRevision: registration.readPositionRevision,
      readSpareDragPermission: registration.readSpareDragPermission,
      readSparePieceDragStart: registration.readSparePieceDragStart,
      readSparePiecePress: registration.readSparePiecePress,
      version: 0,
    });
    boardIdByOwner.set(registration.owner, boardId);
    publishSpareGestureConfiguration(boardId);
    return Object.freeze({ boardId, status: 'registered' });
  };

  const update: BoardLayoutRegistry['update'] = (
    boardIdInput,
    owner,
    updateInput,
  ) => {
    const boardId = validateBoardId(boardIdInput);
    const entry = entryForOwner(boardId, owner);
    if (entry === null || disposed) {
      return false;
    }

    if (
      Object.hasOwn(updateInput, 'measureInWindow') &&
      typeof updateInput.measureInWindow !== 'function'
    ) {
      throw new TypeError('measureInWindow must be a function.');
    }
    if (
      Object.hasOwn(updateInput, 'readPositionRevision') &&
      typeof updateInput.readPositionRevision !== 'function'
    ) {
      throw new TypeError('readPositionRevision must be a function.');
    }
    if (
      Object.hasOwn(updateInput, 'readMoveRequest') &&
      typeof updateInput.readMoveRequest !== 'function'
    ) {
      throw new TypeError('readMoveRequest must be a function.');
    }
    if (
      Object.hasOwn(updateInput, 'readSparePieceDragStart') &&
      typeof updateInput.readSparePieceDragStart !== 'function'
    ) {
      throw new TypeError('readSparePieceDragStart must be a function.');
    }
    if (
      Object.hasOwn(updateInput, 'readSparePiecePress') &&
      typeof updateInput.readSparePiecePress !== 'function'
    ) {
      throw new TypeError('readSparePiecePress must be a function.');
    }
    if (
      Object.hasOwn(updateInput, 'readSpareDragPermission') &&
      typeof updateInput.readSpareDragPermission !== 'function'
    ) {
      throw new TypeError('readSpareDragPermission must be a function.');
    }
    if (
      Object.hasOwn(updateInput, 'available') &&
      typeof updateInput.available !== 'boolean'
    ) {
      throw new TypeError('available must be a boolean.');
    }

    const nextGeometry =
      updateInput.geometry === undefined
        ? entry.geometry
        : normalizeGeometry(updateInput.geometry);
    const geometryChanged = !geometryMatches(entry.geometry, nextGeometry);
    const nextAvailable = updateInput.available ?? entry.available;
    const availabilityChanged = nextAvailable !== entry.available;
    const nextDragActivationDistance =
      updateInput.dragActivationDistance === undefined
        ? entry.dragActivationDistance
        : validateDragActivationDistance(updateInput.dragActivationDistance);
    const configurationChanged =
      nextDragActivationDistance !== entry.dragActivationDistance;

    entry.available = nextAvailable;
    entry.dragActivationDistance = nextDragActivationDistance;
    entry.geometry = nextGeometry;
    if (updateInput.measureInWindow !== undefined) {
      entry.measureInWindow = updateInput.measureInWindow;
    }
    if (updateInput.readPositionRevision !== undefined) {
      entry.readPositionRevision = updateInput.readPositionRevision;
    }
    if (updateInput.readMoveRequest !== undefined) {
      entry.readMoveRequest = updateInput.readMoveRequest;
    }
    if (updateInput.readSparePieceDragStart !== undefined) {
      entry.readSparePieceDragStart = updateInput.readSparePieceDragStart;
    }
    if (updateInput.readSparePiecePress !== undefined) {
      entry.readSparePiecePress = updateInput.readSparePiecePress;
    }
    if (updateInput.readSpareDragPermission !== undefined) {
      entry.readSpareDragPermission = updateInput.readSpareDragPermission;
    }

    if (geometryChanged || availabilityChanged) {
      entry.version = nextVersion(entry.version);
      entry.cachedBounds = null;
      cancelPending(
        (pending) =>
          pending.boardId === boardId && pending.owner === entry.owner,
        'stale',
      );
      invalidateSessionForEntry(entry, 'stale');
    }
    if (configurationChanged) {
      publishSpareGestureConfiguration(boardId);
    }
    return true;
  };

  const unregister: BoardLayoutRegistry['unregister'] = (
    boardIdInput,
    owner,
  ) => {
    const boardId = validateBoardId(boardIdInput);
    const entry = entryForOwner(boardId, owner);
    if (entry === null) {
      return false;
    }
    entries.delete(boardId);
    boardIdByOwner.delete(owner);
    publishSpareGestureConfiguration(boardId);
    cancelPending(
      (pending) => pending.boardId === boardId && pending.owner === entry.owner,
      'stale',
    );
    invalidateSessionForEntry(entry, 'stale');
    return true;
  };

  const setProviderGeometryRevision: BoardLayoutRegistry['setProviderGeometryRevision'] =
    (revisionInput) => {
      const revision = validateNonNegativeSafeInteger(
        revisionInput,
        'providerGeometryRevision',
      );
      if (revision === providerGeometryRevision || disposed) {
        return;
      }
      providerGeometryRevision = revision;
      providerEpoch = Object.freeze({});
      for (const entry of entries.values()) {
        entry.cachedBounds = null;
      }
      cancelPending(() => true, 'stale');
      invalidateActiveSession('stale');
    };

  const refreshCachedBounds: BoardLayoutRegistry['refreshCachedBounds'] = (
    boardIdInput,
    owner,
  ) => {
    const boardId = validateBoardId(boardIdInput);
    if (disposed) {
      return Promise.resolve(null);
    }
    const entry = entryForOwner(boardId, owner);
    if (!isAvailableEntry(entry)) {
      return Promise.resolve(null);
    }
    cancelPending(
      (pending) =>
        pending.kind === 'cache' &&
        pending.boardId === boardId &&
        pending.owner === owner,
      'stale',
    );
    const measurementToken = allocateMeasurementToken();
    if (measurementToken === null) {
      return Promise.resolve(null);
    }
    const capturedVersion = entry.version;
    const capturedProviderEpoch = providerEpoch;
    entry.cacheMeasurementToken = measurementToken;

    return new Promise((resolve) => {
      let settled = false;
      let timeout: ReturnType<typeof setTimeout> | null = null;
      const finish = (bounds: Readonly<BoardWindowBounds> | null): void => {
        if (settled) {
          return;
        }
        settled = true;
        if (timeout !== null) {
          clearTimeout(timeout);
        }
        pendingMeasurements.delete(measurementToken);
        const current = entryForOwner(boardId, owner);
        if (current?.cacheMeasurementToken === measurementToken) {
          current.cacheMeasurementToken = null;
        }
        resolve(bounds === null ? null : copyBounds(bounds));
      };
      const cancel = (): void => {
        finish(null);
      };
      pendingMeasurements.set(measurementToken, {
        boardId,
        cancel,
        kind: 'cache',
        owner,
        session: null,
      });
      timeout = setTimeout(cancel, verificationTimeoutMs);

      try {
        entry.measureInWindow((x, y, width, height) => {
          if (settled) {
            return;
          }
          const current = entryForOwner(boardId, owner);
          const bounds = normalizeBounds(x, y, width, height);
          if (
            bounds === null ||
            !isAvailableEntry(current) ||
            current.version !== capturedVersion ||
            current.cacheMeasurementToken !== measurementToken ||
            providerEpoch !== capturedProviderEpoch ||
            disposed
          ) {
            finish(null);
            return;
          }
          current.cachedBounds = Object.freeze({
            bounds,
            entryVersion: capturedVersion,
            providerEpoch: capturedProviderEpoch,
          });
          finish(bounds);
        });
      } catch {
        finish(null);
      }
    });
  };

  const getBoardSnapshot: BoardLayoutRegistry['getBoardSnapshot'] = (
    boardIdInput,
  ) => {
    const boardId = validateBoardId(boardIdInput);
    const entry = entries.get(boardId);
    if (entry === undefined) {
      return null;
    }
    const cached = entry.cachedBounds;
    const cachedBounds =
      entry.available &&
      cached !== null &&
      cached.entryVersion === entry.version &&
      cached.providerEpoch === providerEpoch
        ? copyBounds(cached.bounds)
        : null;
    return Object.freeze({
      available: entry.available && entry.version !== null,
      boardId,
      cachedBounds,
      geometry: copyGeometry(entry.geometry),
    });
  };

  const getSpareDragActivationDistance: BoardLayoutRegistry['getSpareDragActivationDistance'] =
    (targetBoardIdInput) => {
      const targetBoardId = validateBoardId(targetBoardIdInput);
      if (disposed) {
        return null;
      }
      return entries.get(targetBoardId)?.dragActivationDistance ?? null;
    };

  const getSpareGestureConfigurationEpoch: BoardLayoutRegistry['getSpareGestureConfigurationEpoch'] =
    (targetBoardIdInput) => {
      const targetBoardId = validateBoardId(targetBoardIdInput);
      if (disposed) {
        return DISPOSED_SPARE_GESTURE_CONFIGURATION_EPOCH;
      }
      return (
        spareGestureConfigurationEpochs.get(targetBoardId) ??
        ABSENT_SPARE_GESTURE_CONFIGURATION_EPOCH
      );
    };

  const subscribeBoardConfiguration: BoardLayoutRegistry['subscribeBoardConfiguration'] =
    (targetBoardIdInput, listener) => {
      const targetBoardId = validateBoardId(targetBoardIdInput);
      if (typeof listener !== 'function') {
        throw new TypeError('configuration listener must be a function.');
      }
      if (disposed) {
        return () => undefined;
      }
      let listeners = configurationListeners.get(targetBoardId);
      if (listeners === undefined) {
        listeners = new Set();
        configurationListeners.set(targetBoardId, listeners);
      }
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
        if (listeners.size === 0) {
          configurationListeners.delete(targetBoardId);
        }
      };
    };

  const beginDropSession: BoardLayoutRegistry['beginDropSession'] = (
    sessionOptions,
  ) => {
    const dropEpoch = validateNonNegativeSafeInteger(
      sessionOptions.dropEpoch,
      'dropEpoch',
    );
    const targetBoardId = validateBoardId(sessionOptions.targetBoardId);
    invalidateActiveSession('stale');
    const token = createBoardDropSessionToken();
    const registeredTarget = entries.get(targetBoardId);
    const target = isAvailableEntry(registeredTarget) ? registeredTarget : null;
    activeSession = {
      acceptedVerification: null,
      dropEpoch,
      providerEpoch,
      providerGeometryRevision,
      targetBoardId,
      targetEntryVersion: target?.version ?? null,
      targetOwner: target?.owner ?? null,
      token,
      verificationToken: null,
    };
    return token;
  };

  const activeMatchingSession = (
    token: BoardDropSessionToken,
  ): ActiveDropSession | null => {
    const session = activeSession;
    return session?.token === token ? session : null;
  };

  const currentSessionEntry = (
    session: Readonly<ActiveDropSession>,
  ): AvailableRegistryEntry | null => {
    if (
      disposed ||
      session.providerEpoch !== providerEpoch ||
      session.providerGeometryRevision !== providerGeometryRevision ||
      session.targetOwner === null ||
      session.targetEntryVersion === null
    ) {
      return null;
    }
    const entry = entries.get(session.targetBoardId);
    return isAvailableEntry(entry) &&
      entry.owner === session.targetOwner &&
      entry.version === session.targetEntryVersion
      ? entry
      : null;
  };

  const getCachedHover: BoardLayoutRegistry['getCachedHover'] = (
    token,
    point,
  ) => {
    const session = activeMatchingSession(token);
    if (session === null || !isFinitePoint(point)) {
      return null;
    }
    const entry = currentSessionEntry(session);
    if (entry === null) {
      return null;
    }
    const cached = entry.cachedBounds;
    if (!isCurrentCachedBounds(cached, entry.version, providerEpoch)) {
      return null;
    }
    const targetSquare = hitTestWindowPoint(
      point,
      cached.bounds,
      entry.geometry,
    );
    if (targetSquare === null) {
      return null;
    }
    return Object.freeze({
      boardId: entry.boardId,
      bounds: copyBounds(cached.bounds),
      geometryEpoch: entry.geometry.geometryEpoch,
      layoutRevision: entry.geometry.layoutRevision,
      targetSquare,
    });
  };

  const verifyDrop: BoardLayoutRegistry['verifyDrop'] = (token, point) => {
    const initialSession = activeMatchingSession(token);
    if (disposed) {
      return Promise.resolve(cancelled('', 'disposed'));
    }
    if (initialSession === null) {
      return Promise.resolve(cancelled('', 'stale'));
    }
    const boardId = initialSession.targetBoardId;
    const releasePoint = Object.freeze({ x: point.x, y: point.y });
    if (!isFinitePoint(releasePoint)) {
      return Promise.resolve(cancelled(boardId, 'invalid-point'));
    }
    const initialEntry = currentSessionEntry(initialSession);
    if (initialEntry === null) {
      return Promise.resolve(cancelled(boardId, 'board-missing'));
    }
    const measurementToken = allocateMeasurementToken();
    if (measurementToken === null) {
      return Promise.resolve(cancelled(boardId, 'token-exhausted'));
    }

    cancelPending(
      (pending) =>
        pending.kind === 'cache' &&
        pending.boardId === boardId &&
        pending.owner === initialEntry.owner,
      'stale',
    );
    cancelPending(
      (pending) => pending.kind === 'verification' && pending.session === token,
      'stale',
    );
    initialSession.verificationToken = measurementToken;
    initialSession.acceptedVerification = null;
    const capturedOwner = initialEntry.owner;
    const capturedEntryVersion: number = initialEntry.version;
    const capturedProviderEpoch = initialSession.providerEpoch;

    return new Promise((resolve) => {
      let settled = false;
      let timeout: ReturnType<typeof setTimeout> | null = null;
      const finish = (result: Readonly<BoardDropVerificationResult>): void => {
        if (settled) {
          return;
        }
        settled = true;
        if (timeout !== null) {
          clearTimeout(timeout);
        }
        pendingMeasurements.delete(measurementToken);
        const currentSession = activeMatchingSession(token);
        if (currentSession?.verificationToken === measurementToken) {
          currentSession.verificationToken = null;
        }
        resolve(result);
      };
      const cancel = (reason: BoardDropCancellationReason): void => {
        finish(cancelled(boardId, reason));
      };
      pendingMeasurements.set(measurementToken, {
        boardId,
        cancel,
        kind: 'verification',
        owner: capturedOwner,
        session: token,
      });
      timeout = setTimeout(() => {
        cancel('measurement-timeout');
      }, verificationTimeoutMs);

      try {
        initialEntry.measureInWindow((x, y, width, height) => {
          if (settled) {
            return;
          }
          const session = activeMatchingSession(token);
          const entry = session === null ? null : currentSessionEntry(session);
          if (session === null || entry === null) {
            cancel('stale');
            return;
          }
          if (
            entry.owner !== capturedOwner ||
            entry.version !== capturedEntryVersion ||
            session.providerEpoch !== capturedProviderEpoch ||
            session.verificationToken !== measurementToken
          ) {
            cancel('stale');
            return;
          }
          const bounds = normalizeBounds(x, y, width, height);
          if (bounds === null) {
            cancel('measurement-failed');
            return;
          }
          const targetSquare = hitTestWindowPoint(
            releasePoint,
            bounds,
            entry.geometry,
          );
          let positionRevision: Revision | null;
          try {
            positionRevision = entry.readPositionRevision();
          } catch {
            cancel('position-unavailable');
            return;
          }
          if (
            positionRevision === null ||
            !Number.isSafeInteger(positionRevision) ||
            positionRevision < 0
          ) {
            cancel('position-unavailable');
            return;
          }

          const finalSession = activeMatchingSession(token);
          const finalEntry =
            finalSession === null ? null : currentSessionEntry(finalSession);
          if (
            finalSession === null ||
            finalEntry !== entry ||
            finalSession.verificationToken !== measurementToken ||
            finalSession.providerEpoch !== capturedProviderEpoch
          ) {
            cancel('stale');
            return;
          }

          entry.cachedBounds = Object.freeze({
            bounds,
            entryVersion: capturedEntryVersion,
            providerEpoch: capturedProviderEpoch,
          });
          const accepted: Readonly<AcceptedBoardDropVerification> =
            Object.freeze({
              boardId,
              bounds: copyBounds(bounds),
              dropEpoch: session.dropEpoch,
              geometryEpoch: entry.geometry.geometryEpoch,
              layoutRevision: entry.geometry.layoutRevision,
              positionRevision,
              providerGeometryRevision: session.providerGeometryRevision,
              status: 'accepted',
              targetSquare,
            });
          session.acceptedVerification = accepted;
          finish(accepted);
        });
      } catch {
        cancel('measurement-failed');
      }
    });
  };

  const requestVerifiedDrop: BoardLayoutRegistry['requestVerifiedDrop'] = (
    token,
    verification,
    move,
  ) => {
    const session = activeMatchingSession(token);
    if (
      session?.acceptedVerification !== verification ||
      verification.boardId !== session.targetBoardId ||
      verification.dropEpoch !== session.dropEpoch ||
      verification.providerGeometryRevision !== session.providerGeometryRevision
    ) {
      return false;
    }
    const entry = currentSessionEntry(session);
    if (
      entry?.geometry.geometryEpoch !== verification.geometryEpoch ||
      entry.geometry.layoutRevision !== verification.layoutRevision
    ) {
      invalidateActiveSession('stale');
      return false;
    }

    // Consume the one-shot capability before invoking consumer-adjacent code.
    // A re-entrant or duplicate terminal callback therefore cannot emit twice.
    session.acceptedVerification = null;
    activeSession = null;
    return invokeMoveRequest(entry, {
      ...move,
      targetSquare: verification.targetSquare,
    });
  };

  const requestAccessibleSpare: BoardLayoutRegistry['requestAccessibleSpare'] =
    (targetBoardIdInput, move) => {
      const targetBoardId = validateBoardId(targetBoardIdInput);
      if (disposed) {
        return false;
      }
      const entry = entries.get(targetBoardId);
      return entry === undefined ? false : invokeMoveRequest(entry, move);
    };

  const canStartSpareDrag: BoardLayoutRegistry['canStartSpareDrag'] = (
    targetBoardIdInput,
    source,
    piece,
  ) => {
    const targetBoardId = validateBoardId(targetBoardIdInput);
    if (disposed) {
      return false;
    }
    const entry = entries.get(targetBoardId);
    if (!isAvailableEntry(entry)) {
      return false;
    }
    let permission: CanStartProviderSpareDrag | null;
    try {
      permission = entry.readSpareDragPermission();
    } catch {
      return false;
    }
    if (permission === null) {
      return false;
    }
    try {
      const allowed: unknown = permission(source, piece);
      return allowed === true;
    } catch {
      return false;
    }
  };

  const notifySparePieceDragStart: BoardLayoutRegistry['notifySparePieceDragStart'] =
    (targetBoardIdInput, source, piece) => {
      const targetBoardId = validateBoardId(targetBoardIdInput);
      if (disposed) {
        return false;
      }
      const entry = entries.get(targetBoardId);
      return entry === undefined
        ? false
        : invokeSparePieceInteraction(
            entry.readSparePieceDragStart,
            source,
            piece,
          );
    };

  const notifySparePiecePress: BoardLayoutRegistry['notifySparePiecePress'] = (
    targetBoardIdInput,
    source,
    piece,
  ) => {
    const targetBoardId = validateBoardId(targetBoardIdInput);
    if (disposed) {
      return false;
    }
    const entry = entries.get(targetBoardId);
    return entry === undefined
      ? false
      : invokeSparePieceInteraction(entry.readSparePiecePress, source, piece);
  };

  const endDropSession: BoardLayoutRegistry['endDropSession'] = (token) => {
    if (activeSession?.token !== token) {
      return false;
    }
    invalidateActiveSession('stale');
    return true;
  };

  const cancelTransient: BoardLayoutRegistry['cancelTransient'] = () => {
    if (disposed) {
      return;
    }
    invalidateActiveSession('stale');
    cancelPending(() => true, 'stale');
  };

  const deactivate: BoardLayoutRegistry['deactivate'] = () => {
    if (disposed) {
      return;
    }
    invalidateActiveSession('stale');
    cancelPending(() => true, 'stale');
    const registeredBoardIds = [...entries.keys()];
    entries.clear();
    boardIdByOwner.clear();
    providerEpoch = Object.freeze({});
    for (const boardId of registeredBoardIds) {
      publishSpareGestureConfiguration(boardId);
    }
  };

  const dispose: BoardLayoutRegistry['dispose'] = () => {
    if (disposed) {
      return;
    }
    disposed = true;
    invalidateActiveSession('disposed');
    cancelPending(() => true, 'disposed');
    const registeredBoardIds = [...entries.keys()];
    entries.clear();
    boardIdByOwner.clear();
    for (const boardId of registeredBoardIds) {
      publishSpareGestureConfiguration(boardId);
    }
    spareGestureConfigurationEpochs.clear();
    configurationListeners.clear();
  };

  return Object.freeze({
    beginDropSession,
    cancelTransient,
    canStartSpareDrag,
    deactivate,
    dispose,
    endDropSession,
    getBoardSnapshot,
    getCachedHover,
    getSpareDragActivationDistance,
    getSpareGestureConfigurationEpoch,
    notifySparePieceDragStart,
    notifySparePiecePress,
    refreshCachedBounds,
    register,
    requestAccessibleSpare,
    requestVerifiedDrop,
    setProviderGeometryRevision,
    subscribeBoardConfiguration,
    unregister,
    update,
    verifyDrop,
  });
}
