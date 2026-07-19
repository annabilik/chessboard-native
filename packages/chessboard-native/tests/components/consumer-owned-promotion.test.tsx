import { act, fireEvent, render } from '@testing-library/react-native';
import { createRef, useState, type ReactElement, type RefObject } from 'react';
import { View } from 'react-native';
import { State } from 'react-native-gesture-handler';
import {
  fireGestureHandler,
  getByGestureTestId,
} from 'react-native-gesture-handler/jest-utils';

import {
  Chessboard,
  type ChessboardActions,
  type ControlledPosition,
  type MoveDecision,
  type MoveIntent,
  type OnMoveRequest,
  type PieceRendererProps,
  type PieceType,
  type PositionObject,
} from '../../src';
import { getBoardGestureTestIds } from '../../src/render/board-gesture-layer';

const BOARD_ID = 'consumer-owned-promotion';
const BOARD_SIZE = 200;
const SOURCE_POINT = Object.freeze({ x: 12.5, y: 37.5 });
const TARGET_POINT = Object.freeze({ x: 12.5, y: 12.5 });

type ConsumerPosition = ControlledPosition & {
  readonly value: PositionObject;
};

const INITIAL_POSITION = Object.freeze({
  revision: 50,
  value: Object.freeze({
    a7: Object.freeze({ id: 'promoting-pawn', pieceType: 'wP' }),
    h8: Object.freeze({ id: 'other-piece', pieceType: 'bR' }),
  }),
}) satisfies ConsumerPosition;

const UNRELATED_POSITION = Object.freeze({
  revision: 51,
  value: Object.freeze({
    a7: Object.freeze({ id: 'promoting-pawn', pieceType: 'wP' }),
    b1: Object.freeze({ id: 'other-piece', pieceType: 'bR' }),
  }),
}) satisfies ConsumerPosition;

interface PromotionConsumerController {
  chooserVisible: boolean;
  choosePromotion: ((pieceType: PieceType) => void) | null;
  intent: Readonly<MoveIntent> | null;
  latestPosition: ConsumerPosition;
  publishUnrelatedPosition: (() => void) | null;
  signal: AbortSignal | null;
}

interface PromotionConsumerProps {
  readonly actionsRef: RefObject<ChessboardActions | null>;
  readonly controller: PromotionConsumerController;
}

function promotionPieceProbe(props: PieceRendererProps): ReactElement {
  return (
    <View
      testID={`promotion-piece:${props.square ?? 'spare'}:${props.piece.id ?? 'anonymous'}:${props.piece.pieceType}`}
    />
  );
}

function PromotionConsumer({
  actionsRef,
  controller,
}: PromotionConsumerProps): ReactElement {
  const [position, setPosition] = useState<ConsumerPosition>(INITIAL_POSITION);
  const [chooserVisible, setChooserVisible] = useState(false);
  controller.latestPosition = position;
  controller.chooserVisible = chooserVisible;
  controller.publishUnrelatedPosition = () => {
    setPosition(UNRELATED_POSITION);
  };

  const onMoveRequest: OnMoveRequest = (intent, { signal }) => {
    controller.intent = intent;
    controller.signal = signal;
    setChooserVisible(true);

    return new Promise<MoveDecision>((resolve) => {
      let settled = false;
      const reject = (): void => {
        if (settled) {
          return;
        }
        settled = true;
        setChooserVisible(false);
        resolve({ status: 'rejected' });
      };
      signal.addEventListener('abort', reject, { once: true });

      controller.choosePromotion = (pieceType): void => {
        const current = controller.latestPosition;
        const sourcePiece = current.value['a7'];
        if (
          settled ||
          signal.aborted ||
          current.revision !== intent.basePositionRevision ||
          sourcePiece?.id !== intent.piece.id ||
          sourcePiece?.pieceType !== intent.piece.pieceType ||
          current.value['a8'] !== undefined
        ) {
          return;
        }
        settled = true;
        setChooserVisible(false);
        resolve({ status: 'accepted' });

        void Promise.resolve().then(() => {
          const latest = controller.latestPosition;
          const latestSource = latest.value['a7'];
          if (
            signal.aborted ||
            latest.revision !== intent.basePositionRevision ||
            latestSource?.id !== intent.piece.id ||
            latestSource?.pieceType !== intent.piece.pieceType ||
            latest.value['a8'] !== undefined
          ) {
            return;
          }
          const otherPiece = latest.value['h8'];
          const nextRevision = latest.revision + 1;
          const nextValue = Object.freeze({
            a8: Object.freeze({
              ...(latestSource.id === undefined ? {} : { id: latestSource.id }),
              pieceType,
            }),
            ...(otherPiece === undefined ? {} : { h8: otherPiece }),
          }) satisfies PositionObject;
          setPosition(
            Object.freeze({
              committedIntentId: intent.intentId,
              revision: nextRevision,
              transition: Object.freeze({
                from: 'a7',
                fromRevision: latest.revision,
                promotion: pieceType,
                to: 'a8',
                toRevision: nextRevision,
              }),
              value: nextValue,
            }),
          );
        });
      };
    });
  };

  return (
    <View>
      {chooserVisible ? <View testID="consumer-promotion-chooser" /> : null}
      <Chessboard
        actionsRef={actionsRef}
        boardId={BOARD_ID}
        dimensions={{ columns: 8, rows: 8 }}
        moveRequestTimeouts={{ commitMs: 60_000, decisionMs: 60_000 }}
        onMoveRequest={onMoveRequest}
        pieceRenderers={{
          bR: promotionPieceProbe,
          wP: promotionPieceProbe,
          wQ: promotionPieceProbe,
        }}
        position={position}
        reduceMotion="always"
        transitionDurationMs={0}
      />
    </View>
  );
}

