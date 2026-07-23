import {
  Chessboard,
  type ControlledPosition,
  type OnMoveRequest,
  type PositionObject,
} from '@vibechess/chessboard-native';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import {
  OPERA_GAME,
  OPERA_GAME_TITLE,
  OPERA_MATE_IN_TWO_PLY,
} from './chess-demo';

const SCRIPTED_REPLY_DELAY_MS = 500;

type DemoPosition = Omit<ControlledPosition, 'value'> & {
  readonly value: PositionObject;
};

function positionAtPly(ply: number, revision: number): DemoPosition {
  return {
    revision,
    value: OPERA_GAME.positions[ply],
  };
}

export default function MateInTwoScreen() {
  // The puzzle is the final combination of the Opera Game: 16.Qb8+!! Nxb8
  // 17.Rd8#. Wrong tries are rejected and snap back; only the scripted
  // winning line advances the controlled position.
  const [ply, setPly] = useState(OPERA_MATE_IN_TWO_PLY);
  const [status, setStatus] = useState('White to move and mate in two.');
  const revisionRef = useRef(0);
  const replyTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [position, setPosition] = useState<DemoPosition>(() =>
    positionAtPly(OPERA_MATE_IN_TWO_PLY, 0),
  );

  useEffect(
    () => () => {
      if (replyTimeoutRef.current !== null) {
        clearTimeout(replyTimeoutRef.current);
      }
    },
    [],
  );

  const onMoveRequest: OnMoveRequest = useCallback(
    (intent) => {
      if (replyTimeoutRef.current !== null) {
        return { status: 'rejected', reason: "Wait for Black's reply." };
      }
      if (
        ply >= OPERA_GAME.moves.length ||
        intent.source.kind !== 'board' ||
        intent.basePositionRevision !== revisionRef.current
      ) {
        return { status: 'rejected', reason: 'The puzzle is finished.' };
      }
      const expected = OPERA_GAME.moves[ply];
      const label = OPERA_GAME.sanLabels[ply];
      if (
        intent.source.square !== expected.from ||
        intent.targetSquare !== expected.to
      ) {
        return {
          status: 'rejected',
          reason: 'Not the forced mate. Look for a queen sacrifice.',
        };
      }

      revisionRef.current += 1;
      setPosition({
        committedIntentId: intent.intentId,
        ...positionAtPly(ply + 1, revisionRef.current),
      });

      if (ply + 1 >= OPERA_GAME.moves.length) {
        setPly(ply + 1);
        setStatus(`${label} — checkmate! ${OPERA_GAME_TITLE}.`);
        return { status: 'accepted' };
      }

      setStatus(`${label} — Black's reply is forced.`);
      setPly(ply + 2);
      replyTimeoutRef.current = setTimeout(() => {
        replyTimeoutRef.current = null;
        revisionRef.current += 1;
        setPosition(positionAtPly(ply + 2, revisionRef.current));
        setStatus('One more move: finish the mate.');
      }, SCRIPTED_REPLY_DELAY_MS);
      return { status: 'accepted' };
    },
    [ply],
  );

  const onReset = useCallback(() => {
    if (replyTimeoutRef.current !== null) {
      clearTimeout(replyTimeoutRef.current);
      replyTimeoutRef.current = null;
    }
    revisionRef.current += 1;
    setPly(OPERA_MATE_IN_TWO_PLY);
    setPosition(positionAtPly(OPERA_MATE_IN_TWO_PLY, revisionRef.current));
    setStatus('White to move and mate in two.');
  }, []);

  return (
    <ScrollView contentContainerStyle={styles.content} style={styles.screen}>
      <Text style={styles.title}>Mate in two</Text>
      <Text style={styles.description}>
        The famous finish of the Opera Game ({OPERA_GAME_TITLE}). Play
        White&apos;s two moves; a wrong move is rejected by the scripted rules
        state and snaps back without touching the controlled position.
      </Text>
      <Text style={styles.status}>{status}</Text>
      <View style={styles.boardFrame}>
        <Chessboard
          boardId="mate-in-two"
          onMoveRequest={onMoveRequest}
          position={position}
        />
      </View>
      <Pressable
        accessibilityRole="button"
        onPress={onReset}
        style={styles.button}
      >
        <Text style={styles.buttonText}>Reset puzzle</Text>
      </Pressable>
    </ScrollView>
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
    alignSelf: 'center',
    backgroundColor: '#236a5b',
    borderRadius: 8,
    justifyContent: 'center',
    minHeight: 48,
    paddingHorizontal: 20,
    paddingVertical: 12,
  },
  buttonText: {
    color: '#ffffff',
    fontSize: 15,
    fontWeight: '700',
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
