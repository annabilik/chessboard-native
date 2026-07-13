import {
  createBoardModelMetadata,
  prepareBoardModel,
  type NormalizedBoardModel,
} from '../../src/internal/board-model';
import {
  createSquareActivationEmitter,
  planSquareActivation,
  type SquareActivationRequest,
} from '../../src/internal/square-activation';
import type {
  ControlledPosition,
  ControlledSelection,
  PositionObject,
  SquareActivationIntent,
} from '../../src/public-types';

const DIMENSIONS = Object.freeze({ columns: 2, rows: 2 });

function readyModel(
  options: {
    readonly position?: ControlledPosition;
    readonly selection?: ControlledSelection;
  } = {},
): NormalizedBoardModel {
  const prepared = prepareBoardModel({
    boardId: 'analysis',
    development: true,
    dimensions: DIMENSIONS,
    position:
      options.position ??
      ({
        revision: 11,
        value: {
          a2: { id: 'source', pieceType: 'wP' },
          b1: { id: 'target', pieceType: 'bN' },
        },
      } satisfies ControlledPosition),
    previousMetadata: createBoardModelMetadata(),
    selection:
      options.selection ??
      ({
        destinationSquares: ['b1'],
        revision: 7,
        selectedSquare: 'a2',
      } satisfies ControlledSelection),
  });
  if (prepared.model.status !== 'ready') {
    throw new Error('Expected a ready normalized board model.');
  }
  return prepared.model;
}

function activationRequest(
  overrides: Partial<SquareActivationRequest> = {},
): SquareActivationRequest {
  return {
    action: 'activate',
    basePositionRevision: 11,
    baseSelectionRevision: 7,
    boardId: 'analysis',
    input: 'touch',
    isDestination: false,
    piece: { id: 'target', pieceType: 'bN' },
    selectedSquare: 'a2',
    square: 'b1',
    ...overrides,
  };
}

