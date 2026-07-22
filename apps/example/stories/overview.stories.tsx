import {
  Chessboard,
  type BoardAnnotation,
  type BoardDimensions,
  type BoardOrientation,
  type ChessboardTheme,
  type PlainSelection,
  type PositionInput,
  type ReduceMotion,
} from '@vibechess/chessboard-native';
import { defaultPieceRenderers } from '@vibechess/chessboard-native/pieces';
import type { Meta, StoryObj } from '@storybook/react-native';
import { ScrollView, StyleSheet, Text, View } from 'react-native';

type AnnotationPreset = 'none' | 'shapes' | 'tactics';
type BoardPreset = 'five-by-three' | 'starting-position' | 'tactics';
type SelectionPreset = 'disabled' | 'none' | 'selected';
type ThemePreset = 'blue' | 'default' | 'high-contrast';

interface PlaygroundArgs {
  annotationPreset: AnnotationPreset;
  boardPreset: BoardPreset;
  orientation: BoardOrientation;
  reduceMotion: ReduceMotion;
  selectionPreset: SelectionPreset;
  showNotation: boolean;
  themePreset: ThemePreset;
  transitionDurationMs: number;
}

interface BoardFixture {
  readonly dimensions?: BoardDimensions;
  readonly position: PositionInput;
}

const FIVE_BY_THREE = Object.freeze({
  dimensions: Object.freeze({ columns: 5, rows: 3 }),
  position: Object.freeze({
    a1: Object.freeze({ id: 'white-rook', pieceType: 'wR' }),
    b2: Object.freeze({ id: 'white-knight', pieceType: 'wN' }),
    c2: Object.freeze({ id: 'white-pawn', pieceType: 'wP' }),
    d2: Object.freeze({ id: 'black-pawn', pieceType: 'bP' }),
    e3: Object.freeze({ id: 'black-king', pieceType: 'bK' }),
  }),
}) satisfies BoardFixture;

const STARTING_POSITION = Object.freeze({
  position: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR',
}) satisfies BoardFixture;

const TACTICS_POSITION = Object.freeze({
  position: Object.freeze({
    a8: Object.freeze({ id: 'black-rook-a8', pieceType: 'bR' }),
    c6: Object.freeze({ id: 'black-knight-c6', pieceType: 'bN' }),
    d5: Object.freeze({ id: 'black-pawn-d5', pieceType: 'bP' }),
    e8: Object.freeze({ id: 'black-king-e8', pieceType: 'bK' }),
    f7: Object.freeze({ id: 'black-pawn-f7', pieceType: 'bP' }),
    b2: Object.freeze({ id: 'white-pawn-b2', pieceType: 'wP' }),
    c3: Object.freeze({ id: 'white-knight-c3', pieceType: 'wN' }),
    d4: Object.freeze({ id: 'white-queen-d4', pieceType: 'wQ' }),
    e1: Object.freeze({ id: 'white-king-e1', pieceType: 'wK' }),
    h1: Object.freeze({ id: 'white-rook-h1', pieceType: 'wR' }),
  }),
}) satisfies BoardFixture;

const BOARD_FIXTURES: Readonly<Record<BoardPreset, BoardFixture>> =
  Object.freeze({
    'five-by-three': FIVE_BY_THREE,
    'starting-position': STARTING_POSITION,
    tactics: TACTICS_POSITION,
  });

const ANNOTATIONS = Object.freeze({
  none: Object.freeze([]),
  shapes: Object.freeze([
    Object.freeze({
      color: 'rgba(118, 81, 181, 0.45)',
      id: 'focus-circle',
      shape: 'circle',
      square: 'b2',
      type: 'square',
    }),
    Object.freeze({
      color: 'rgba(45, 143, 88, 0.45)',
      id: 'destination-dot',
      shape: 'dot',
      square: 'c2',
      type: 'square',
    }),
  ]),
  tactics: Object.freeze([
    Object.freeze({
      color: '#e46f18',
      from: 'a1',
      id: 'candidate-arrow',
      to: 'c2',
      type: 'arrow',
    }),
    Object.freeze({
      color: '#246bc2',
      from: 'b2',
      id: 'knight-arrow',
      shape: 'knight',
      to: 'd3',
      type: 'arrow',
    }),
  ]),
}) satisfies Readonly<Record<AnnotationPreset, readonly BoardAnnotation[]>>;

