import {
  Chessboard,
  type PositionObject,
  type ReduceMotion,
} from '@vibechess/chessboard-native';
import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

interface DemoPosition {
  readonly revision: number;
  readonly value: PositionObject;
}

const MAIN_STEPS: readonly PositionObject[] = Object.freeze([
  Object.freeze({
    a1: Object.freeze({ id: 'runner', pieceType: 'wR' }),
    c1: Object.freeze({ id: 'captured', pieceType: 'bN' }),
    e1: Object.freeze({ id: 'departing', pieceType: 'wB' }),
  }),
  Object.freeze({
    b1: Object.freeze({ id: 'runner', pieceType: 'wR' }),
    c1: Object.freeze({ id: 'captured', pieceType: 'bN' }),
    d1: Object.freeze({ id: 'added', pieceType: 'wQ' }),
  }),
  Object.freeze({
    c1: Object.freeze({ id: 'runner', pieceType: 'wR' }),
    d1: Object.freeze({ id: 'added', pieceType: 'wQ' }),
  }),
  Object.freeze({
    d1: Object.freeze({ id: 'added', pieceType: 'wQ' }),
    e1: Object.freeze({ id: 'runner', pieceType: 'wR' }),
  }),
]);

const AMBIGUOUS_STEPS: readonly PositionObject[] = Object.freeze([
  Object.freeze({
    a1: Object.freeze({ pieceType: 'wR' }),
    c1: Object.freeze({ pieceType: 'wR' }),
  }),
  Object.freeze({
    b1: Object.freeze({ pieceType: 'wR' }),
    d1: Object.freeze({ pieceType: 'wR' }),
  }),
]);

function nextPosition(
  current: DemoPosition,
  steps: readonly PositionObject[],
  nextIndex: number,
): DemoPosition {
  return {
    revision: current.revision + 1,
    value: steps[nextIndex] ?? Object.freeze({}),
  };
}