describe('square activation planning', () => {
  it('plans a detached touch destination through the move-request runtime', () => {
    const position = Object.freeze({
      revision: 11,
      value: Object.freeze({
        a2: Object.freeze({ id: 'source', pieceType: 'wP' }),
        b1: Object.freeze({ id: 'target', pieceType: 'bN' }),
      }),
    }) satisfies ControlledPosition;
    const selection: ControlledSelection = Object.freeze({
      destinationSquares: Object.freeze(['b1']),
      revision: 7,
      selectedSquare: 'a2',
    });
    const model = readyModel({ position, selection });
    const plan = planSquareActivation({
      activationEnabled: true,
      input: 'touch',
      model,
      moveEnabled: true,
      square: 'b1',
    });

    expect(plan).toEqual({
      request: {
        basePositionRevision: 11,
        boardId: 'analysis',
        input: 'tap',
        piece: { id: 'source', pieceType: 'wP' },
        source: { kind: 'board', square: 'a2' },
        targetSquare: 'b1',
      },
      type: 'request-move',
    });
    if (plan.type !== 'request-move') {
      throw new Error('Expected a move request plan.');
    }
    expect(Object.isFrozen(plan)).toBe(true);
    expect(Object.isFrozen(plan.request)).toBe(true);
    expect(Object.isFrozen(plan.request.piece)).toBe(true);
    expect(Object.isFrozen(plan.request.source)).toBe(true);
    expect(plan.request.piece).not.toBe(position.value.a2);
    expect(position).toEqual({
      revision: 11,
      value: {
        a2: { id: 'source', pieceType: 'wP' },
        b1: { id: 'target', pieceType: 'bN' },
      },
    });
    expect(selection).toEqual({
      destinationSquares: ['b1'],
      revision: 7,
      selectedSquare: 'a2',
    });
  });

  it('maps accessible and same-square destinations without applying chess rules', () => {
    const model = readyModel({
      selection: {
        destinationSquares: ['a2'],
        revision: 19,
        selectedSquare: 'a2',
      },
    });
    const plan = planSquareActivation({
      activationEnabled: true,
      input: 'accessibility',
      model,
      moveEnabled: true,
      square: 'a2',
    });

    expect(plan).toEqual({
      request: {
        basePositionRevision: 11,
        boardId: 'analysis',
        input: 'accessibility',
        piece: { id: 'source', pieceType: 'wP' },
        source: { kind: 'board', square: 'a2' },
        targetSquare: 'a2',
      },
      type: 'request-move',
    });
  });

  it('emits current activation context when no destination move wins', () => {
    const model = readyModel();
    const plan = planSquareActivation({
      activationEnabled: true,
      input: 'accessibility',
      model,
      moveEnabled: true,
      square: 'b2',
    });

    expect(plan).toEqual({
      request: {
        action: 'activate',
        basePositionRevision: 11,
        baseSelectionRevision: 7,
        boardId: 'analysis',
        input: 'accessibility',
        isDestination: false,
        piece: null,
        selectedSquare: 'a2',
        square: 'b2',
      },
      type: 'emit-activation',
    });
    if (plan.type !== 'emit-activation') {
      throw new Error('Expected an activation plan.');
    }
    expect(Object.isFrozen(plan)).toBe(true);
    expect(Object.isFrozen(plan.request)).toBe(true);
  });

  it('routes a destination with a missing current source to activation or fallback', () => {
    const model = readyModel({
      selection: {
        destinationSquares: ['b1'],
        revision: 8,
        selectedSquare: 'b2',
      },
    });

    const activation = planSquareActivation({
      activationEnabled: true,
      input: 'touch',
      model,
      moveEnabled: true,
      square: 'b1',
    });
    expect(activation).toEqual({
      request: {
        action: 'activate',
        basePositionRevision: 11,
        baseSelectionRevision: 8,
        boardId: 'analysis',
        input: 'touch',
        isDestination: true,
        piece: { id: 'target', pieceType: 'bN' },
        selectedSquare: 'b2',
        square: 'b1',
      },
      type: 'emit-activation',
    });
    expect(
      planSquareActivation({
        activationEnabled: false,
        input: 'touch',
        model,
        moveEnabled: true,
        square: 'b1',
      }),
    ).toEqual({ type: 'fallback' });
  });

  it('preserves the legacy fallback for a destination without activation opt-in', () => {
    const model = readyModel();

    expect(
      planSquareActivation({
        activationEnabled: false,
        input: 'touch',
        model,
        moveEnabled: true,
        square: 'b1',
      }),
    ).toEqual({ type: 'fallback' });
  });

  it('blocks disabled ordinary activation but permits explicit controlled clearing', () => {
    const model = readyModel({
      selection: {
        destinationSquares: ['a2'],
        disabledSquares: ['a2'],
        revision: 23,
        selectedSquare: 'a2',
      },
    });

    expect(
      planSquareActivation({
        activationEnabled: true,
        input: 'touch',
        model,
        moveEnabled: true,
        square: 'a2',
      }),
    ).toEqual({ type: 'blocked' });

    const clear = planSquareActivation({
      action: 'clear-selection',
      activationEnabled: true,
      input: 'accessibility',
      model,
      moveEnabled: true,
      square: 'a2',
    });
    expect(clear).toEqual({
      request: {
        action: 'clear-selection',
        basePositionRevision: 11,
        baseSelectionRevision: 23,
        boardId: 'analysis',
        input: 'accessibility',
        isDestination: true,
        piece: { id: 'source', pieceType: 'wP' },
        selectedSquare: 'a2',
        square: 'a2',
      },
      type: 'emit-activation',
    });
    expect(
      planSquareActivation({
        action: 'clear-selection',
        activationEnabled: false,
        input: 'accessibility',
        model,
        moveEnabled: true,
        square: 'a2',
      }),
    ).toEqual({ type: 'fallback' });
  });

  it('blocks ordinary activation when the controlled selected source is disabled', () => {
    const model = readyModel({
      selection: {
        destinationSquares: ['b1'],
        disabledSquares: ['a2'],
        revision: 24,
        selectedSquare: 'a2',
      },
    });

    expect(
      planSquareActivation({
        activationEnabled: true,
        input: 'touch',
        model,
        moveEnabled: true,
        square: 'b1',
      }),
    ).toEqual({ type: 'blocked' });
  });

  it('blocks unavailable or foreign squares and otherwise falls back without a callback', () => {
    const model = readyModel();
    expect(
      planSquareActivation({
        activationEnabled: false,
        input: 'touch',
        model,
        moveEnabled: false,
        square: 'a1',
      }),
    ).toEqual({ type: 'fallback' });
    expect(
      planSquareActivation({
        activationEnabled: true,
        input: 'touch',
        model,
        moveEnabled: true,
        square: 'c1',
      }),
    ).toEqual({ type: 'blocked' });

    const disabled = prepareBoardModel({
      boardId: 'analysis',
      development: false,
      dimensions: DIMENSIONS,
      position: { revision: 1, value: { c1: { pieceType: 'wP' } } },
      previousMetadata: createBoardModelMetadata(),
    }).model;
    expect(
      planSquareActivation({
        activationEnabled: true,
        input: 'accessibility',
        model: disabled,
        moveEnabled: true,
        square: 'a1',
      }),
    ).toEqual({ type: 'blocked' });
  });

  it('[CBN-CONTRACT-012-SELECTION-CONSUMER-OWNED] never mutates or substitutes for the current controlled selection', () => {
    const value: PositionObject = Object.freeze({
      a2: Object.freeze({ id: 'source', pieceType: 'wP' }),
    });
    const selection: ControlledSelection = Object.freeze({
      destinationSquares: Object.freeze(['a1']),
      revision: 5,
      selectedSquare: 'a2',
    });
    const model = readyModel({
      position: Object.freeze({ revision: 4, value }),
      selection,
    });

    const first = planSquareActivation({
      activationEnabled: true,
      input: 'touch',
      model,
      moveEnabled: false,
      square: 'a1',
    });
    const second = planSquareActivation({
      activationEnabled: true,
      input: 'touch',
      model,
      moveEnabled: false,
      square: 'a1',
    });

    expect(first).toEqual(second);
    expect(model.selection?.revision).toBe(5);
    expect(model.selection?.value).toEqual({
      destinationSquares: ['a1'],
      selectedSquare: 'a2',
    });
    expect(selection).toEqual({
      destinationSquares: ['a1'],
      revision: 5,
      selectedSquare: 'a2',
    });
    expect(value).toEqual({ a2: { id: 'source', pieceType: 'wP' } });
  });
});

