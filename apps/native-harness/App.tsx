import { Chessboard } from '@vibechess/chessboard-native';
import { defaultPieceRenderers } from '@vibechess/chessboard-native/pieces';
import { StatusBar, StyleSheet, Text, View } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';

const AUDIT_BOARD_LABEL = 'Accessibility audit board, white orientation';
const AUDIT_BOARD_HINT =
  'Swipe up or down through squares, or use directional accessibility actions.';

export default function App() {
  return (
    <GestureHandlerRootView style={styles.root}>
      <StatusBar barStyle="dark-content" />
      <View style={styles.content}>
        <Text style={styles.title}>Native accessibility audit</Text>
        <Text style={styles.description}>
          Packed release · one controlled accessibility surface
        </Text>
        <View style={styles.board}>
          <Chessboard
            accessibility={{
              boardHint: AUDIT_BOARD_HINT,
              boardLabel: AUDIT_BOARD_LABEL,
            }}
            boardId="native-accessibility-audit"
            pieceRenderers={defaultPieceRenderers}
            position="8/8/8/8/3N4/8/8/8"
            reduceMotion="always"
            selection={{ selectedSquare: 'd4' }}
          />
        </View>
      </View>
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({
  root: {
    backgroundColor: '#f7f3ec',
    flex: 1,
  },
  content: {
    alignItems: 'center',
    flex: 1,
    justifyContent: 'center',
    padding: 24,
  },
  title: {
    color: '#282520',
    fontSize: 24,
    fontWeight: '700',
  },
  description: {
    color: '#5d574f',
    fontSize: 14,
    marginBottom: 24,
    marginTop: 6,
  },
  board: {
    maxWidth: 480,
    width: '100%',
  },
});
