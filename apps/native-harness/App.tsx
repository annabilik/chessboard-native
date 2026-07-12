import { Chessboard } from '@vibechess/chessboard-native';
import { defaultPieceRenderers } from '@vibechess/chessboard-native/pieces';
import {
  StatusBar,
  StyleSheet,
  Text,
  useColorScheme,
  View,
} from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';

export default function App() {
  const dark = useColorScheme() === 'dark';
  const backgroundColor = dark ? '#181715' : '#f7f3ec';
  const textColor = dark ? '#f7f3ec' : '#282520';

  return (
    <GestureHandlerRootView style={[styles.root, { backgroundColor }]}>
      <StatusBar barStyle={dark ? 'light-content' : 'dark-content'} />
      <View style={styles.content}>
        <Text style={[styles.title, { color: textColor }]}>Native harness</Text>
        <Text style={[styles.description, { color: textColor }]}>
          Controlled static pieces · React Native Release build
        </Text>
        <View style={styles.board}>
          <Chessboard
            boardId="native-harness"
            pieceRenderers={defaultPieceRenderers}
            position="rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR"
          />
        </View>
      </View>
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
  content: {
    alignItems: 'center',
    flex: 1,
    justifyContent: 'center',
    padding: 24,
  },
  title: {
    fontSize: 24,
    fontWeight: '700',
  },
  description: {
    fontSize: 14,
    marginBottom: 24,
    marginTop: 6,
    opacity: 0.72,
  },
  board: {
    maxWidth: 480,
    width: '100%',
  },
});
