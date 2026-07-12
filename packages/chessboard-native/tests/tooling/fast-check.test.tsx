import { render } from '@testing-library/react-native';
import fc from 'fast-check';

import { Chessboard } from '../../src/index';

describe('fast-check infrastructure smoke', () => {
  it('keeps the package shell declarative across parent rerenders', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.integer({ max: 3, min: 0 }),
        async (rerenderCount) => {
          const result = await render(
            <Chessboard boardId="property" position={{}} />,
          );

          try {
            for (let index = 0; index < rerenderCount; index += 1) {
              await result.rerender(
                <Chessboard boardId="property" position={{}} />,
              );
            }

            expect(result.container.children).toHaveLength(1);
            expect(result.root).toHaveProp('accessible', true);
            expect(result.root).toHaveProp('pointerEvents', 'box-none');
          } finally {
            await result.unmount();
          }
        },
      ),
      { numRuns: 100 },
    );
  });
});
