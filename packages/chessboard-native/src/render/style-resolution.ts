import {
  StyleSheet,
  type StyleProp,
  type TextStyle,
  type ViewStyle,
} from 'react-native';

import type {
  ChessboardStyles,
  ChessboardTheme,
  SquareId,
  SquareStyles,
  SquareVisualState,
} from '../public-types';
import { defaultTheme } from '../theme';

const MAX_NOTATION_FONT_SIZE = 13;
const NOTATION_SCALE = 0.325;
const BOARD_GEOMETRY_KEYS = Object.freeze([
  'alignContent',
  'alignItems',
  'alignSelf',
  'aspectRatio',
  'borderBottomWidth',
  'borderEndWidth',
  'borderLeftWidth',
  'borderRightWidth',
  'borderStartWidth',
  'borderTopWidth',
  'borderWidth',
  'bottom',
  'boxSizing',
  'columnGap',
  'display',
  'end',
  'flex',
  'flexBasis',
  'flexDirection',
  'flexGrow',
  'flexShrink',
  'flexWrap',
  'gap',
  'height',
  'inset',
  'insetBlock',
  'insetBlockEnd',
  'insetBlockStart',
  'insetInline',
  'insetInlineEnd',
  'insetInlineStart',
  'justifyContent',
  'left',
  'margin',
  'marginBlock',
  'marginBlockEnd',
  'marginBlockStart',
  'marginBottom',
  'marginEnd',
  'marginHorizontal',
  'marginInline',
  'marginInlineEnd',
  'marginInlineStart',
  'marginLeft',
  'marginRight',
  'marginStart',
  'marginTop',
  'marginVertical',
  'maxHeight',
  'maxWidth',
  'minHeight',
  'minWidth',
  'padding',
  'paddingBlock',
  'paddingBlockEnd',
  'paddingBlockStart',
  'paddingBottom',
  'paddingEnd',
  'paddingHorizontal',
  'paddingInline',
  'paddingInlineEnd',
  'paddingInlineStart',
  'paddingLeft',
  'paddingRight',
  'paddingStart',
  'paddingTop',
  'paddingVertical',
  'position',
  'pointerEvents',
  'right',
  'rowGap',
  'start',
  'top',
  'transform',
  'transformOrigin',
  'width',
] as const satisfies readonly (keyof ViewStyle)[]);
const BOARD_GEOMETRY_KEY_SET: ReadonlySet<string> = new Set(
  BOARD_GEOMETRY_KEYS,
);
const THEME_SLOTS = Object.freeze([
  'board',
  'darkSquare',
  'darkSquareNotation',
  'destinationSquare',
  'disabledSquare',
  'draggingPiece',
  'draggingPieceGhost',
  'dropTarget',
  'fileNotation',
  'lightSquare',
  'lightSquareNotation',
  'piece',
  'rankNotation',
  'selectedSquare',
  'square',
] as const satisfies readonly (keyof ChessboardTheme)[]);

function flattenAndFreeze<Style extends TextStyle | ViewStyle>(
  values: readonly StyleProp<Style>[],
): Readonly<Style> {
  const flattened = StyleSheet.flatten<Style>([...values]);
  return Object.freeze({ ...flattened }) as Readonly<Style>;
}

function ownSquareStyle(
  squareStyles: SquareStyles | undefined,
  square: SquareId,
): StyleProp<ViewStyle> | undefined {
  if (
    squareStyles === undefined ||
    !Object.prototype.hasOwnProperty.call(squareStyles, square)
  ) {
    return undefined;
  }

  return (squareStyles as Readonly<Record<string, StyleProp<ViewStyle>>>)[
    square
  ];
}

function themeDerivesFromDefault(theme: ChessboardTheme): boolean {
  return THEME_SLOTS.some(
    (slot) => theme[slot] !== undefined && theme[slot] === defaultTheme[slot],
  );
}

function notationThemeOverride(
  theme: ChessboardTheme | undefined,
  slot:
    | 'darkSquareNotation'
    | 'fileNotation'
    | 'lightSquareNotation'
    | 'rankNotation',
): StyleProp<TextStyle> {
  const value = theme?.[slot];
  if (value === undefined || value === defaultTheme[slot]) {
    return undefined;
  }

  const flattened: unknown = StyleSheet.flatten<TextStyle>(value);
  if (flattened === null || typeof flattened !== 'object') {
    return undefined;
  }
  const baseline = StyleSheet.flatten<TextStyle>(defaultTheme[slot]);
  const entries = Object.entries(flattened);
  const equalsDefault =
    entries.length === Object.keys(baseline).length &&
    entries.every(
      ([key, entry]) =>
        Object.prototype.hasOwnProperty.call(baseline, key) &&
        Object.is(entry, (baseline as Readonly<Record<string, unknown>>)[key]),
    );

  if (equalsDefault) {
    return undefined;
  }
  if (theme === undefined || !themeDerivesFromDefault(theme)) {
    return value;
  }

  return Object.fromEntries(
    entries.filter(
      ([key, entry]) =>
        !Object.prototype.hasOwnProperty.call(baseline, key) ||
        !Object.is(entry, (baseline as Readonly<Record<string, unknown>>)[key]),
    ),
  );
}