const SELECTIONS = Object.freeze({
  disabled: Object.freeze({
    destinationSquares: Object.freeze(['a3', 'c3']),
    disabledSquares: Object.freeze(['c3']),
    selectedSquare: 'b2',
  }),
  none: undefined,
  selected: Object.freeze({
    destinationSquares: Object.freeze(['a3', 'c3']),
    selectedSquare: 'b2',
  }),
}) satisfies Readonly<Record<SelectionPreset, PlainSelection | undefined>>;

const THEMES = Object.freeze({
  blue: Object.freeze({
    darkSquare: Object.freeze({ backgroundColor: '#52749b' }),
    darkSquareNotation: Object.freeze({ color: '#dce9f5' }),
    lightSquare: Object.freeze({ backgroundColor: '#dce9f5' }),
    lightSquareNotation: Object.freeze({ color: '#52749b' }),
    selectedSquare: Object.freeze({
      boxShadow: 'inset 0 0 0 3px rgba(255, 193, 7, 0.95)',
    }),
  }),
  default: undefined,
  'high-contrast': Object.freeze({
    darkSquare: Object.freeze({ backgroundColor: '#111111' }),
    darkSquareNotation: Object.freeze({ color: '#ffffff' }),
    lightSquare: Object.freeze({ backgroundColor: '#ffffff' }),
    lightSquareNotation: Object.freeze({ color: '#111111' }),
    selectedSquare: Object.freeze({
      boxShadow: 'inset 0 0 0 4px #ffcc00',
    }),
  }),
}) satisfies Readonly<Record<ThemePreset, ChessboardTheme | undefined>>;

const CBURNETT_POSITION = Object.freeze({
  a1: Object.freeze({ id: 'white-pawn', pieceType: 'wP' }),
  a2: Object.freeze({ id: 'black-pawn', pieceType: 'bP' }),
  b1: Object.freeze({ id: 'white-knight', pieceType: 'wN' }),
  b2: Object.freeze({ id: 'black-knight', pieceType: 'bN' }),
  c1: Object.freeze({ id: 'white-bishop', pieceType: 'wB' }),
  c2: Object.freeze({ id: 'black-bishop', pieceType: 'bB' }),
  d1: Object.freeze({ id: 'white-rook', pieceType: 'wR' }),
  d2: Object.freeze({ id: 'black-rook', pieceType: 'bR' }),
  e1: Object.freeze({ id: 'white-queen', pieceType: 'wQ' }),
  e2: Object.freeze({ id: 'black-queen', pieceType: 'bQ' }),
  f1: Object.freeze({ id: 'white-king', pieceType: 'wK' }),
  f2: Object.freeze({ id: 'black-king', pieceType: 'bK' }),
}) satisfies PositionInput;

function PublicApiPlaygroundScreen(args: PlaygroundArgs) {
  const fixture = BOARD_FIXTURES[args.boardPreset];
  const selection = SELECTIONS[args.selectionPreset];
  const theme = THEMES[args.themePreset];

  return (
    <ScrollView contentContainerStyle={styles.content} style={styles.screen}>
      <Text style={styles.title}>Public API playground</Text>
      <Text style={styles.description}>
        Change presets in the Controls panel. Every visual below comes from
        controlled props; this story keeps no shadow board state, so pieces do
        not move here. Open Gallery → Controlled State → Controlled Move
        Requests to try accepted, rejected, and cancelled moves.
      </Text>
      <View style={styles.boardFrame}>
        <Chessboard
          annotations={ANNOTATIONS[args.annotationPreset]}
          boardId="storybook-public-api"
          orientation={args.orientation}
          position={fixture.position}
          reduceMotion={args.reduceMotion}
          showNotation={args.showNotation}
          transitionDurationMs={args.transitionDurationMs}
          {...(fixture.dimensions === undefined
            ? {}
            : { dimensions: fixture.dimensions })}
          {...(selection === undefined ? {} : { selection })}
          {...(theme === undefined ? {} : { theme })}
        />
      </View>
    </ScrollView>
  );
}

