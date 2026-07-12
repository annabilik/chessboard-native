import { Chessboard } from '@vibechess/chessboard-native';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

export default function GalleryIndex() {
  return (
    <SafeAreaView style={styles.screen}>
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.heading}>
          <Text style={styles.eyebrow}>PHASE 1 · STATIC SURFACE</Text>
          <Text style={styles.title}>chessboard-native</Text>
          <Text style={styles.description}>
            Responsive native square geometry driven by controlled dimensions,
            orientation, and notation props.
          </Text>
        </View>

        <View style={styles.boardContainer}>
          <Chessboard boardId="standard-white" position="8/8/8/8/8/8/8/8" />
        </View>

        <Text style={styles.caption}>
          Standard 8×8 · white orientation · parent-constrained width
        </Text>

        <View style={styles.variantContainer}>
          <Chessboard
            boardId="variant-black"
            dimensions={{ columns: 5, rows: 3 }}
            orientation="black"
            position={{}}
          />
        </View>

        <Text style={styles.caption}>
          5×3 bounded variant · black orientation · measured rectangular height
        </Text>

        <Text style={styles.pending}>
          Pieces, annotations, selection styling, themes, interaction, and the
          accessibility control land in the following Phase 1 slices.
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
  pending: {
    width: '100%',
    maxWidth: 520,
    marginTop: 28,
    color: '#665c4d',
    fontSize: 15,
    lineHeight: 22,
  },
  variantContainer: {
    width: '72%',
    maxWidth: 380,
    marginTop: 32,
  },
});
