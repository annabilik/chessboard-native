import {
  Chessboard,
  type BoardAnnotation,
  type BoardDimensions,
  type BoardOrientation,
  type ChessboardTheme,
  type PlainSelection,
  type PositionObject,
  type ReduceMotion,
} from '@vibechess/chessboard-native';
import { defaultPieceRenderers } from '@vibechess/chessboard-native/pieces';
import type { Meta, StoryObj } from '@storybook/react-native';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { action } from 'storybook/actions';

import { replayGame } from '../src/chess-demo';

type AnnotationPreset = 'none' | 'scene';
type BoardPreset = 'ladder-mate' | 'scholars-mate' | 'starting-position';
type PositionVariant = 'after-moves' | 'initial';
type SelectionPreset = 'disabled' | 'none' | 'selected';
type ThemePreset = 'blue' | 'default' | 'high-contrast';

interface PlaygroundArgs {
  annotationPreset: AnnotationPreset;
  boardPreset: BoardPreset;
  orientation: BoardOrientation;
  positionVariant: PositionVariant;
  reduceMotion: ReduceMotion;
  selectionPreset: SelectionPreset;
  showNotation: boolean;
  themePreset: ThemePreset;
  transitionDurationMs: number;
}

interface PlaygroundScene {
  readonly annotations: readonly BoardAnnotation[];
  readonly dimensions?: BoardDimensions;
  readonly selections: Readonly<
    Record<'disabled' | 'selected', PlainSelection>
  >;
  readonly variants: Readonly<Record<PositionVariant, PositionObject>>;
}

// Every scene is real chess: chess.js validates the replayed lines, stable
// piece IDs make the after-moves variant animate as moves, and every arrow,
// destination, and highlight is a legal, thematically correct move.
const OPENING = replayGame(['e4', 'e5', 'Nf3', 'Nc6']);
const SCHOLARS = replayGame(['e4', 'e5', 'Bc4', 'Nc6', 'Qh5', 'Nf6', 'Qxf7#']);

// The starting position; after-moves plays 1.e4 e5 2.Nf3 Nc6.
const STARTING_SCENE = Object.freeze({
  annotations: Object.freeze([
    Object.freeze({
      color: '#e46f18',
      from: 'e2',
      id: 'kings-pawn-arrow',
      to: 'e4',
      type: 'arrow',
    }),
    Object.freeze({
      color: '#246bc2',
      from: 'g1',
      id: 'knight-arrow',
      shape: 'knight',
      to: 'f3',
      type: 'arrow',
    }),
  ]),
  // The b1 knight's real developing moves; Na3 is grayed in the disabled
  // preset because a knight on the rim is dim.
  selections: Object.freeze({
    disabled: Object.freeze({
      destinationSquares: Object.freeze(['a3', 'c3']),
      disabledSquares: Object.freeze(['a3']),
      selectedSquare: 'b1',
    }),
    selected: Object.freeze({
      destinationSquares: Object.freeze(['a3', 'c3']),
      selectedSquare: 'b1',
    }),
  }),
  variants: Object.freeze({
    'after-moves': OPENING.positions[4],
    initial: OPENING.positions[0],
  }),
}) satisfies PlaygroundScene;

// The Scholar's Mate threat after 1.e4 e5 2.Bc4 Nc6 3.Qh5; after-moves plays
// the blunder 3...Nf6?? and the mate 4.Qxf7#.
const SCHOLARS_SCENE = Object.freeze({
  annotations: Object.freeze([
    Object.freeze({
      color: 'rgba(228, 111, 24, 0.4)',
      id: 'weak-square-circle',
      shape: 'circle',
      square: 'f7',
      type: 'square',
    }),
    Object.freeze({
      color: '#e46f18',
      from: 'h5',
      id: 'mate-threat-arrow',
      to: 'f7',
      type: 'arrow',
    }),
    Object.freeze({
      color: '#246bc2',
      from: 'g8',
      id: 'blunder-arrow',
      shape: 'knight',
      to: 'f6',
      type: 'arrow',
    }),
  ]),
  // The h5 queen's thematic captures; Qxe5+ is grayed because the e5 pawn
  // is defended by the c6 knight.
  selections: Object.freeze({
    disabled: Object.freeze({
      destinationSquares: Object.freeze(['e5', 'f7']),
      disabledSquares: Object.freeze(['e5']),
      selectedSquare: 'h5',
    }),
    selected: Object.freeze({
      destinationSquares: Object.freeze(['e5', 'f7']),
      selectedSquare: 'h5',
    }),
  }),
  variants: Object.freeze({
    'after-moves': SCHOLARS.positions[7],
    initial: SCHOLARS.positions[5],
  }),
}) satisfies PlaygroundScene;

