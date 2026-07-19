import { StyleSheet, type StyleProp, type ViewStyle } from 'react-native';

import { defaultTheme } from '../../src';
import {
  resolveBoardStyle,
  resolveDraggingPieceGhostStyle,
  resolveDraggingPieceStyle,
  resolveNotationStyle,
  resolvePieceStyle,
  resolveSquareStyle,
} from '../../src/render/style-resolution';

describe('native visual defaults', () => {
  it('[PARITY-EXPORT-DEFAULT-BOARD-STYLE] exports the native board paint default', () => {
    expect(defaultTheme.board).toEqual({
      backgroundColor: '#e7e0d2',
      overflow: 'hidden',
    });
  });

  it('[PARITY-EXPORT-DEFAULT-SQUARE-STYLE] exports centered square defaults', () => {
    expect(defaultTheme.square).toEqual({
      alignItems: 'center',
      justifyContent: 'center',
      overflow: 'hidden',
    });
  });

  it('[PARITY-EXPORT-DEFAULT-DARK-SQUARE-STYLE] preserves the upstream dark color', () => {
    expect(defaultTheme.darkSquare).toEqual({ backgroundColor: '#B58863' });
  });

  it('[PARITY-EXPORT-DEFAULT-LIGHT-SQUARE-STYLE] preserves the upstream light color', () => {
    expect(defaultTheme.lightSquare).toEqual({ backgroundColor: '#F0D9B5' });
  });

  it('exports non-geometric controlled selection paint defaults', () => {
    expect(defaultTheme.destinationSquare).toEqual({
      boxShadow: 'inset 0 0 0 3px rgba(76, 175, 80, 0.9)',
    });
    expect(defaultTheme.selectedSquare).toEqual({
      boxShadow: 'inset 0 0 0 3px rgba(255, 170, 0, 0.95)',
    });
    expect(defaultTheme.disabledSquare).toEqual({ opacity: 0.45 });
  });

  it('[PARITY-EXPORT-DEFAULT-DROP-SQUARE-STYLE] exports the pinned drop-target default', () => {
    expect(defaultTheme.dropTarget).toEqual({
      boxShadow: 'inset 0px 0px 0px 1px black',
    });
  });

  it('[PARITY-EXPORT-DEFAULT-DRAGGING-PIECE-STYLE] exports the pinned dragging-piece default', () => {
    const draggingPiece = StyleSheet.flatten<ViewStyle>(
      defaultTheme.draggingPiece,
    );

    expect(defaultTheme.draggingPiece).toEqual({
      transform: [{ scale: 1.2 }],
    });
    expect(Object.isFrozen(draggingPiece.transform)).toBe(true);
    expect(Object.isFrozen(draggingPiece.transform?.[0])).toBe(true);
  });

  it('[PARITY-EXPORT-DEFAULT-DRAGGING-PIECE-GHOST-STYLE] exports the pinned source-ghost default', () => {
    expect(defaultTheme.draggingPieceGhost).toEqual({ opacity: 0.5 });
  });

  it('[PARITY-EXPORT-DEFAULT-DARK-SQUARE-NOTATION-STYLE] exports dark-square contrast', () => {
    expect(defaultTheme.darkSquareNotation).toEqual({ color: '#F0D9B5' });
  });

  it('[PARITY-EXPORT-DEFAULT-LIGHT-SQUARE-NOTATION-STYLE] exports light-square contrast', () => {
    expect(defaultTheme.lightSquareNotation).toEqual({ color: '#B58863' });
  });

  it('[PARITY-EXPORT-DEFAULT-ALPHA-NOTATION-STYLE] exports native file-label placement', () => {
    expect(defaultTheme.fileNotation).toEqual({
      bottom: 1,
      fontSize: 13,
      fontWeight: '700',
      includeFontPadding: false,
      position: 'absolute',
      right: 3,
    });
  });

  it('[PARITY-EXPORT-DEFAULT-NUMERIC-NOTATION-STYLE] exports native rank-label placement', () => {
    expect(defaultTheme.rankNotation).toEqual({
      fontSize: 13,
      fontWeight: '700',
      includeFontPadding: false,
      left: 2,
      position: 'absolute',
      top: 2,
    });
  });

  it('freezes the public default container and each style without freezing consumers', () => {
    const consumer = { backgroundColor: '#123456' };
    const resolved = resolveBoardStyle({ board: consumer }, undefined);

    expect(Object.isFrozen(defaultTheme)).toBe(true);
    for (const value of Object.values(defaultTheme)) {
      expect(Object.isFrozen(value)).toBe(true);
    }
    expect(Object.isFrozen(resolved)).toBe(true);
    expect(Object.isFrozen(consumer)).toBe(false);
    expect(consumer).toEqual({ backgroundColor: '#123456' });
  });
});

