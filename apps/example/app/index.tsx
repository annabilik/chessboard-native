import { Chessboard } from '@vibechess/chessboard-native';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

export default function GalleryIndex() {
  return (
    <SafeAreaView style={styles.screen}>
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.heading}>
          <Text style={styles.eyebrow}>PHASE 1 · CONTROLLED INPUTS</Text>
          <Text style={styles.title}>chessboard-native</Text>
          <Text style={styles.description}>
            A controlled frame proving that the Expo gallery consumes and
            normalizes the public board contract.
          </Text>
        </View>

        <View style={styles.boardContainer}>
          <Chessboard boardId="gallery" position="8/8/8/8/8/8/8/8" />
        </View>

        <Text style={styles.caption}>
          Controlled inputs are normalized now; square, piece, interaction, and
          annotation rendering land in later Phase 1 slices.
        </Text>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: '#f7f4ee',
  },
  content: {
    flexGrow: 1,
    alignItems: 'center',
    paddingHorizontal: 24,
    paddingVertical: 40,
  },
  heading: {
    width: '100%',
    maxWidth: 520,
    marginBottom: 28,
  },
  eyebrow: {
    marginBottom: 8,
    color: '#665c4d',
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 1.2,
  },
  title: {
    color: '#1e1b17',
    fontSize: 34,
    fontWeight: '700',
    letterSpacing: -1,
  },
  description: {
    marginTop: 12,
    color: '#665c4d',
    fontSize: 17,
    lineHeight: 25,
  },
  boardContainer: {
    width: '100%',
    maxWidth: 520,
  },
  caption: {
    width: '100%',
    maxWidth: 520,
    marginTop: 18,
    color: '#766c5d',
    fontSize: 14,
    lineHeight: 21,
  },
});