function createController(): PromotionConsumerController {
  return {
    chooserVisible: false,
    choosePromotion: null,
    intent: null,
    latestPosition: INITIAL_POSITION,
    publishUnrelatedPosition: null,
    signal: null,
  };
}

async function mountPromotionConsumer(): Promise<{
  readonly actionsRef: RefObject<ChessboardActions | null>;
  readonly controller: PromotionConsumerController;
  readonly result: Awaited<ReturnType<typeof render>>;
}> {
  const actionsRef = createRef<ChessboardActions>();
  const controller = createController();
  const result = await render(
    <PromotionConsumer actionsRef={actionsRef} controller={controller} />,
  );
  const board = result.getByRole('adjustable');
  await fireEvent(board, 'layout', {
    nativeEvent: {
      layout: { height: BOARD_SIZE, width: BOARD_SIZE, x: 0, y: 0 },
    },
  });
  return { actionsRef, controller, result };
}

async function requestPromotion(): Promise<void> {
  const pan = getByGestureTestId(getBoardGestureTestIds(BOARD_ID).pan);
  await act(() => {
    fireGestureHandler(pan, [
      { state: State.BEGAN, ...SOURCE_POINT },
      {
        state: State.ACTIVE,
        x: SOURCE_POINT.x + 10,
        y: SOURCE_POINT.y,
      },
      { state: State.ACTIVE, ...TARGET_POINT },
      { state: State.END, ...TARGET_POINT },
    ]);
  });
  await act(async () => {
    await Promise.resolve();
  });
}

function requireChoice(
  controller: PromotionConsumerController,
): (pieceType: PieceType) => void {
  const choice = controller.choosePromotion;
  if (choice === null) {
    throw new Error('Expected a pending consumer promotion choice.');
  }
  return choice;
}

function requireSignal(controller: PromotionConsumerController): AbortSignal {
  const signal = controller.signal;
  if (signal === null) {
    throw new Error('Expected a consumer promotion AbortSignal.');
  }
  return signal;
}

async function flushConsumerChoice(): Promise<void> {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });
}

describe('consumer-owned promotion over the public component', () => {
  it('aborts a pending chooser on public cancellation and makes a retained late choice inert', async () => {
    const { actionsRef, controller, result } = await mountPromotionConsumer();
    await requestPromotion();
    const choose = requireChoice(controller);
    const signal = requireSignal(controller);
    expect(result.getByTestId('consumer-promotion-chooser')).toBeDefined();

    let cancelled = false;
    await act(() => {
      cancelled = actionsRef.current?.cancelMove() ?? false;
    });
    expect(cancelled).toBe(true);
    expect(signal.aborted).toBe(true);
    expect(controller.chooserVisible).toBe(false);

    await act(() => {
      choose('wQ');
    });
    await flushConsumerChoice();

    expect(controller.latestPosition).toBe(INITIAL_POSITION);
    expect(
      result.getByTestId('promotion-piece:a7:promoting-pawn:wP', {
        includeHiddenElements: true,
      }),
    ).toBeDefined();
  });

  it('aborts a pending chooser on a newer controlled revision and makes its late choice inert', async () => {
    const { actionsRef, controller, result } = await mountPromotionConsumer();
    await requestPromotion();
    const choose = requireChoice(controller);
    const signal = requireSignal(controller);
    const publish = controller.publishUnrelatedPosition;
    if (publish === null) {
      throw new Error('Expected a consumer-controlled position publisher.');
    }

    await act(() => {
      publish();
    });
    expect(signal.aborted).toBe(true);
    expect(controller.latestPosition).toBe(UNRELATED_POSITION);
    expect(actionsRef.current?.cancelMove()).toBe(false);

    await act(() => {
      choose('wQ');
    });
    await flushConsumerChoice();

    expect(controller.latestPosition).toBe(UNRELATED_POSITION);
    expect(
      result.queryByTestId('promotion-piece:a8:promoting-pawn:wQ', {
        includeHiddenElements: true,
      }),
    ).toBeNull();
  });

  it('publishes exactly one next controlled revision with matching intent and promotion transition', async () => {
    const { actionsRef, controller, result } = await mountPromotionConsumer();
    await requestPromotion();
    const choose = requireChoice(controller);
    const intent = controller.intent;
    if (intent === null) {
      throw new Error('Expected one consumer-owned promotion intent.');
    }
    expect(intent).toEqual(
      expect.objectContaining({
        basePositionRevision: 50,
        piece: { id: 'promoting-pawn', pieceType: 'wP' },
        source: { kind: 'board', square: 'a7' },
        targetSquare: 'a8',
      }),
    );

    await act(() => {
      choose('wQ');
    });
    await flushConsumerChoice();

    expect(controller.latestPosition).toEqual({
      committedIntentId: intent.intentId,
      revision: 51,
      transition: {
        from: 'a7',
        fromRevision: 50,
        promotion: 'wQ',
        to: 'a8',
        toRevision: 51,
      },
      value: {
        a8: { id: 'promoting-pawn', pieceType: 'wQ' },
        h8: { id: 'other-piece', pieceType: 'bR' },
      },
    });
    expect(
      result.queryByTestId('promotion-piece:a7:promoting-pawn:wP', {
        includeHiddenElements: true,
      }),
    ).toBeNull();
    expect(
      result.getByTestId('promotion-piece:a8:promoting-pawn:wQ', {
        includeHiddenElements: true,
      }),
    ).toBeDefined();
    expect(actionsRef.current?.cancelMove()).toBe(false);
  });
});
