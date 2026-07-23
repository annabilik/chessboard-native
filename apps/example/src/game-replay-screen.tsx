import { Chessboard } from '@vibechess/chessboard-native';
import { useCallback, useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { OPERA_GAME, OPERA_GAME_TITLE } from './chess-demo';

const AUTOPLAY_INTERVAL_MS = 1_200;
const FINAL_PLY = OPERA_GAME.moves.length;

interface ReplayState {
  readonly ply: number;
  readonly revision: number;
}

export default function GameReplayScreen() {
  const [replay, setReplay] = useState<ReplayState>({ ply: 0, revision: 0 });
  const [playing, setPlaying] = useState(false);

  // Revisions must stay monotonic even when stepping backward through the
  // game, so the revision counts publishes while ply tracks the game.
  const goTo = useCallback((ply: number) => {
    const bounded = Math.max(0, Math.min(FINAL_PLY, ply));
    setReplay((current) =>
      current.ply === bounded
        ? current
        : { ply: bounded, revision: current.revision + 1 },
    );
  }, []);

  useEffect(() => {
    if (!playing) {
      return;
    }
    const interval = setInterval(() => {
      setReplay((current) => {
        if (current.ply >= FINAL_PLY) {
          return current;
        }
        return { ply: current.ply + 1, revision: current.revision + 1 };
      });
    }, AUTOPLAY_INTERVAL_MS);
    return () => {
      clearInterval(interval);
    };
  }, [playing]);

  useEffect(() => {
    if (playing && replay.ply >= FINAL_PLY) {
      setPlaying(false);
    }
  }, [playing, replay.ply]);

  const moveLabel =
    replay.ply === 0 ? 'Start position' : OPERA_GAME.sanLabels[replay.ply - 1];

  return (
    <ScrollView contentContainerStyle={styles.content} style={styles.screen}>
      <Text style={styles.title}>Game replay</Text>
      <Text style={styles.description}>
        Step through the Opera Game ({OPERA_GAME_TITLE}). Every step publishes
        the next controlled position; the board infers the move, capture, or
        castling transition on its own, and interrupted steps rebase instead of
        teleporting.
      </Text>
      <Text style={styles.status}>
        {moveLabel} ({String(replay.ply)}/{String(FINAL_PLY)})
      </Text>
      <View style={styles.boardFrame}>
        <Chessboard
          boardId="game-replay"
          position={{
            revision: replay.revision,
            value: OPERA_GAME.positions[replay.ply],
          }}
        />
      </View>
      <View style={styles.controls}>
        <ReplayButton
          label="⏮ Start"
          onPress={() => {
            goTo(0);
          }}
        />
        <ReplayButton
          label="◀ Back"
          onPress={() => {
            goTo(replay.ply - 1);
          }}
        />
        <ReplayButton
          label={playing ? '⏸ Pause' : '▶ Play'}
          onPress={() => {
            setPlaying((current) => !current);
          }}
        />
        <ReplayButton
          label="Next ▶"
          onPress={() => {
            goTo(replay.ply + 1);
          }}
        />
        <ReplayButton
          label="End ⏭"
          onPress={() => {
            goTo(FINAL_PLY);
          }}
        />
      </View>
    </ScrollView>
  );
}

function ReplayButton({
  label,
  onPress,
}: {
  readonly label: string;
  readonly onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={styles.button}
    >
      <Text style={styles.buttonText}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  boardFrame: {
    alignSelf: 'center',
    maxWidth: 520,
    width: '100%',
  },
  button: {
    alignItems: 'center',
    backgroundColor: '#236a5b',
    borderRadius: 8,
    justifyContent: 'center',
    minHeight: 48,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  buttonText: {
    color: '#ffffff',
    fontSize: 14,
    fontWeight: '700',
  },
  content: {
    flexGrow: 1,
    gap: 12,
    padding: 20,
  },
  controls: {
    alignSelf: 'center',
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    justifyContent: 'center',
  },
  description: {
    color: '#4e4b45',
    fontSize: 15,
    lineHeight: 21,
  },
  screen: {
    backgroundColor: '#f4f1eb',
  },
  status: {
    color: '#1d1c19',
    fontSize: 16,
    fontWeight: '600',
  },
  title: {
    color: '#1d1c19',
    fontSize: 24,
    fontWeight: '700',
  },
});
