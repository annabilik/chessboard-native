import { ChessboardError } from '../../src/ChessboardError';
import {
  createBoardModelMetadata,
  prepareBoardModel,
  type BoardModelMetadata,
  type PrepareBoardModelOptions,
} from '../../src/internal/board-model';
import {
  createErrorReportMetadata,
  planChessboardErrorReports,
} from '../../src/internal/error-reporting';

function prepare(
  input: Omit<PrepareBoardModelOptions, 'development' | 'previousMetadata'>,
  previousMetadata: BoardModelMetadata = createBoardModelMetadata(),
  development = false,
) {
  return prepareBoardModel({
    ...input,
    development,
    previousMetadata,
  });
}

function revokedErrorProxy(): Error {
  const { proxy, revoke } = Proxy.revocable(new Error('hidden message'), {});
  revoke();
  return proxy;
}

describe('normalized board model', () => {
  it('normalizes equal plain and revisioned values into equal current models', () => {
    const position = { e4: { id: 'pawn', pieceType: 'wP' } };
    const annotations = [
      { color: '#f00', from: 'e4', id: 'line', to: 'e5', type: 'arrow' },
    ];
    const selection = {
      destinationSquares: ['e5', 'e5'],
      selectedSquare: 'e4',
    };
    const plain = prepare({
      annotations,
      boardId: 'analysis',
      position,
      selection,
    });
    const revisioned = prepare({
      annotations: { revision: 11, value: annotations },
      boardId: 'analysis',
      position: { revision: 7, value: position },
      selection: { ...selection, revision: 13 },
    });

    expect(plain.model.status).toBe('ready');
    expect(revisioned.model.status).toBe('ready');
    expect(plain.model.position?.value).toEqual(
      revisioned.model.position?.value,
    );
    expect(plain.model.annotations?.value).toEqual(
      revisioned.model.annotations?.value,
    );
    expect(plain.model.selection?.value).toEqual(
      revisioned.model.selection?.value,
    );
    expect(plain.model.position?.revision).toBe(0);
    expect(plain.model.annotations?.revision).toBe(0);
    expect(plain.model.selection?.revision).toBe(0);
    expect(revisioned.model.position?.revision).toBe(7);
    expect(revisioned.model.annotations?.revision).toBe(11);
    expect(revisioned.model.selection?.revision).toBe(13);

    const equalPlain = prepare(
      {
        annotations: [
          {
            type: 'arrow',
            to: 'e5',
            id: 'line',
            from: 'e4',
            color: '#f00',
          },
        ],
        boardId: 'analysis',
        position: { e4: { pieceType: 'wP', id: 'pawn' } },
        selection: {
          destinationSquares: ['e5'],
          selectedSquare: 'e4',
        },
      },
      plain.nextMetadata,
    );
    expect(equalPlain.nextMetadata).toBe(plain.nextMetadata);
    expect(equalPlain.nextMetadata).not.toHaveProperty('value');
    expect(equalPlain.nextMetadata.position).not.toHaveProperty('value');
  });

  it('applies each production fallback only to its declared recovery domain', () => {
    const invalidPosition = prepare({
      annotations: [
        { color: '#f00', id: 'mark', square: 'e4', type: 'square' },
      ],
      boardId: 'analysis',
      position: { A1: { pieceType: 'wR' } },
      selection: { selectedSquare: 'e4' },
    });
    expect(invalidPosition.model).toEqual(
      expect.objectContaining({
        annotations: null,
        position: null,
        selection: null,
        status: 'disabled',
      }),
    );
    expect(invalidPosition.errors.map(({ code }) => code)).toEqual([
      'INVALID_POSITION_SQUARE',
    ]);

    const invalidAnnotations = prepare({
      annotations: [{ color: '#f00', id: '', square: 'e4', type: 'square' }],
      boardId: 'analysis',
      position: { e4: { pieceType: 'wP' } },
      selection: { selectedSquare: 'e4' },
    });
    expect(invalidAnnotations.model.status).toBe('ready');
    expect(invalidAnnotations.model.position).not.toBeNull();
    expect(invalidAnnotations.model.annotations).toBeNull();
    expect(invalidAnnotations.model.selection).not.toBeNull();
    expect(invalidAnnotations.errors[0]?.code).toBe('INVALID_ANNOTATIONS');

    const invalidSelection = prepare({
      annotations: [
        { color: '#f00', id: 'mark', square: 'e4', type: 'square' },
      ],
      boardId: 'analysis',
      position: { e4: { pieceType: 'wP' } },
      selection: { selectedSquare: 'A1' },
    });
    expect(invalidSelection.model.status).toBe('ready');
    expect(invalidSelection.model.position).not.toBeNull();
    expect(invalidSelection.model.annotations).not.toBeNull();
    expect(invalidSelection.model.selection).toBeNull();
    expect(invalidSelection.errors[0]?.code).toBe('INVALID_SELECTION');
  });

  it('validates dimensions before every controlled value domain', () => {
    const result = prepare({
      annotations: [],
      boardId: 'variant',
      dimensions: { columns: 0, rows: 8 },
      position: {},
      selection: { selectedSquare: null },
    });

    expect(result.model).toEqual(
      expect.objectContaining({
        annotations: null,
        dimensions: null,
        position: null,
        selection: null,
        status: 'disabled',
      }),
    );
    expect(result.errors.map(({ code }) => code)).toEqual([
      'INVALID_DIMENSIONS',
    ]);
    expect(result.nextMetadata.position.tier).toBeNull();
    expect(result.nextMetadata.annotations.tier).toBeNull();
    expect(result.nextMetadata.selection.tier).toBeNull();
  });

  it('locks board identity for the mounted model lifetime', () => {
    const first = prepare({ boardId: 'first', position: {} });
    const changed = prepare(
      { boardId: 'second', position: {} },
      first.nextMetadata,
    );

    expect(changed.model.status).toBe('disabled');
    expect(changed.model.boardId).toBeNull();
    expect(changed.errors[0]).toEqual(
      expect.objectContaining({
        boardId: 'second',
        code: 'BOARD_ID_CHANGED',
      }),
    );
    expect(changed.nextMetadata).toBe(first.nextMetadata);
  });

  it('preserves only current-render position commit correlation', () => {
    const first = prepare({
      boardId: 'analysis',
      position: {
        committedIntentId: 'analysis:move:1',
        revision: 1,
        value: { e4: { pieceType: 'wP' } },
      },
    });
    expect(first.model.position).toEqual(
      expect.objectContaining({ committedIntentId: 'analysis:move:1' }),
    );
    expect(first.nextMetadata.position).not.toHaveProperty('committedIntentId');

    const omitted = prepare(
      {
        boardId: 'analysis',
        position: {
          revision: 2,
          value: { e4: { pieceType: 'wP' } },
        },
      },
      first.nextMetadata,
    );
    expect(omitted.model.position).not.toHaveProperty('committedIntentId');
  });

  it('rejects whitespace-only board identity before interaction setup', () => {
    const production = prepare({ boardId: '   ', position: {} });
    expect(production.model.status).toBe('disabled');
    expect(production.errors[0]).toEqual(
      expect.objectContaining({ code: 'INVALID_BOARD_ID' }),
    );

    expect(() =>
      prepare({ boardId: '\t', position: {} }, undefined, true),
    ).toThrow(ChessboardError);
  });

  it('does not establish optional domain tiers while their props are omitted', () => {
    const omitted = prepare({ boardId: 'analysis', position: {} });
    expect(omitted.model.annotations).toBeNull();
    expect(omitted.model.selection).toBeNull();
    expect(omitted.nextMetadata.annotations.tier).toBeNull();
    expect(omitted.nextMetadata.selection.tier).toBeNull();

    const revisioned = prepare(
      {
        annotations: { revision: 2, value: [] },
        boardId: 'analysis',
        position: {},
        selection: { revision: 3, selectedSquare: null },
      },
      omitted.nextMetadata,
    );
    expect(revisioned.model.annotations?.tier).toBe('envelope');
    expect(revisioned.model.selection?.tier).toBe('envelope');

    const hidden = prepare(
      { boardId: 'analysis', position: {} },
      revisioned.nextMetadata,
    );
    expect(hidden.model.annotations).toBeNull();
    expect(hidden.model.selection).toBeNull();
    expect(hidden.nextMetadata.annotations).toBe(
      revisioned.nextMetadata.annotations,
    );
    expect(hidden.nextMetadata.selection).toBe(
      revisioned.nextMetadata.selection,
    );

    const switched = prepare(
      {
        annotations: [],
        boardId: 'analysis',
        position: {},
        selection: { selectedSquare: null },
      },
      hidden.nextMetadata,
    );
    expect(switched.errors.map(({ code }) => code)).toEqual([
      'ANNOTATION_CONTROL_TIER_CHANGED',
      'SELECTION_CONTROL_TIER_CHANGED',
    ]);
  });

  it('[CBN-CONTRACT-019-MALFORMED-INPUT-LOUD] throws typed development errors and plans production reports across every domain', () => {
    const cases: readonly [
      Omit<PrepareBoardModelOptions, 'development' | 'previousMetadata'>,
      string,
    ][] = [
      [{ boardId: '', position: {} }, 'INVALID_BOARD_ID'],
      [
        {
          boardId: 'analysis',
          dimensions: { columns: 8, rows: 0 },
          position: {},
        },
        'INVALID_DIMENSIONS',
      ],
      [
        {
          boardId: 'analysis',
          orientation: 'sideways',
          position: {},
        },
        'INVALID_ORIENTATION',
      ],
      [{ boardId: 'analysis', position: 'not/fen' }, 'INVALID_FEN'],
      [
        {
          boardId: 'analysis',
          position: { revision: -1, value: {} },
        },
        'INVALID_POSITION_REVISION',
      ],
      [
        {
          annotations: [
            { color: '#f00', id: '', square: 'e4', type: 'square' },
          ],
          boardId: 'analysis',
          position: {},
        },
        'INVALID_ANNOTATIONS',
      ],
      [
        {
          annotations: { revision: -1, value: [] },
          boardId: 'analysis',
          position: {},
        },
        'INVALID_ANNOTATION_REVISION',
      ],
      [
        {
          boardId: 'analysis',
          position: {},
          selection: { selectedSquare: 'A1' },
        },
        'INVALID_SELECTION',
      ],
      [
        {
          boardId: 'analysis',
          position: {},
          selection: { revision: -1, selectedSquare: null },
        },
        'INVALID_SELECTION_REVISION',
      ],
    ];

    for (const [input, code] of cases) {
      try {
        prepare(input, createBoardModelMetadata(), true);
        throw new Error('Expected malformed development input to throw.');
      } catch (error) {
        expect(error).toBeInstanceOf(ChessboardError);
        expect(error).toEqual(expect.objectContaining({ code }));
      }

      const productionCase = prepare(input);
      expect(productionCase.errors).toHaveLength(1);
      expect(productionCase.errors[0]).toEqual(
        expect.objectContaining({ code }),
      );
      const plannedCase = planChessboardErrorReports(
        productionCase.errors,
        createErrorReportMetadata(),
      );
      expect(plannedCase.reports).toHaveLength(1);
      expect(
        planChessboardErrorReports(
          productionCase.errors,
          plannedCase.nextMetadata,
        ).reports,
      ).toEqual([]);
    }

    const production = prepare({
      annotations: [{ color: '#f00', id: '', square: 'e4', type: 'square' }],
      boardId: 'analysis',
      position: 'not/fen',
      selection: { selectedSquare: 'A1' },
    });
    expect(production.errors.map(({ domain }) => domain)).toEqual([
      'position',
      'annotations',
      'selection',
    ]);
    expect(
      production.errors.every((error) => error instanceof ChessboardError),
    ).toBe(true);

    const first = planChessboardErrorReports(
      production.errors,
      createErrorReportMetadata(),
    );
    const replay = planChessboardErrorReports(
      production.errors,
      first.nextMetadata,
    );
    expect(first.reports).toHaveLength(3);
    expect(replay.reports).toEqual([]);
  });

  it('maps hostile dimensions to the dimensions recovery domain', () => {
    const { proxy, revoke } = Proxy.revocable({}, {});
    revoke();
    const result = prepare({
      boardId: 'analysis',
      dimensions: proxy,
      position: {},
    });
    expect(result.errors[0]).toEqual(
      expect.objectContaining({ code: 'INVALID_DIMENSIONS' }),
    );
    expect(result.errors[0]?.cause).toBeInstanceOf(TypeError);
  });

  it('never inspects consumer-thrown values outside typed recovery', () => {
    const dimensionsCause = revokedErrorProxy();
    const dimensions = Object.defineProperties(
      {},
      {
        columns: { value: 8 },
        rows: {
          get: () => {
            throw dimensionsCause;
          },
        },
      },
    );
    const invalidDimensions = prepare({
      boardId: 'analysis',
      dimensions,
      position: {},
    });
    expect(invalidDimensions.errors[0]).toEqual(
      expect.objectContaining({
        code: 'INVALID_DIMENSIONS',
        message: 'Invalid board dimensions.',
      }),
    );
    expect(invalidDimensions.errors[0]?.cause).toBe(dimensionsCause);

    const positionCause = revokedErrorProxy();
    const position = Object.defineProperty({}, 'a1', {
      enumerable: true,
      get: () => {
        throw positionCause;
      },
    });
    const annotationCause = revokedErrorProxy();
    const annotation = Object.defineProperties(
      {},
      {
        color: { enumerable: true, value: '#f00' },
        id: {
          enumerable: true,
          get: () => {
            throw annotationCause;
          },
        },
        square: { enumerable: true, value: 'a1' },
        type: { enumerable: true, value: 'square' },
      },
    );
    const selectionCause = revokedErrorProxy();
    const selection = Object.defineProperty({}, 'selectedSquare', {
      enumerable: true,
      get: () => {
        throw selectionCause;
      },
    });
    const invalidValues = prepare({
      annotations: [annotation],
      boardId: 'analysis',
      position,
      selection,
    });

    expect(invalidValues.errors).toEqual([
      expect.objectContaining({
        code: 'INVALID_POSITION',
        message: 'Invalid position.',
      }),
      expect.objectContaining({
        code: 'INVALID_ANNOTATIONS',
        message: 'Invalid annotations.',
      }),
      expect.objectContaining({
        code: 'INVALID_SELECTION',
        message: 'Invalid selection.',
      }),
    ]);
    expect(invalidValues.errors[0]?.cause).toBe(positionCause);
    expect(invalidValues.errors[1]?.cause).toBe(annotationCause);
    expect(invalidValues.errors[2]?.cause).toBe(selectionCause);
  });
});
