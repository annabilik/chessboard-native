import { render } from '@testing-library/react-native';

import { Chessboard } from '../../src/index';

describe('Chessboard package shell', () => {
  it('renders one disabled, decorative layout frame', async () => {
    const result = await render(<Chessboard />);

    expect(result.container.children).toHaveLength(1);
    expect(result.root).not.toBeNull();
    expect(result.root).toHaveProp('accessibilityElementsHidden', true);
    expect(result.root).toHaveProp('accessible', false);
    expect(result.root).toHaveProp(
      'importantForAccessibility',
      'no-hide-descendants',
    );
    expect(result.root).toHaveProp('pointerEvents', 'none');
    expect(result.root).toHaveStyle({ aspectRatio: 1, width: '100%' });
  });
});