// A ladder mate on a rectangular five-by-three board: the a2 rook cuts off
// the second rank and Rb1-b3 mates along the top rank.
const LADDER_INITIAL = Object.freeze({
  a1: Object.freeze({ id: 'white-king', pieceType: 'wK' }),
  a2: Object.freeze({ id: 'white-rook-a2', pieceType: 'wR' }),
  b1: Object.freeze({ id: 'white-rook-b1', pieceType: 'wR' }),
  e3: Object.freeze({ id: 'black-king', pieceType: 'bK' }),
}) satisfies PositionObject;

const LADDER_SCENE = Object.freeze({
  annotations: Object.freeze([
    Object.freeze({
      color: '#e46f18',
      from: 'b1',
      id: 'mating-rook-arrow',
      to: 'b3',
      type: 'arrow',
    }),
    Object.freeze({
      color: 'rgba(45, 143, 88, 0.45)',
      id: 'mating-square-dot',
      shape: 'dot',
      square: 'b3',
      type: 'square',
    }),
  ]),
  dimensions: Object.freeze({ columns: 5, rows: 3 }),
  selections: Object.freeze({
    disabled: Object.freeze({
      destinationSquares: Object.freeze(['b2', 'b3']),
      disabledSquares: Object.freeze(['b2']),
      selectedSquare: 'b1',
    }),
    selected: Object.freeze({
      destinationSquares: Object.freeze(['b2', 'b3']),
      selectedSquare: 'b1',
    }),
  }),
  variants: Object.freeze({
    'after-moves': Object.freeze({
      a1: LADDER_INITIAL.a1,
      a2: LADDER_INITIAL.a2,
      b3: LADDER_INITIAL.b1,
      e3: LADDER_INITIAL.e3,
    }),
    initial: LADDER_INITIAL,
  }),
}) satisfies PlaygroundScene;

const SCENES: Readonly<Record<BoardPreset, PlaygroundScene>> = Object.freeze({
  'ladder-mate': LADDER_SCENE,
  'scholars-mate': SCHOLARS_SCENE,
  'starting-position': STARTING_SCENE,
});

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
}) satisfies PositionObject;

const logPiecePress = action('onPiecePress');
const logSquareActivate = action('onSquareActivate');
const logSquarePressIn = action('onSquarePressIn');
const logSquarePressOut = action('onSquarePressOut');

function PublicApiPlaygroundScreen(args: PlaygroundArgs) {
  const scene = SCENES[args.boardPreset];
  const selection =
    args.selectionPreset === 'none'
      ? undefined
      : scene.selections[args.selectionPreset];
  const theme = THEMES[args.themePreset];

  return (
    <ScrollView contentContainerStyle={styles.content} style={styles.screen}>
      <Text style={styles.title}>Public API playground</Text>
      <Text style={styles.description}>
        Every visual comes from controlled props; the story keeps no shadow
        board state. Toggle positionVariant to watch the scene&apos;s real moves
        animate, and watch touches arrive as payloads in the Actions tab. To
        move pieces yourself, open Play a Game → Play vs Random.
      </Text>
      <View style={styles.boardFrame}>
        <Chessboard
          annotations={
            args.annotationPreset === 'none' ? [] : scene.annotations
          }
          boardId="storybook-public-api"
          onPiecePress={logPiecePress}
          onSquareActivate={logSquareActivate}
          onSquarePressIn={logSquarePressIn}
          onSquarePressOut={logSquarePressOut}
          orientation={args.orientation}
          position={scene.variants[args.positionVariant]}
          reduceMotion={args.reduceMotion}
          showNotation={args.showNotation}
          transitionDurationMs={args.transitionDurationMs}
          {...(scene.dimensions === undefined
            ? {}
            : { dimensions: scene.dimensions })}
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
      control: 'radio',
      options: ['none', 'scene'],
    },
    boardPreset: {
      control: 'select',
      options: ['starting-position', 'scholars-mate', 'ladder-mate'],
    },
    orientation: { control: 'radio', options: ['white', 'black'] },
    positionVariant: {
      control: 'radio',
      options: ['initial', 'after-moves'],
    },
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
    annotationPreset: 'scene',
    boardPreset: 'starting-position',
    orientation: 'white',
    positionVariant: 'initial',
    reduceMotion: 'never',
    selectionPreset: 'none',
    showNotation: true,
    themePreset: 'default',
    transitionDurationMs: 300,
  },
  title: 'Overview',
} satisfies Meta<PlaygroundArgs>;

export default meta;

type Story = StoryObj<PlaygroundArgs>;

export const PublicApiPlayground = {
  parameters: {
    notes:
      'Args-driven tour of position, dimensions, orientation, notation, annotations, selection, themes, and reduced motion over three real-chess scenes. positionVariant animates each scene through its verified moves, and observational callbacks stream to the Actions tab.',
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
