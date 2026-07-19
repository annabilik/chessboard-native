import {
  applyAnnotationOperation,
  Chessboard,
  defaultAnnotationStyle,
  findMatchingAnnotationIds,
  type AnnotationOperation,
  type AnnotationStyle,
  type AnnotationTool,
  type BoardActionAccessibilityContext,
  type ChessboardAccessibility,
  type ControlledAnnotations,
  type ControlledPosition,
  type OnAnnotationOperation,
} from '@vibechess/chessboard-native';
import { useCallback, useRef, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

const BOARD_ID = 'controlled-annotation-lab';

const ARROW_TOOL = Object.freeze({
  color: '#e46f18',
  opacity: 0.82,
  type: 'arrow',
}) satisfies Exclude<AnnotationTool, null>;

const SQUARE_TOOL = Object.freeze({
  color: 'rgba(118, 81, 181, 0.42)',
  shape: 'border',
  type: 'square',
}) satisfies Exclude<AnnotationTool, null>;

const INITIAL_ANNOTATIONS = Object.freeze({
  revision: 4,
  value: Object.freeze([
    Object.freeze({
      color: '#246bc2',
      from: 'b1',
      id: 'candidate-arrow',
      to: 'c3',
      type: 'arrow',
    }),
    Object.freeze({
      color: 'rgba(228, 111, 24, 0.32)',
      id: 'center-focus',
      shape: 'circle',
      square: 'd4',
      type: 'square',
    }),
  ]),
}) satisfies ControlledAnnotations;

const INITIAL_POSITION = Object.freeze({
  revision: 8,
  value: Object.freeze({}),
}) satisfies ControlledPosition;

const annotationPolicies = Object.freeze({
  clearOnBoardPress: true,
  clearOnPositionChange: true,
});

const annotationAccessibility = Object.freeze({
  boardHint:
    'Navigate the board, then use the available annotation action for the current square.',
  formatActionLabel: ({ action, square }: BoardActionAccessibilityContext) => {
    switch (action) {
      case 'start-arrow':
        return `Start arrow at ${square}`;
      case 'finish-arrow':
        return `Finish arrow at ${square}`;
      case 'toggle-square-annotation':
        return `Toggle square annotation at ${square}`;
      case 'cancel-annotation':
        return 'Cancel annotation';
      default: {
        const label = action.replaceAll('-', ' ');
        return `${label.slice(0, 1).toUpperCase()}${label.slice(1)}`;
      }
    }
  },
}) satisfies ChessboardAccessibility;

const COMPACT_ANNOTATION_STYLE = Object.freeze({
  ...defaultAnnotationStyle,
  arrowLengthReducerDenominator: 4,
  arrowStartOffset: 0.12,
  arrowWidthDenominator: 9,
  opacity: 0.9,
  sameTargetArrowLengthReducerDenominator: 2.5,
}) satisfies AnnotationStyle;

export default function ControlledAnnotationsRoute() {
  const [annotations, setAnnotations] =
    useState<ControlledAnnotations>(INITIAL_ANNOTATIONS);
  const annotationsRef = useRef<ControlledAnnotations>(INITIAL_ANNOTATIONS);
  const [position, setPosition] =
    useState<ControlledPosition>(INITIAL_POSITION);
  const [annotationTool, setAnnotationTool] =
    useState<AnnotationTool>(ARROW_TOOL);
  const [annotationStyleMode, setAnnotationStyleMode] = useState<
    'compact' | 'default'
  >('default');
  const [labEpoch, setLabEpoch] = useState(0);
  const [operationLog, setOperationLog] = useState<readonly string[]>([]);
  const nextIdentity = useRef(1);

  const publishAnnotations = useCallback((next: ControlledAnnotations) => {
    annotationsRef.current = next;
    setAnnotations(next);
  }, []);

  const record = useCallback((message: string) => {
    setOperationLog((current) => [...current.slice(-4), message]);
  }, []);

  const onAnnotationOperation = useCallback<OnAnnotationOperation>(
    (operation) => {
      const result = applyAnnotationOperation({
        boardId: BOARD_ID,
        current: annotationsRef.current,
        operation,
      });
      if (result.status === 'rejected') {
        record(`${operation.operationId}: rejected (${result.reason})`);
        return;
      }
      publishAnnotations(result.next);
      record(
        `${operation.operationId}: ${operation.type}/${operation.input} · ${result.status}${result.stale ? ' · stale-safe' : ''}`,
      );
    },
    [publishAnnotations, record],
  );

  const addSquare = useCallback(() => {
    const base = annotationsRef.current;
    const identity = nextIdentity.current;
    nextIdentity.current += 1;
    const operation = Object.freeze({
      annotation: Object.freeze({
        color: '#7651b5',
        shape: 'border',
        square: 'e5',
        type: 'square',
      }),
      annotationId: `manual-square-${String(identity)}`,
      baseAnnotationRevision: base.revision,
      boardId: BOARD_ID,
      input: 'keyboard',
      operationId: `add-${String(identity)}`,
      type: 'add',
    }) satisfies AnnotationOperation;
    onAnnotationOperation(operation);
  }, [onAnnotationOperation]);

  const toggleCandidate = useCallback(() => {
    const base = annotationsRef.current;
    const identity = nextIdentity.current;
    nextIdentity.current += 1;
    const draft = Object.freeze({
      color: '#246bc2',
      from: 'b1',
      to: 'c3',
      type: 'arrow',
    } as const);
    const matchingIdsAtBase = findMatchingAnnotationIds(base.value, draft);
    const operation = Object.freeze({
      annotation: draft,
      annotationId: `candidate-arrow-${String(identity)}`,
      baseAnnotationRevision: base.revision,
      boardId: BOARD_ID,
      input: 'keyboard',
      matchingIdsAtBase: Object.freeze(matchingIdsAtBase),
      operationId: `toggle-${String(identity)}`,
      type: 'toggle',
    }) satisfies AnnotationOperation;
    onAnnotationOperation(operation);
  }, [onAnnotationOperation]);

  const removeLast = useCallback(() => {
    const base = annotationsRef.current;
    const annotation = base.value.at(-1);
    if (annotation === undefined) {
      record('remove: no persistent annotation to target');
      return;
    }
    const identity = nextIdentity.current;
    nextIdentity.current += 1;
    const operation = Object.freeze({
      annotationId: annotation.id,
      baseAnnotationRevision: base.revision,
      boardId: BOARD_ID,
      input: 'keyboard',
      operationId: `remove-${String(identity)}`,
      type: 'remove',
    }) satisfies AnnotationOperation;
    onAnnotationOperation(operation);
  }, [onAnnotationOperation, record]);

  const runStaleClearRace = useCallback(() => {
    const base = annotationsRef.current;
    const identity = nextIdentity.current;
    nextIdentity.current += 1;
    const concurrentId = `concurrent-${String(identity)}`;
    const concurrent = Object.freeze({
      revision: base.revision + 1,
      value: Object.freeze([
        ...base.value,
        Object.freeze({
          color: '#2d8f58',
          id: concurrentId,
          shape: 'dot',
          square: 'f6',
          type: 'square',
        }),
      ]),
    }) satisfies ControlledAnnotations;
    const staleOperation = Object.freeze({
      annotationIdsAtBase: Object.freeze(
        base.value.map((annotation) => annotation.id),
      ),
      baseAnnotationRevision: base.revision,
      boardId: BOARD_ID,
      input: 'policy',
      operationId: `stale-clear-${String(identity)}`,
      reason: 'consumer-action',
      type: 'clear',
    }) satisfies AnnotationOperation;
    const result = applyAnnotationOperation({
      boardId: BOARD_ID,
      current: concurrent,
      operation: staleOperation,
    });
    if (result.status === 'rejected') {
      record(`${staleOperation.operationId}: rejected (${result.reason})`);
      return;
    }
    publishAnnotations(result.next);
    const survived = result.next.value.some(
      (annotation) => annotation.id === concurrentId,
    );
    record(
      `${staleOperation.operationId}: ${survived ? 'concurrent ID survived' : 'unexpected removal'}`,
    );
  }, [publishAnnotations, record]);

  const advancePosition = useCallback(() => {
    setPosition((current) => ({
      revision: current.revision + 1,
      value: current.value,
    }));
  }, []);

  const reset = useCallback(() => {
    nextIdentity.current = 1;
    publishAnnotations(INITIAL_ANNOTATIONS);
    setPosition(INITIAL_POSITION);
    setAnnotationTool(ARROW_TOOL);
    setAnnotationStyleMode('default');
    setOperationLog([]);
    setLabEpoch((current) => current + 1);
  }, [publishAnnotations]);

  return (
    <SafeAreaView style={styles.screen}>
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.eyebrow}>PHASE 4 · CONTROLLED ANNOTATIONS</Text>
        <Text style={styles.title}>Revision-safe annotation input</Text>
        <Text style={styles.description}>
          Touch and accessibility input emit deltas through one transient
          runtime. This route applies each operation against the latest
          consumer-owned envelope and publishes the returned value as the next
          controlled prop.
        </Text>

        <Text style={styles.sectionTitle}>Drawing tool</Text>
        <View style={styles.toolControls}>
          <LabButton
            label="Arrow"
            onPress={() => {
              setAnnotationTool(ARROW_TOOL);
            }}
            selected={annotationTool?.type === 'arrow'}
          />
          <LabButton
            label="Square"
            onPress={() => {
              setAnnotationTool(SQUARE_TOOL);
            }}
            selected={annotationTool?.type === 'square'}
          />
          <LabButton
            label="Off"
            onPress={() => {
              setAnnotationTool(null);
            }}
            selected={annotationTool === null}
          />
        </View>

        <Text style={styles.sectionTitle}>Arrow geometry</Text>
        <View style={styles.toolControls}>
          <LabButton
            label="Published default"
            onPress={() => {
              setAnnotationStyleMode('default');
            }}
            selected={annotationStyleMode === 'default'}
          />
          <LabButton
            label="Compact custom"
            onPress={() => {
              setAnnotationStyleMode('compact');
            }}
            selected={annotationStyleMode === 'compact'}
          />
        </View>
        <Text style={styles.help}>
          Published default passes defaultAnnotationStyle unchanged. Compact
          custom passes a complete annotationStyle with narrower, shorter,
          offset arrows and stronger opacity.
        </Text>

        <View style={styles.boardContainer}>
          <Chessboard
            accessibility={annotationAccessibility}
            annotationPolicies={annotationPolicies}
            annotationStyle={
              annotationStyleMode === 'default'
                ? defaultAnnotationStyle
                : COMPACT_ANNOTATION_STYLE
            }
            annotations={annotations}
            annotationTool={annotationTool}
            boardId={BOARD_ID}
            key={labEpoch}
            onAnnotationOperation={onAnnotationOperation}
            position={position}
          />
        </View>

        <Text style={styles.status}>
          Annotation revision {annotations.revision} · position revision{' '}
          {position.revision} · tool {annotationTool?.type ?? 'off'} · style{' '}
          {annotationStyleMode} · {annotations.value.length} persistent items
        </Text>

        <Text style={styles.help}>
          With Arrow selected, tap a source and target, long-press then pan, or
          use a two-finger pan. The long-press activates after 500 ms. With
          Square selected, tap a square or finish a pan over it. Each completed
          path requests one controlled toggle. Turn the tool off and tap the
          board to test policy clearing; advancing the position tests the
          independent position-change policy. With TalkBack or VoiceOver, choose
          Start arrow, navigate, then Finish arrow or Cancel annotation. The
          square tool exposes one immediate Toggle square annotation action.
        </Text>

        <Text style={styles.sectionTitle}>Store operations and races</Text>
        <View style={styles.controls}>
          <LabButton label="Add square" onPress={addSquare} />
          <LabButton label="Toggle candidate arrow" onPress={toggleCandidate} />
          <LabButton label="Remove last" onPress={removeLast} />
          <LabButton label="Run stale clear race" onPress={runStaleClearRace} />
          <LabButton
            label="Advance position revision"
            onPress={advancePosition}
          />
          <LabButton label="Reset lab" onPress={reset} />
        </View>

        <View style={styles.logCard}>
          <Text style={styles.logTitle}>Operation log</Text>
          {operationLog.length === 0 ? (
            <Text style={styles.logLine}>No operations yet.</Text>
          ) : (
            operationLog.map((entry, index) => (
              <Text key={`${String(index)}:${entry}`} style={styles.logLine}>
                {entry}
              </Text>
            ))
          )}
        </View>

        <Text style={styles.pending}>
          The visible drawing draft is transient and never enters this store.
          Persistent changes appear only after the callback publishes the next
          annotation revision. Touch and accessibility share that draft and
          report their input in the operation log. Keyboard annotation input
          remains future work.
        </Text>
      </ScrollView>
    </SafeAreaView>
  );
}