describe('native style resolution', () => {
  it('[PARITY-OPTION-BOARD-STYLE] applies instance board paint after theme paint', () => {
    expect(
      resolveBoardStyle(
        { board: { backgroundColor: '#111111', opacity: 0.7 } },
        { board: { backgroundColor: '#222222' } },
      ),
    ).toEqual({
      backgroundColor: '#222222',
      opacity: 0.7,
      overflow: 'hidden',
    });
  });

  it('keeps measured board geometry out of consumer board paint', () => {
    expect(
      resolveBoardStyle(
        {
          board: {
            aspectRatio: 3,
            borderWidth: 8,
            boxSizing: 'content-box',
            display: 'none',
            margin: 20,
            marginBlockEnd: 21,
            marginInlineStart: 22,
            paddingLeft: 20,
            pointerEvents: 'auto',
            transform: [{ scale: 2 }],
            transformOrigin: 'left top',
            width: 80,
          },
        },
        { board: { height: 40, maxWidth: 90, opacity: 0.5 } },
      ),
    ).toEqual({
      backgroundColor: '#e7e0d2',
      opacity: 0.5,
      overflow: 'hidden',
    });
  });

  it('[PARITY-OPTION-SQUARE-STYLE] applies the instance base square style after its theme', () => {
    expect(
      resolveSquareStyle({
        isLight: true,
        square: 'a1',
        styles: { square: { borderRadius: 8 } },
        theme: { square: { borderRadius: 4, opacity: 0.8 } },
      }),
    ).toEqual(expect.objectContaining({ borderRadius: 8, opacity: 0.8 }));
  });

  it('[PARITY-OPTION-SQUARE-STYLES] applies canonical per-square paint last in the static chain', () => {
    expect(
      resolveSquareStyle({
        isLight: false,
        square: 'c3',
        squareStyles: { c3: { backgroundColor: '#c0ffee' } },
        styles: { darkSquare: { backgroundColor: '#222222' } },
        theme: { darkSquare: { backgroundColor: '#111111' } },
      }).backgroundColor,
    ).toBe('#c0ffee');
  });

  it('[PARITY-OPTION-DARK-SQUARE-STYLE] resolves reusable dark-square theme paint', () => {
    expect(
      resolveSquareStyle({
        isLight: false,
        square: 'a1',
        theme: { darkSquare: { backgroundColor: '#101820' } },
      }).backgroundColor,
    ).toBe('#101820');
  });

  it('[PARITY-OPTION-LIGHT-SQUARE-STYLE] resolves reusable light-square theme paint', () => {
    expect(
      resolveSquareStyle({
        isLight: true,
        square: 'a2',
        theme: { lightSquare: { backgroundColor: '#f2e8cf' } },
      }).backgroundColor,
    ).toBe('#f2e8cf');
  });

  it('applies controlled destination, selected, and disabled paint after canonical square styles', () => {
    const resolved = resolveSquareStyle({
      isLight: true,
      square: 'e4',
      squareStyles: {
        e4: { boxShadow: 'inset 0 0 0 1px static', opacity: 0.9 },
      },
      state: {
        isDestination: true,
        isDisabled: true,
        isDropTarget: false,
        isSelected: true,
      },
      styles: {
        destinationSquare: { boxShadow: 'inset 0 0 0 2px destination' },
        disabledSquare: { opacity: 0.25 },
        selectedSquare: { boxShadow: 'inset 0 0 0 3px selected' },
      },
      theme: {
        destinationSquare: { boxShadow: 'inset 0 0 0 4px theme-destination' },
        disabledSquare: { opacity: 0.5 },
        selectedSquare: { boxShadow: 'inset 0 0 0 5px theme-selected' },
      },
    });

    expect(resolved).toEqual(
      expect.objectContaining({
        boxShadow: 'inset 0 0 0 3px selected',
        opacity: 0.25,
      }),
    );
  });

  it('does not apply controlled selection slots when their flags are false', () => {
    const resolved = resolveSquareStyle({
      isLight: false,
      square: 'e5',
      state: {
        isDestination: false,
        isDisabled: false,
        isDropTarget: false,
        isSelected: false,
      },
      styles: {
        destinationSquare: { opacity: 0.1 },
        disabledSquare: { opacity: 0.2 },
        selectedSquare: { opacity: 0.3 },
      },
    });

    expect(resolved.opacity).toBeUndefined();
    expect(resolved.boxShadow).toBeUndefined();
  });

  it('[PARITY-OPTION-DROP-SQUARE-STYLE] applies instance drop-target paint after its theme', () => {
    const resolved = resolveSquareStyle({
      isLight: true,
      square: 'e4',
      squareStyles: {
        e4: { boxShadow: 'inset 0 0 0 2px static', opacity: 0.9 },
      },
      state: {
        isDestination: true,
        isDisabled: true,
        isDropTarget: true,
        isSelected: true,
      },
      styles: {
        disabledSquare: { opacity: 0.25 },
        dropTarget: {
          boxShadow: 'inset 0 0 0 6px instance-drop',
          opacity: 0.95,
        },
        selectedSquare: { boxShadow: 'inset 0 0 0 4px selected' },
      },
      theme: {
        dropTarget: { boxShadow: 'inset 0 0 0 5px theme-drop' },
      },
    });

    expect(resolved).toEqual(
      expect.objectContaining({
        boxShadow: 'inset 0 0 0 6px instance-drop',
        opacity: 0.95,
      }),
    );
  });

  it('[PARITY-BEHAVIOR-B45] gives drop-target paint final square-state precedence', () => {
    const resolved = resolveSquareStyle({
      isLight: true,
      square: 'e4',
      squareStyles: { e4: { opacity: 0.9 } },
      state: {
        isDestination: true,
        isDisabled: true,
        isDropTarget: true,
        isSelected: true,
      },
      styles: {
        destinationSquare: { opacity: 0.8 },
        disabledSquare: { opacity: 0.7 },
        dropTarget: { opacity: 0.4 },
        selectedSquare: { opacity: 0.6 },
      },
    });

    expect(resolved.opacity).toBe(0.4);
  });

  it('[PARITY-OPTION-DARK-SQUARE-NOTATION-STYLE] applies dark-square notation contrast', () => {
    expect(
      resolveNotationStyle({
        axis: 'rank',
        cellHeight: 40,
        cellWidth: 40,
        isLight: false,
        theme: { darkSquareNotation: { color: '#abcdef' } },
      }).color,
    ).toBe('#abcdef');
  });

  it('[PARITY-OPTION-LIGHT-SQUARE-NOTATION-STYLE] applies light-square notation contrast', () => {
    expect(
      resolveNotationStyle({
        axis: 'file',
        cellHeight: 40,
        cellWidth: 40,
        isLight: true,
        theme: { lightSquareNotation: { color: '#123456' } },
      }).color,
    ).toBe('#123456');
  });

  it('[PARITY-OPTION-ALPHA-NOTATION-STYLE] applies file-label instance typography last', () => {
    expect(
      resolveNotationStyle({
        axis: 'file',
        cellHeight: 40,
        cellWidth: 40,
        isLight: true,
        styles: { fileNotation: { bottom: 5, fontSize: 9 } },
      }),
    ).toEqual(expect.objectContaining({ bottom: 5, fontSize: 9 }));
  });

  it('[PARITY-OPTION-NUMERIC-NOTATION-STYLE] applies rank-label instance typography last', () => {
    expect(
      resolveNotationStyle({
        axis: 'rank',
        cellHeight: 40,
        cellWidth: 40,
        isLight: false,
        styles: { rankNotation: { fontSize: 10, top: 6 } },
      }),
    ).toEqual(expect.objectContaining({ fontSize: 10, top: 6 }));
  });

  it('lets native line height follow an overridden font size unless explicitly set', () => {
    const options = {
      axis: 'file' as const,
      cellHeight: 40,
      cellWidth: 40,
      isLight: true,
    };

    const derived = resolveNotationStyle({
      ...options,
      styles: { fileNotation: { fontSize: 24 } },
    });
    const explicit = resolveNotationStyle({
      ...options,
      styles: { fileNotation: { fontSize: 24, lineHeight: 30 } },
    });

    expect(derived.fontSize).toBe(24);
    expect(derived.lineHeight).toBeUndefined();
    expect(explicit.lineHeight).toBe(30);
  });

  it('flattens registered and nested styles without mutating inputs', () => {
    const registered = StyleSheet.create({
      piece: { opacity: 0.8, transform: [{ scale: 0.9 }] },
    });
    const consumerPieceStyle = { opacity: 0.6 };
    const instance: StyleProp<ViewStyle> = [consumerPieceStyle, false, null];
    const resolved = resolvePieceStyle(
      { piece: registered.piece },
      { piece: instance },
      [{ opacity: 0.4, transform: [{ translateX: 2 }] }],
    );

    expect(resolved).toEqual(
      expect.objectContaining({
        opacity: 0.4,
        transform: [{ translateX: 2 }],
      }),
    );
    expect(consumerPieceStyle).toEqual({ opacity: 0.6 });
    expect(Object.isFrozen(consumerPieceStyle)).toBe(false);
  });

  it('[PARITY-OPTION-DRAGGING-PIECE-STYLE] resolves dragging paint after the complete static piece chain', () => {
    const themePiece = { backgroundColor: '#112233', opacity: 0.8 };
    const instancePiece = { borderRadius: 4, opacity: 0.7 };
    const themeDrag = { opacity: 0.9, transform: [{ scale: 1.1 }] };
    const instanceDrag = { opacity: 0.6, transform: [{ rotate: '5deg' }] };

    const dragging = resolveDraggingPieceStyle(
      { draggingPiece: themeDrag, piece: themePiece },
      { draggingPiece: instanceDrag, piece: instancePiece },
    );

    expect(dragging).toEqual({
      alignItems: 'center',
      backgroundColor: '#112233',
      borderRadius: 4,
      justifyContent: 'center',
      opacity: 0.6,
      transform: [{ rotate: '5deg' }],
    });
    expect(Object.isFrozen(dragging)).toBe(true);
    expect(themePiece).toEqual({ backgroundColor: '#112233', opacity: 0.8 });
    expect(instanceDrag).toEqual({
      opacity: 0.6,
      transform: [{ rotate: '5deg' }],
    });
  });

  it('[PARITY-OPTION-DRAGGING-PIECE-GHOST-STYLE] resolves source-ghost paint after the complete static piece chain', () => {
    const themePiece = { backgroundColor: '#112233', opacity: 0.8 };
    const instancePiece = { borderRadius: 4, opacity: 0.7 };
    const themeGhost = { opacity: 0.4 };
    const instanceGhost = { opacity: 0.3 };
    const ghost = resolveDraggingPieceGhostStyle(
      { draggingPieceGhost: themeGhost, piece: themePiece },
      { draggingPieceGhost: instanceGhost, piece: instancePiece },
    );

    expect(ghost).toEqual({
      alignItems: 'center',
      backgroundColor: '#112233',
      borderRadius: 4,
      justifyContent: 'center',
      opacity: 0.3,
    });
    expect(Object.isFrozen(ghost)).toBe(true);
    expect(themePiece).toEqual({ backgroundColor: '#112233', opacity: 0.8 });
    expect(instanceGhost).toEqual({ opacity: 0.3 });
  });

  it('keeps defaultTheme idempotent at responsive and full notation sizes', () => {
    for (const cellSize of [1, 40]) {
      for (const axis of ['file', 'rank'] as const) {
        const axisSlot = axis === 'file' ? 'fileNotation' : 'rankNotation';
        const options = {
          axis,
          cellHeight: cellSize,
          cellWidth: cellSize,
          isLight: true,
        };
        expect(
          resolveNotationStyle({ ...options, theme: defaultTheme }),
        ).toEqual(resolveNotationStyle(options));
        expect(
          resolveNotationStyle({
            ...options,
            theme: { ...defaultTheme },
          }),
        ).toEqual(resolveNotationStyle(options));
        expect(
          resolveNotationStyle({
            ...options,
            theme: {
              ...defaultTheme,
              [axisSlot]: { ...defaultTheme[axisSlot] },
            },
          }),
        ).toEqual(resolveNotationStyle(options));
      }
    }
  });

  it('keeps responsive notation when extending a nested default slot', () => {
    expect(
      resolveNotationStyle({
        axis: 'file',
        cellHeight: 1,
        cellWidth: 1,
        isLight: true,
        theme: {
          ...defaultTheme,
          fileNotation: {
            ...defaultTheme.fileNotation,
            fontFamily: 'Example Sans',
          },
        },
      }),
    ).toEqual(
      expect.objectContaining({
        fontFamily: 'Example Sans',
        fontSize: 0.325,
        right: 0.1,
      }),
    );
  });

  it('treats falsy conditional notation styles as absent overrides', () => {
    const fileOptions = {
      axis: 'file' as const,
      cellHeight: 40,
      cellWidth: 40,
      isLight: true,
    };
    const rankOptions = {
      axis: 'rank' as const,
      cellHeight: 40,
      cellWidth: 40,
      isLight: false,
    };

    expect(
      resolveNotationStyle({
        ...fileOptions,
        theme: { fileNotation: null, lightSquareNotation: false },
      }),
    ).toEqual(resolveNotationStyle(fileOptions));
    expect(
      resolveNotationStyle({
        ...rankOptions,
        theme: { darkSquareNotation: '', rankNotation: false },
      }),
    ).toEqual(resolveNotationStyle(rankOptions));
  });

  it('lets transient square paint win without mutating a prototype-less map', () => {
    const squareStyles = Object.assign(Object.create(null), {
      a1: { backgroundColor: '#333333' },
      __proto__: { backgroundColor: '#badbad' },
    }) as Readonly<Record<string, { readonly backgroundColor: string }>>;
    const resolved = resolveSquareStyle({
      isLight: false,
      square: 'a1',
      squareStyles,
      transientStyle: { backgroundColor: '#444444' },
    });

    expect(resolved.backgroundColor).toBe('#444444');
    expect(Object.getPrototypeOf(squareStyles)).toBeNull();
  });
});
