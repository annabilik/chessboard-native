import {
  applyAnnotationOperation,
  Chessboard,
  findMatchingAnnotationIds,
  type AnnotationOperation,
  type ControlledAnnotations,
  type ControlledPosition,
  type OnAnnotationOperation,
} from '@vibechess/chessboard-native';
import { useCallback, useRef, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

const BOARD_ID = 'controlled-annotation-lab';

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

export default function ControlledAnnotationsRoute() {
  const [annotations, setAnnotations] =
    useState<ControlledAnnotations>(INITIAL_ANNOTATIONS);
  const annotationsRef = useRef<ControlledAnnotations>(INITIAL_ANNOTATIONS);
  const [position, setPosition] =
    useState<ControlledPosition>(INITIAL_POSITION);
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
        `${operation.operationId}: ${result.status}${result.stale ? ' · stale-safe' : ''}`,
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
    setOperationLog([]);
    setLabEpoch((current) => current + 1);
  }, [publishAnnotations]);

  return (
    <SafeAreaView style={styles.screen}>
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.eyebrow}>PHASE 4 · CONTROLLED ANNOTATIONS</Text>
        <Text style={styles.title}>Revision-safe annotation store</Text>
        <Text style={styles.description}>
          The callback emits deltas only. This route applies each delta against
          the latest consumer-owned envelope and publishes the returned value as
          the next controlled prop.
        </Text>

        <View style={styles.boardContainer}>
          <Chessboard
            annotationPolicies={annotationPolicies}
            annotations={annotations}
            boardId={BOARD_ID}
            key={labEpoch}
            onAnnotationOperation={onAnnotationOperation}
            position={position}
          />
        </View>

        <Text style={styles.status}>
          Annotation revision {annotations.revision} · position revision{' '}
          {position.revision} · {annotations.value.length} persistent items
        </Text>

        <Text style={styles.help}>
          The controls construct deterministic add, toggle, remove, and clear
          operations. Tap the board to request policy clearing; advancing the
          position tests the independent position-change policy. Neither policy
          edits the collection inside the board.
        </Text>

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
          This lab proves operation application and stale-base safety. Native
          long-press, two-finger, and explicit-mode gestures will produce the
          transient drawing draft and final operation in P4.4; a draft is never
          added to this persistent store.
        </Text>
      </ScrollView>
    </SafeAreaView>
  );
}

function LabButton({
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
});
