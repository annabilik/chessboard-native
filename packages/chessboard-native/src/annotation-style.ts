import type { AnnotationStyle } from './public-types';

/** Default native annotation geometry and future tool colors. @public */
export const defaultAnnotationStyle: Readonly<AnnotationStyle> = Object.freeze({
  activeArrowWidthMultiplier: 0.9,
  activeOpacity: 0.5,
  arrowLengthReducerDenominator: 8,
  arrowStartOffset: 0,
  arrowWidthDenominator: 5,
  color: '#ffaa00',
  opacity: 0.65,
  sameTargetArrowLengthReducerDenominator: 4,
  secondaryColor: '#4caf50',
  tertiaryColor: '#f44336',
});
