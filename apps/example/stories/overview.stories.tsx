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

interface PlaygroundFrame {
  readonly annotations: readonly BoardAnnotation[];
  readonly description: string;
  readonly position: PositionObject;
  readonly selections: Readonly<
    Record<'disabled' | 'selected', PlainSelection>
  >;
}

interface PlaygroundScene {
  readonly dimensions?: BoardDimensions;
  readonly frames: Readonly<Record<PositionVariant, PlaygroundFrame>>;
}

// Each orthodox scene toggles across exactly one chess.js-validated ply.
// The 5x3 scene is explicitly mini-chess and follows that board's geometry.
const OPENING = replayGame(['e4']);
const SCHOLARS = replayGame(['e4', 'e5', 'Bc4', 'Nc6', 'Qh5', 'Nf6', 'Qxf7#']);

// The starting position; after-moves publishes exactly 1.e4.
const STARTING_SCENE = Object.freeze({
  frames: Object.freeze({
    'after-moves': Object.freeze({
      annotations: Object.freeze([
        Object.freeze({
          color: '#246bc2',
          from: 'e7',
          id: 'black-kings-pawn-reply',
          to: 'e5',
          type: 'arrow',
        }),
      ]),
      description:
        'After 1.e4, Black is to move. The e7 pawn destinations are legal in the current position.',
      position: OPENING.positions[1],
      selections: Object.freeze({
        disabled: Object.freeze({
          destinationSquares: Object.freeze(['e5', 'e6']),
          disabledSquares: Object.freeze(['h5']),
          selectedSquare: 'e7',
        }),
        selected: Object.freeze({
          destinationSquares: Object.freeze(['e5', 'e6']),
          selectedSquare: 'e7',
        }),
      }),
    }),
    initial: Object.freeze({
      annotations: Object.freeze([
        Object.freeze({
          color: '#e46f18',
          from: 'e2',
          id: 'kings-pawn-arrow',
          to: 'e4',
          type: 'arrow',
        }),
      ]),
      description:
        'The orthodox starting position with White to move. The e2 pawn destinations are legal.',
      position: OPENING.positions[0],
      selections: Object.freeze({
        disabled: Object.freeze({
          destinationSquares: Object.freeze(['e3', 'e4']),
          disabledSquares: Object.freeze(['h5']),
          selectedSquare: 'e2',
        }),
        selected: Object.freeze({
          destinationSquares: Object.freeze(['e3', 'e4']),
          selectedSquare: 'e2',
        }),
      }),
    }),
  }),
}) satisfies PlaygroundScene;