/** Resolve package, theme, and instance board paint without changing geometry. */
export function resolveBoardStyle(
  theme: ChessboardTheme | undefined,
  styles: ChessboardStyles | undefined,
): Readonly<ViewStyle> {
  const resolved = {
    ...StyleSheet.flatten<ViewStyle>([
      defaultTheme.board,
      theme?.board,
      styles?.board,
    ]),
  };
  const paintEntries = Object.entries(resolved).filter(
    ([key]) => !BOARD_GEOMETRY_KEY_SET.has(key),
  );

  return Object.freeze(Object.fromEntries(paintEntries) as ViewStyle);
}

/**
 * Resolve a canonical square through the complete static precedence chain.
 * A separate internal frame owns geometry regardless of the returned paint.
 */
export function resolveSquareStyle(options: {
  readonly isLight: boolean;
  readonly square: SquareId;
  readonly squareStyles?: SquareStyles | undefined;
  readonly styles?: ChessboardStyles | undefined;
  readonly theme?: ChessboardTheme | undefined;
  readonly state?: Readonly<
    Pick<
      SquareVisualState,
      'isDestination' | 'isDisabled' | 'isDropTarget' | 'isSelected'
    >
  >;
  readonly transientStyle?: StyleProp<ViewStyle>;
}): Readonly<ViewStyle> {
  const tone = options.isLight ? 'lightSquare' : 'darkSquare';

  return flattenAndFreeze<ViewStyle>([
    defaultTheme.square,
    defaultTheme[tone],
    options.theme?.square,
    options.theme?.[tone],
    options.styles?.square,
    options.styles?.[tone],
    ownSquareStyle(options.squareStyles, options.square),
    options.state?.isDestination ? defaultTheme.destinationSquare : undefined,
    options.state?.isDestination ? options.theme?.destinationSquare : undefined,
    options.state?.isDestination
      ? options.styles?.destinationSquare
      : undefined,
    options.state?.isSelected ? defaultTheme.selectedSquare : undefined,
    options.state?.isSelected ? options.theme?.selectedSquare : undefined,
    options.state?.isSelected ? options.styles?.selectedSquare : undefined,
    options.state?.isDisabled ? defaultTheme.disabledSquare : undefined,
    options.state?.isDisabled ? options.theme?.disabledSquare : undefined,
    options.state?.isDisabled ? options.styles?.disabledSquare : undefined,
    options.state?.isDropTarget ? defaultTheme.dropTarget : undefined,
    options.state?.isDropTarget ? options.theme?.dropTarget : undefined,
    options.state?.isDropTarget ? options.styles?.dropTarget : undefined,
    options.transientStyle,
  ]);
}

/** Resolve static piece styling before a renderer is invoked. */
export function resolvePieceStyle(
  theme: ChessboardTheme | undefined,
  styles: ChessboardStyles | undefined,
  transientStyles: readonly StyleProp<ViewStyle>[] = [],
): Readonly<ViewStyle> {
  return flattenAndFreeze<ViewStyle>([
    defaultTheme.piece,
    theme?.piece,
    styles?.piece,
    ...transientStyles,
  ]);
}

/** Resolve active drag-overlay paint after the complete static piece chain. */
export function resolveDraggingPieceStyle(
  theme: ChessboardTheme | undefined,
  styles: ChessboardStyles | undefined,
): Readonly<ViewStyle> {
  return flattenAndFreeze<ViewStyle>([
    defaultTheme.piece,
    theme?.piece,
    styles?.piece,
    defaultTheme.draggingPiece,
    theme?.draggingPiece,
    styles?.draggingPiece,
  ]);
}

/** Resolve active board or spare source-ghost paint after static piece paint. */
export function resolveDraggingPieceGhostStyle(
  theme: ChessboardTheme | undefined,
  styles: ChessboardStyles | undefined,
): Readonly<ViewStyle> {
  return flattenAndFreeze<ViewStyle>([
    defaultTheme.piece,
    theme?.piece,
    styles?.piece,
    defaultTheme.draggingPieceGhost,
    theme?.draggingPieceGhost,
    styles?.draggingPieceGhost,
  ]);
}

/** Resolve responsive file/rank notation while preserving consumer overrides. */
export function resolveNotationStyle(options: {
  readonly axis: 'file' | 'rank';
  readonly cellHeight: number;
  readonly cellWidth: number;
  readonly isLight: boolean;
  readonly styles?: ChessboardStyles | undefined;
  readonly theme?: ChessboardTheme | undefined;
}): Readonly<TextStyle> {
  const axis = options.axis === 'file' ? 'fileNotation' : 'rankNotation';
  const tone = options.isLight ? 'lightSquareNotation' : 'darkSquareNotation';
  const themeTone = notationThemeOverride(options.theme, tone);
  const themeAxis = notationThemeOverride(options.theme, axis);
  const cellSize = Math.min(options.cellHeight, options.cellWidth);
  const fontSize = Math.min(MAX_NOTATION_FONT_SIZE, cellSize * NOTATION_SCALE);
  const responsive: TextStyle =
    options.axis === 'file'
      ? {
          bottom: Math.min(1, cellSize * 0.04),
          fontSize,
          right: Math.min(3, cellSize * 0.1),
        }
      : {
          fontSize,
          left: Math.min(2, cellSize * 0.08),
          top: Math.min(2, cellSize * 0.08),
        };

  return flattenAndFreeze<TextStyle>([
    defaultTheme[tone],
    defaultTheme[axis],
    responsive,
    themeTone,
    themeAxis,
    options.styles?.[tone],
    options.styles?.[axis],
  ]);
}
