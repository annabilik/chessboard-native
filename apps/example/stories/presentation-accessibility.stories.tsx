import type { Meta, StoryObj } from '@storybook/react-native';

import AccessibilityScreen from '../app/accessibility';
import ControlledTransitionsScreen from '../app/transitions';
import VisualCustomizationScreen from '../app/visual-customization';

const meta = {
  parameters: { layout: 'fullscreen' },
  title: 'Gallery/Presentation and Accessibility',
} satisfies Meta;

export default meta;

type Story = StoryObj<typeof meta>;

export const ControlledTransitions = {
  parameters: {
    notes:
      'Inferred and explicit controlled transitions, interruption, rebasing, and reduced motion.',
  },
  render: () => <ControlledTransitionsScreen />,
} satisfies Story;

export const VisualCustomization = {
  parameters: {
    notes:
      'Themes, per-instance styles, square overrides, and visual-only custom renderers.',
  },
  render: () => <VisualCustomizationScreen />,
} satisfies Story;

export const Accessibility = {
  parameters: {
    notes:
      'Manual accessibility lab for the board as one adjustable control with a stable virtual cursor.',
  },
  render: () => <AccessibilityScreen />,
} satisfies Story;
