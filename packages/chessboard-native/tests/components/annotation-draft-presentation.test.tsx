import { fireEvent, render } from '@testing-library/react-native';
import type { TestInstance } from 'test-renderer';

import { defaultAnnotationStyle } from '../../src/annotation-style';
import { ChessboardProvider } from '../../src/ChessboardProvider';
import {
  createBoardModelMetadata,
  prepareBoardModel,
  type NormalizedBoardModel,
} from '../../src/internal/board-model';
import type { CorrelatedAnnotationDraft } from '../../src/internal/annotation-draft-presentation';
import { BoardSurface } from '../../src/render/board-surface';

function readyModel(): NormalizedBoardModel {
  const prepared = prepareBoardModel({
    annotations: {
      revision: 7,
      value: [
        {
          color: '#f00',
          from: 'a1',
          id: 'persistent',
          to: 'b2',
          type: 'arrow',
        },
      ],
    },
    boardId: 'draft-board',
    development: true,
    dimensions: { columns: 2, rows: 2 },
    position: { revision: 3, value: {} },
    previousMetadata: createBoardModelMetadata(),
  });
  if (prepared.model.status !== 'ready') {
    throw new Error('Expected a ready board model.');
  }
  return prepared.model;
}

const DRAFT: Readonly<CorrelatedAnnotationDraft> = Object.freeze({
  baseAnnotationRevision: 7,
  basePositionRevision: 3,
  boardId: 'draft-board',
  draft: Object.freeze({
    color: '#0f0',
    from: 'b1',
    to: 'a2',
    type: 'arrow' as const,
  }),
  geometryEpoch: 0,
  providerGeometryRevision: 2,
  providerLifecycleRevision: 4,
});

function Surface({
  draft = DRAFT,
  model = readyModel(),
  providerGeometryRevision = 2,
  providerLifecycleRevision = 4,
}: {
  readonly draft?: Readonly<CorrelatedAnnotationDraft> | null;
  readonly model?: NormalizedBoardModel;
  readonly providerGeometryRevision?: number;
  readonly providerLifecycleRevision?: number;
}) {
  return (
    <ChessboardProvider geometryRevision={providerGeometryRevision}>
      <BoardSurface
        accessibility={undefined}
        annotationDraft={draft}
        annotationPolicies={undefined}
        annotationStyle={defaultAnnotationStyle}
        canDragPiece={undefined}
        development={false}
        interactionPermissions={undefined}
        model={model}
        moveRequestTimeouts={undefined}
        onAnnotationOperation={undefined}
        onMoveRequest={undefined}
        onSquareActivate={undefined}
        pieceRenderers={{}}
        providerGeometryRevision={providerGeometryRevision}
        providerLifecycleRevision={providerLifecycleRevision}
        providerRegistration={null}
        showNotation={false}
        squareStyles={undefined}
        styles={undefined}
        theme={undefined}
        transitionDurationMs={0}
      />
    </ChessboardProvider>
  );
}

function rootOf(result: Awaited<ReturnType<typeof render>>): TestInstance {
  if (result.root === null) {
    throw new Error('Expected a rendered board root.');
  }
  return result.root;
}

function nodes(root: TestInstance, testID: string): TestInstance[] {
  return root.queryAll((node) => node.props['testID'] === testID);
}

describe('mounted transient annotation draft presentation', () => {
  it('[CBN-CONTRACT-010-DRAFT-NONPERSISTENT] composes one exact-match draft without adding it to the canonical model', async () => {
    const model = readyModel();
    const result = await render(<Surface model={model} />);
    await fireEvent(rootOf(result), 'layout', {
      nativeEvent: {
        layout: { height: 200, width: 200, x: 0, y: 0 },
      },
    });

    expect(nodes(rootOf(result), 'annotation:persistent:shaft')).toHaveLength(
      1,
    );
    expect(nodes(rootOf(result), 'annotation-draft:shaft')).toHaveLength(1);
    expect(nodes(rootOf(result), 'annotation-draft:head')).toHaveLength(1);
    expect(model.annotations?.value).toHaveLength(1);
    expect(model.annotations?.value[0]?.id).toBe('persistent');
    expect(model.annotations?.value).not.toContain(DRAFT.draft);

    await result.rerender(
      <Surface model={model} providerGeometryRevision={3} />,
    );
    expect(nodes(rootOf(result), 'annotation:persistent:shaft')).toHaveLength(
      1,
    );
    expect(nodes(rootOf(result), 'annotation-draft:shaft')).toEqual([]);
    expect(nodes(rootOf(result), 'annotation-draft:head')).toEqual([]);
  });
});