export default function TransitionsRoute() {
  const [durationMs, setDurationMs] = useState(600);
  const [reduceMotion, setReduceMotion] = useState<ReduceMotion>('never');
  const [mainIndex, setMainIndex] = useState(0);
  const [mainPosition, setMainPosition] = useState<DemoPosition>({
    revision: 1,
    value: MAIN_STEPS[0] ?? Object.freeze({}),
  });
  const [ambiguousIndex, setAmbiguousIndex] = useState(0);
  const [ambiguousPosition, setAmbiguousPosition] = useState<DemoPosition>({
    revision: 1,
    value: AMBIGUOUS_STEPS[0] ?? Object.freeze({}),
  });

  return (
    <SafeAreaView style={styles.screen}>
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.eyebrow}>PHASE 3 · CONTROLLED TRANSITIONS</Text>
        <Text style={styles.title}>Mounted transition lab</Text>
        <Text style={styles.description}>
          Every button publishes a new consumer-owned revision. The board
          animates detached presentation operations while the latest position
          remains authoritative.
        </Text>

        <View style={styles.controls}>
          {[0, 300, 600, 1_200].map((duration) => (
            <Pressable
              accessibilityRole="button"
              key={duration}
              onPress={() => {
                setDurationMs(duration);
              }}
              style={[
                styles.controlButton,
                durationMs === duration ? styles.controlButtonActive : null,
              ]}
            >
              <Text style={styles.controlText}>{duration} ms</Text>
            </Pressable>
          ))}
          <Pressable
            accessibilityRole="button"
            onPress={() => {
              setReduceMotion((current) =>
                current === 'always' ? 'never' : 'always',
              );
            }}
            style={[
              styles.controlButton,
              reduceMotion === 'always' ? styles.controlButtonActive : null,
            ]}
          >
            <Text style={styles.controlText}>
              {reduceMotion === 'always' ? 'Snap' : 'Animate'}
            </Text>
          </Pressable>
        </View>

        <Text style={styles.sectionTitle}>Move, enter, exit, and capture</Text>
        <View style={styles.boardCard}>
          <Chessboard
            boardId="transition-main"
            dimensions={{ columns: 5, rows: 1 }}
            position={mainPosition}
            reduceMotion={reduceMotion}
            showNotation={false}
            transitionDurationMs={durationMs}
          />
        </View>
        <Text style={styles.caption}>
          Revision {mainPosition.revision} · step {mainIndex + 1}/
          {MAIN_STEPS.length}
        </Text>
        <Pressable
          accessibilityRole="button"
          onPress={() => {
            const nextIndex = (mainIndex + 1) % MAIN_STEPS.length;
            setMainIndex(nextIndex);
            setMainPosition((current) =>
              nextPosition(current, MAIN_STEPS, nextIndex),
            );
          }}
          style={styles.primaryButton}
        >
          <Text style={styles.primaryButtonText}>
            Publish next controlled revision
          </Text>
        </Pressable>

        <Text style={styles.sectionTitle}>Ambiguous identity crossfade</Text>
        <View style={styles.boardCard}>
          <Chessboard
            boardId="transition-ambiguous"
            dimensions={{ columns: 4, rows: 1 }}
            position={ambiguousPosition}
            reduceMotion={reduceMotion}
            showNotation={false}
            transitionDurationMs={durationMs}
          />
        </View>
        <Text style={styles.caption}>
          Anonymous identical rooks have no authoritative pairing, so the old
          actors fade out and the new actors fade in.
        </Text>
        <Pressable
          accessibilityRole="button"
          onPress={() => {
            const nextIndex = (ambiguousIndex + 1) % AMBIGUOUS_STEPS.length;
            setAmbiguousIndex(nextIndex);
            setAmbiguousPosition((current) =>
              nextPosition(current, AMBIGUOUS_STEPS, nextIndex),
            );
          }}
          style={styles.primaryButton}
        >
          <Text style={styles.primaryButtonText}>
            Toggle ambiguous controlled revision
          </Text>
        </Pressable>

        <Text style={styles.note}>
          Type-changing replacements, promotion, castling, en passant, smooth
          in-flight replanning, and pending-to-commit handoff remain later Phase
          3 packages.
        </Text>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: {
    backgroundColor: '#f7f4ee',
    flex: 1,
  },
  content: {
    alignItems: 'center',
    paddingBottom: 64,
    paddingHorizontal: 24,
    paddingTop: 28,
  },
  eyebrow: {
    color: '#665c4d',
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 1.1,
    maxWidth: 560,
    width: '100%',
  },
  title: {
    color: '#1e1b17',
    fontSize: 30,
    fontWeight: '700',
    marginTop: 8,
    maxWidth: 560,
    width: '100%',
  },
  description: {
    color: '#665c4d',
    fontSize: 16,
    lineHeight: 24,
    marginTop: 12,
    maxWidth: 560,
    width: '100%',
  },
  controls: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 20,
    maxWidth: 560,
    width: '100%',
  },
  controlButton: {
    backgroundColor: '#e7dfd2',
    borderRadius: 999,
    paddingHorizontal: 14,
    paddingVertical: 9,
  },
  controlButtonActive: {
    backgroundColor: '#236a5b',
  },
  controlText: {
    color: '#1e1b17',
    fontSize: 14,
    fontWeight: '700',
  },
  sectionTitle: {
    color: '#1e1b17',
    fontSize: 20,
    fontWeight: '700',
    marginBottom: 10,
    marginTop: 32,
    maxWidth: 560,
    width: '100%',
  },
  boardCard: {
    backgroundColor: '#ffffff',
    borderRadius: 14,
    maxWidth: 560,
    overflow: 'hidden',
    width: '100%',
  },
  caption: {
    color: '#665c4d',
    fontSize: 14,
    lineHeight: 20,
    marginTop: 10,
    maxWidth: 560,
    width: '100%',
  },
  primaryButton: {
    backgroundColor: '#1e1b17',
    borderRadius: 10,
    marginTop: 14,
    maxWidth: 560,
    paddingHorizontal: 18,
    paddingVertical: 12,
    width: '100%',
  },
  primaryButtonText: {
    color: '#ffffff',
    fontSize: 15,
    fontWeight: '700',
    textAlign: 'center',
  },
  note: {
    color: '#665c4d',
    fontSize: 14,
    lineHeight: 21,
    marginTop: 32,
    maxWidth: 560,
    width: '100%',
  },
});