// One legal ply: after Black's 3...Nf6?? blunder, White plays 4.Qxf7#.
const SCHOLARS_SCENE = Object.freeze({
  frames: Object.freeze({
    'after-moves': Object.freeze({
      annotations: Object.freeze([
        Object.freeze({
          color: 'rgba(45, 143, 88, 0.42)',
          id: 'mate-square-circle',
          shape: 'circle',
          square: 'f7',
          type: 'square',
        }),
        Object.freeze({
          color: '#e46f18',
          from: 'f7',
          id: 'check-line-arrow',
          to: 'e8',
          type: 'arrow',
        }),
      ]),
      description:
        'After 4.Qxf7#, Black is checkmated. The f7 queen attacks the king on e8, and no legal reply exists.',
      position: SCHOLARS.positions[7],
      selections: Object.freeze({
        disabled: Object.freeze({
          destinationSquares: Object.freeze([]),
          disabledSquares: Object.freeze(['e3']),
          selectedSquare: 'e8',
        }),
        selected: Object.freeze({
          destinationSquares: Object.freeze([]),
          selectedSquare: 'e8',
        }),
      }),
    }),
    initial: Object.freeze({
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
      ]),
      description:
        'After 3...Nf6??, White is to move. Qxf7# and Qxe5+ are both legal queen moves; the annotation shows the mate.',
      position: SCHOLARS.positions[6],
      selections: Object.freeze({
        disabled: Object.freeze({
          destinationSquares: Object.freeze(['e5', 'f7']),
          disabledSquares: Object.freeze(['e3']),
          selectedSquare: 'h5',
        }),
        selected: Object.freeze({
          destinationSquares: Object.freeze(['e5', 'f7']),
          selectedSquare: 'h5',
        }),
      }),
    }),
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
  dimensions: Object.freeze({ columns: 5, rows: 3 }),
  frames: Object.freeze({
    'after-moves': Object.freeze({
      annotations: Object.freeze([
        Object.freeze({
          color: 'rgba(45, 143, 88, 0.45)',
          id: 'mating-square-dot',
          shape: 'dot',
          square: 'b3',
          type: 'square',
        }),
      ]),
      description:
        'After Rb1-b3#, the checking rook covers rank 3 while the a2 rook covers rank 2 in this 5×3 mini-chess position.',
      position: Object.freeze({
        a1: LADDER_INITIAL.a1,
        a2: LADDER_INITIAL.a2,
        b3: LADDER_INITIAL.b1,
        e3: LADDER_INITIAL.e3,
      }),
      selections: Object.freeze({
        disabled: Object.freeze({
          destinationSquares: Object.freeze([]),
          disabledSquares: Object.freeze(['a1']),
          selectedSquare: 'e3',
        }),
        selected: Object.freeze({
          destinationSquares: Object.freeze([]),
          selectedSquare: 'e3',
        }),
      }),
    }),
    initial: Object.freeze({
      annotations: Object.freeze([
        Object.freeze({
          color: '#e46f18',
          from: 'b1',
          id: 'mating-rook-arrow',
          to: 'b3',
          type: 'arrow',
        }),
      ]),
      description:
        'A 5×3 mini-chess fixture, not an orthodox 8×8 position. The b1 rook can travel through b2 to deliver Rb3#.',
      position: LADDER_INITIAL,
      selections: Object.freeze({
        disabled: Object.freeze({
          destinationSquares: Object.freeze(['b2', 'b3']),
          disabledSquares: Object.freeze(['a1']),
          selectedSquare: 'b1',
        }),
        selected: Object.freeze({
          destinationSquares: Object.freeze(['b2', 'b3']),
          selectedSquare: 'b1',
        }),
      }),
    }),
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
  const frame = scene.frames[args.positionVariant];
  const selection =
    args.selectionPreset === 'none'
      ? undefined
      : frame.selections[args.selectionPreset];
  const theme = THEMES[args.themePreset];

  return (
    <ScrollView contentContainerStyle={styles.content} style={styles.screen}>
      <Text style={styles.title}>Public API playground</Text>
      <Text style={styles.description}>
        Every visual comes from controlled props; the story keeps no shadow
        board state. Each pair of variants is one legal ply apart; toggle
        positionVariant to animate that ply forward or backward, and watch
        touches arrive as payloads in the Actions tab. To move pieces yourself,
        open Play a Game → Play vs Random.
      </Text>
      <View style={styles.boardFrame}>
        <Chessboard
          annotations={
            args.annotationPreset === 'none' ? [] : frame.annotations
          }
          boardId="storybook-public-api"
          onPiecePress={logPiecePress}
          onSquareActivate={logSquareActivate}
          onSquarePressIn={logSquarePressIn}
          onSquarePressOut={logSquarePressOut}
          orientation={args.orientation}
          position={frame.position}
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
      <Text style={styles.sceneDescription}>{frame.description}</Text>
      {args.selectionPreset === 'disabled' ? (
        <Text style={styles.policyNote}>
          The disabled square is an unrelated consumer-policy example; legal
          destinations remain enabled.
        </Text>
      ) : null}
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
      'Args-driven tour of position, dimensions, orientation, notation, annotations, selection, themes, and reduced motion. The orthodox starting and Scholar’s Mate scenes use chess.js-validated positions; the rectangular ladder scene is explicitly 5×3 mini-chess. Each pair of positionVariant frames is one legal ply apart and can animate forward or backward.',
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
  policyNote: {
    color: '#7b3f00',
    fontSize: 13,
    lineHeight: 19,
  },
  sceneDescription: {
    color: '#4e4b45',
    fontSize: 14,
    lineHeight: 20,
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
