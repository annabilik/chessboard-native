import {
  createBoardGeometryEpochMetadata,
  reconcileBoardGeometryEpoch,
  type BoardGeometryEpochMapping,
} from '../../src/render/board-geometry-epoch';

const INITIAL_MAPPING: Readonly<BoardGeometryEpochMapping> = Object.freeze({
  columns: 8,
  height: 320,
  orientation: 'white',
  rows: 8,
  width: 320,
});

describe('board geometry epochs', () => {
  it('keeps one revision for value-identical effective mappings', () => {
    const initial = createBoardGeometryEpochMetadata();
    expect(reconcileBoardGeometryEpoch(initial, null)).toBe(initial);

    const observed = reconcileBoardGeometryEpoch(initial, INITIAL_MAPPING);
    const identical = reconcileBoardGeometryEpoch(observed, {
      ...INITIAL_MAPPING,
    });

    expect(observed).toEqual({
      mapping: INITIAL_MAPPING,
      observed: true,
      revision: 0,
    });
    expect(identical).toBe(observed);
    expect(observed.mapping).not.toBe(INITIAL_MAPPING);
    expect(Object.isFrozen(observed)).toBe(true);
    expect(Object.isFrozen(observed.mapping)).toBe(true);
  });

  it('increments for size, dimensions, orientation, and availability changes', () => {
    let metadata = reconcileBoardGeometryEpoch(
      createBoardGeometryEpochMetadata(),
      INITIAL_MAPPING,
    );
    const changes: readonly (Readonly<BoardGeometryEpochMapping> | null)[] = [
      { ...INITIAL_MAPPING, width: 321 },
      { ...INITIAL_MAPPING, height: 321, width: 321 },
      {
        ...INITIAL_MAPPING,
        columns: 4,
        height: 321,
        rows: 4,
        width: 321,
      },
      {
        ...INITIAL_MAPPING,
        columns: 4,
        height: 321,
        orientation: 'black',
        rows: 4,
        width: 321,
      },
      null,
      {
        ...INITIAL_MAPPING,
        columns: 4,
        height: 321,
        orientation: 'black',
        rows: 4,
        width: 321,
      },
    ];

    changes.forEach((mapping, index) => {
      metadata = reconcileBoardGeometryEpoch(metadata, mapping);
      expect(metadata.revision).toBe(index + 1);
    });
  });

  it('fails closed permanently instead of reusing an exhausted revision', () => {
    const maximum = reconcileBoardGeometryEpoch(
      createBoardGeometryEpochMetadata(Number.MAX_SAFE_INTEGER),
      INITIAL_MAPPING,
    );
    expect(maximum.revision).toBe(Number.MAX_SAFE_INTEGER);

    const exhausted = reconcileBoardGeometryEpoch(maximum, {
      ...INITIAL_MAPPING,
      orientation: 'black',
    });
    expect(exhausted).toEqual(
      expect.objectContaining({ observed: true, revision: null }),
    );

    expect(reconcileBoardGeometryEpoch(exhausted, INITIAL_MAPPING)).toBe(
      exhausted,
    );
    expect(reconcileBoardGeometryEpoch(exhausted, null)).toBe(exhausted);
    expect(() => createBoardGeometryEpochMetadata(-1)).toThrow(RangeError);
    expect(() =>
      createBoardGeometryEpochMetadata(Number.MAX_SAFE_INTEGER + 1),
    ).toThrow(RangeError);
  });
});