function LabButton({
  label,
  onPress,
  selected,
}: {
  readonly label: string;
  readonly onPress: () => void;
  readonly selected?: boolean;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={
        selected === undefined ? undefined : { selected: selected }
      }
      onPress={onPress}
      style={[styles.button, selected === true && styles.buttonSelected]}
    >
      <Text
        style={[
          styles.buttonText,
          selected === true && styles.buttonTextSelected,
        ]}
      >
        {label}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  boardContainer: {
    marginTop: 28,
    width: '100%',
  },
  button: {
    alignItems: 'center',
    borderColor: '#236a5b',
    borderRadius: 10,
    borderWidth: 1,
    paddingHorizontal: 14,
    paddingVertical: 11,
  },
  buttonText: {
    color: '#236a5b',
    fontSize: 14,
    fontWeight: '700',
  },
  buttonSelected: {
    backgroundColor: '#236a5b',
  },
  buttonTextSelected: {
    color: '#ffffff',
  },
  content: {
    alignSelf: 'center',
    paddingHorizontal: 24,
    paddingVertical: 32,
    width: '100%',
    maxWidth: 568,
  },
  controls: {
    gap: 10,
    marginTop: 20,
  },
  description: {
    color: '#665c4d',
    fontSize: 16,
    lineHeight: 24,
    marginTop: 10,
  },
  eyebrow: {
    color: '#665c4d',
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 1.1,
  },
  help: {
    color: '#665c4d',
    fontSize: 14,
    lineHeight: 21,
    marginTop: 10,
  },
  logCard: {
    backgroundColor: '#eee8dd',
    borderRadius: 12,
    marginTop: 24,
    padding: 16,
  },
  logLine: {
    color: '#51493e',
    fontSize: 13,
    lineHeight: 20,
  },
  logTitle: {
    color: '#1e1b17',
    fontSize: 15,
    fontWeight: '700',
    marginBottom: 8,
  },
  pending: {
    color: '#665c4d',
    fontSize: 14,
    lineHeight: 21,
    marginTop: 24,
  },
  screen: {
    backgroundColor: '#f7f4ee',
    flex: 1,
  },
  sectionTitle: {
    color: '#1e1b17',
    fontSize: 15,
    fontWeight: '700',
    marginTop: 22,
  },
  status: {
    color: '#1e1b17',
    fontSize: 14,
    fontWeight: '700',
    marginTop: 16,
  },
  title: {
    color: '#1e1b17',
    fontSize: 30,
    fontWeight: '700',
    letterSpacing: -0.8,
    marginTop: 6,
  },
  toolControls: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    marginTop: 10,
  },
});
