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
  'fileNotation',
  'lightSquare',
  'lightSquareNotation',
  'piece',
  'rankNotation',
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

  const flattened = StyleSheet.flatten<TextStyle>(value);
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
          lineHeight: fontSize,
          right: Math.min(3, cellSize * 0.1),
        }
      : {
          fontSize,
          left: Math.min(2, cellSize * 0.08),
          lineHeight: fontSize,
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