function CburnettPieceSetScreen() {
  return (
    <ScrollView contentContainerStyle={styles.content} style={styles.screen}>
      <Text style={styles.title}>Cburnett default piece set</Text>
      <Text style={styles.description}>
        All twelve bundled React Native SVG renderers, shown on a rectangular
        six-by-two board through the public pieces entry point.
      </Text>
      <View style={styles.wideBoardFrame}>
        <Chessboard
          boardId="storybook-cburnett-piece-set"
          dimensions={{ columns: 6, rows: 2 }}
          pieceRenderers={defaultPieceRenderers}
          position={CBURNETT_POSITION}
          reduceMotion="always"
          showNotation={false}
        />
      </View>
    </ScrollView>
  );
}

const meta = {
  argTypes: {
    annotationPreset: {
      control: 'select',
      options: ['none', 'tactics', 'shapes'],
    },
    boardPreset: {
      control: 'select',
      options: ['starting-position', 'tactics', 'five-by-three'],
    },
    orientation: { control: 'radio', options: ['white', 'black'] },
    reduceMotion: {
      control: 'radio',
      options: ['system', 'always', 'never'],
    },
    selectionPreset: {
      control: 'select',
      options: ['none', 'selected', 'disabled'],
    },
    showNotation: { control: 'boolean' },
    themePreset: {
      control: 'select',
      options: ['default', 'blue', 'high-contrast'],
    },
    transitionDurationMs: {
      control: { max: 1_000, min: 0, step: 50, type: 'range' },
    },
  },
  args: {
    annotationPreset: 'tactics',
    boardPreset: 'starting-position',
    orientation: 'white',
    reduceMotion: 'never',
    selectionPreset: 'none',
    showNotation: true,
    themePreset: 'default',
    transitionDurationMs: 300,
  },
  parameters: { layout: 'fullscreen' },
  title: 'Overview/Chessboard Native',
} satisfies Meta<PlaygroundArgs>;

export default meta;

type Story = StoryObj<PlaygroundArgs>;

export const PublicApiPlayground = {
  parameters: {
    notes:
      'A read-only, args-driven tour of position, dimensions, orientation, notation, annotations, selection, themes, and reduced motion.',
  },
  render: (args: PlaygroundArgs) => <PublicApiPlaygroundScreen {...args} />,
} satisfies Story;

export const CburnettPieceSet = {
  parameters: {
    controls: { disable: true },
    notes:
      'The twelve bundled Cburnett renderers are React Native SVG components exported from @vibechess/chessboard-native/pieces.',
  },
  render: () => <CburnettPieceSetScreen />,
} satisfies Story;

const styles = StyleSheet.create({
  boardFrame: {
    alignSelf: 'center',
    maxWidth: 520,
    width: '100%',
  },
  content: {
    flexGrow: 1,
    gap: 12,
    padding: 20,
  },
  description: {
    color: '#4e4b45',
    fontSize: 15,
    lineHeight: 21,
    marginBottom: 8,
  },
  screen: {
    backgroundColor: '#f4f1eb',
  },
  title: {
    color: '#1d1c19',
    fontSize: 24,
    fontWeight: '700',
  },
  wideBoardFrame: {
    alignSelf: 'center',
    maxWidth: 660,
    width: '100%',
  },
});