describe('square activation emitter', () => {
  it('allocates deterministic unique IDs only for installed callbacks', () => {
    const intents: SquareActivationIntent[] = [];
    const emitter = createSquareActivationEmitter({
      boardId: 'analysis',
      intentIdPrefix: 'test-activation:',
    });

    expect(emitter.emit(activationRequest())).toBeNull();
    emitter.setHandler((intent) => intents.push(intent));
    expect(emitter.emit(activationRequest())).toBe('test-activation:0');
    expect(emitter.emit(activationRequest({ square: 'a1' }))).toBe(
      'test-activation:1',
    );
    expect(intents.map(({ intentId }) => intentId)).toEqual([
      'test-activation:0',
      'test-activation:1',
    ]);
  });

  it('detaches and freezes emitted payloads without retaining extra fields', () => {
    const intents: SquareActivationIntent[] = [];
    const emitter = createSquareActivationEmitter({ boardId: 'analysis' });
    const piece = { id: 'mutable', pieceType: 'bQ' };
    const request = {
      ...activationRequest({ piece }),
      shadowSelection: { selectedSquare: 'h8' },
    } as SquareActivationRequest;
    emitter.setHandler((intent) => intents.push(intent));

    expect(emitter.emit(request)).toBe('activation:8:analysis:0');
    piece.pieceType = 'changed';

    const intent = intents[0];
    expect(intent).toEqual({
      ...activationRequest({ piece: { id: 'mutable', pieceType: 'bQ' } }),
      intentId: 'activation:8:analysis:0',
    });
    expect(intent).not.toHaveProperty('shadowSelection');
    expect(Object.isFrozen(intent)).toBe(true);
    expect(Object.isFrozen(intent?.piece)).toBe(true);
    expect(intent?.piece).not.toBe(piece);
  });

  it('fails closed for foreign or malformed requests without consuming an ID', () => {
    const intents: SquareActivationIntent[] = [];
    const emitter = createSquareActivationEmitter({
      boardId: 'analysis',
      intentIdPrefix: 'guarded:',
    });
    emitter.setHandler((intent) => intents.push(intent));

    expect(
      emitter.emit(activationRequest({ boardId: 'another-board' })),
    ).toBeNull();
    expect(
      emitter.emit(
        activationRequest({
          basePositionRevision: -1,
        }),
      ),
    ).toBeNull();
    expect(emitter.emit(activationRequest())).toBe('guarded:0');
    expect(intents).toHaveLength(1);
  });

  it('emits the final safe-integer sequence once and then fails closed', () => {
    const intents: SquareActivationIntent[] = [];
    const emitter = createSquareActivationEmitter({
      boardId: 'analysis',
      intentIdPrefix: 'exhaustion:',
      nextIntentSequence: Number.MAX_SAFE_INTEGER,
    });
    emitter.setHandler((intent) => intents.push(intent));

    expect(emitter.emit(activationRequest())).toBe(
      `exhaustion:${String(Number.MAX_SAFE_INTEGER)}`,
    );
    expect(emitter.emit(activationRequest())).toBeNull();
    expect(intents).toHaveLength(1);
  });

  it('isolates throwing callbacks and permanently disables a disposed emitter', () => {
    const emitter = createSquareActivationEmitter({ boardId: 'analysis' });
    emitter.setHandler(() => {
      throw new Error('consumer failure');
    });
    expect(emitter.emit(activationRequest())).toBe('activation:8:analysis:0');
    emitter.dispose();
    emitter.setHandler(jest.fn());
    expect(emitter.emit(activationRequest())).toBeNull();
  });

  it('rejects invalid identity configuration', () => {
    expect(() => createSquareActivationEmitter({ boardId: ' ' })).toThrow(
      RangeError,
    );
    expect(() =>
      createSquareActivationEmitter({
        boardId: 'analysis',
        intentIdPrefix: '',
      }),
    ).toThrow(RangeError);
    expect(() =>
      createSquareActivationEmitter({
        boardId: 'analysis',
        nextIntentSequence: -1,
      }),
    ).toThrow(RangeError);
  });
});
