import {
  Chessboard,
  type BoardOrientation,
  type ChessboardAccessibility,
  type PositionInput,
  type ReduceMotion,
} from '@vibechess/chessboard-native';
import { useEffect, useMemo, useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';

import { ControlButton, useScreenColors } from '../src/accessibility-controls';

const POSITIONS = Object.freeze([
  {
    d4: { id: 'white-knight', pieceType: 'wN' },
    f5: { id: 'black-queen', pieceType: 'bQ' },
    h1: { id: 'white-king', pieceType: 'wK' },
  },
  {
    a8: { id: 'black-rook', pieceType: 'bR' },
    d4: { id: 'white-bishop', pieceType: 'wB' },
    e5: { id: 'black-pawn', pieceType: 'bP' },
    h1: { id: 'white-king', pieceType: 'wK' },
  },
] as const satisfies readonly PositionInput[]);

type ScheduledChange = 'orientation' | 'position' | 'reduce-motion';
const SCHEDULE_DELAY_MS = 10_000;

export default function AccessibilityPrototype() {
  const colors = useScreenColors();
  const [orientation, setOrientation] = useState<BoardOrientation>('white');
  const [positionIndex, setPositionIndex] = useState(0);
  const [reduceMotion, setReduceMotion] = useState<ReduceMotion>('system');
  const [announcementId, setAnnouncementId] = useState(0);
  const [scheduledChange, setScheduledChange] =
    useState<ScheduledChange | null>(null);
  const position = POSITIONS[positionIndex] ?? POSITIONS[0];
  const accessibility = useMemo<ChessboardAccessibility>(
    () => ({
      ...(announcementId === 0
        ? {}
        : {
            announcement: {
              id: `prototype-${String(announcementId)}`,
              message: 'Accessibility prototype announcement',
            },
          }),
      boardHint:
        'Swipe up or down through squares, or open the actions menu for directional movement.',
      boardLabel: `Accessibility test board, ${orientation} orientation`,
    }),
    [announcementId, orientation],
  );

  useEffect(() => {
    if (scheduledChange === null) {
      return undefined;
    }

    const timer = setTimeout(() => {
      switch (scheduledChange) {
        case 'orientation':
          setOrientation((current) =>
            current === 'white' ? 'black' : 'white',
          );
          break;
        case 'position':
          setPositionIndex((current) => (current + 1) % POSITIONS.length);
          break;
        case 'reduce-motion':
          setReduceMotion((current) =>
            current === 'system'
              ? 'always'
              : current === 'always'
                ? 'never'
                : 'system',
          );
          break;
      }
      setScheduledChange(null);
    }, SCHEDULE_DELAY_MS);

    return () => {
      clearTimeout(timer);
    };
  }, [scheduledChange]);

  return (
    <ScrollView
      contentContainerStyle={styles.content}
      contentInsetAdjustmentBehavior="automatic"
      style={{ backgroundColor: colors.background }}
    >
      <Text style={[styles.title, { color: colors.text }]}>
        Single control lab
      </Text>
      <Text style={[styles.description, { color: colors.secondaryText }]}>
        Focus the board as one adjustable control. Its virtual cursor is local
        presentation state; the position and selection below remain controlled
        props.
      </Text>

      <View style={styles.board}>
        <Chessboard
          accessibility={accessibility}
          boardId="accessibility-prototype"
          orientation={orientation}
          position={position}
          reduceMotion={reduceMotion}
          selection={{
            destinationSquares: ['c2', 'e2', 'f5'],
            disabledSquares: ['a1'],
            selectedSquare: 'd4',
          }}
        />
      </View>

      <View
        style={[
          styles.card,
          { backgroundColor: colors.card, borderColor: colors.border },
        ]}
      >
        <Text style={[styles.sectionTitle, { color: colors.text }]}>
          Controls
        </Text>
        <Text style={[styles.status, { color: colors.secondaryText }]}>
          Orientation: {orientation} · position: {positionIndex + 1} · reduced
          motion: {reduceMotion}.{`\n`}
          {scheduledChange === null
            ? 'No delayed change is scheduled.'
            : `Scheduled ${scheduledChange} change in ten seconds. Return focus to the board now.`}
        </Text>
        <View style={styles.controls}>
          <ControlButton
            colors={colors}
            label="Schedule orientation flip (10 seconds)"
            onPress={() => {
              setScheduledChange('orientation');
            }}
          />
          <ControlButton
            colors={colors}
            label="Schedule position change (10 seconds)"
            onPress={() => {
              setScheduledChange('position');
            }}
          />
          <ControlButton
            colors={colors}
            label="Speak same message with new ID"
            onPress={() => {
              setAnnouncementId((current) => current + 1);
            }}
          />
          <ControlButton
            colors={colors}
            label="Schedule reduced-motion change (10 seconds)"
            onPress={() => {
              setScheduledChange('reduce-motion');
            }}
          />
        </View>
      </View>

      <View
        style={[
          styles.card,
          { backgroundColor: colors.card, borderColor: colors.border },
        ]}
      >
        <Text style={[styles.sectionTitle, { color: colors.text }]}>
          Manual pass
        </Text>
        <Text style={[styles.checklist, { color: colors.secondaryText }]}>
          1. Turn on TalkBack or VoiceOver and confirm the board is one focus
          target.{`\n`}2. Swipe up and down; confirm reading-order movement and
          current square values.{`\n`}3. Use the actions menu for left, right,
          up, and down movement.{`\n`}4. Schedule an orientation change, return
          focus to the board, and confirm focus and the canonical cursor square
          remain stable when it fires.{`\n`}5. Repeat with position and reduced
          motion; the value should refresh without moving the cursor.{`\n`}6.
          Press the announcement button twice; the identical message should
          speak twice because each press has a new ID.
        </Text>
      </View>

      <Text style={[styles.boundary, { color: colors.secondaryText }]}>
        Prototype boundary: square activation, moves, removal, annotations, and
        touch gestures are intentionally not implemented in this route.
      </Text>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  board: {
    maxWidth: 520,
    width: '100%',
  },
  boundary: {
    fontSize: 14,
    lineHeight: 21,
    maxWidth: 520,
    width: '100%',
  },
  card: {
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    gap: 12,
    maxWidth: 520,
    padding: 16,
    width: '100%',
  },
  checklist: {
    fontSize: 15,
    lineHeight: 23,
  },
  content: {
    alignItems: 'center',
    gap: 24,
    paddingHorizontal: 20,
    paddingVertical: 28,
  },
  controls: {
    gap: 10,
  },
  description: {
    fontSize: 16,
    lineHeight: 24,
    maxWidth: 520,
    width: '100%',
  },
  sectionTitle: {
    fontSize: 20,
    fontWeight: '700',
  },
  status: {
    fontSize: 14,
    lineHeight: 21,
  },
  title: {
    fontSize: 30,
    fontWeight: '800',
    maxWidth: 520,
    width: '100%',
  },
});
