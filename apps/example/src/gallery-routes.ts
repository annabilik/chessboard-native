export type GalleryRouteName =
  | 'accessibility'
  | 'controlled-annotations'
  | 'controlled-selection'
  | 'interaction-hardening'
  | 'move-request'
  | 'piece-callbacks'
  | 'provider-coordination'
  | 'react-chessboard-compat'
  | 'rules-owned-moves'
  | 'spare-pieces'
  | 'square-press-callbacks'
  | 'transitions'
  | 'visual-customization';

export type GalleryRouteHref = `/${GalleryRouteName}`;

export interface GalleryRoute {
  readonly description: string;
  readonly name: GalleryRouteName;
  readonly title: string;
}

export interface GalleryRouteSection {
  readonly description: string;
  readonly id: string;
  readonly routes: readonly GalleryRoute[];
  readonly title: string;
}

const controlledStateRoutes = Object.freeze([
  Object.freeze({
    description:
      'Apply revision-safe arrow and square deltas while the consumer owns the annotation collection.',
    name: 'controlled-annotations',
    title: 'Controlled annotations',
  }),
  Object.freeze({
    description:
      'Own selected, destination, and disabled squares while observing activation and move intents.',
    name: 'controlled-selection',
    title: 'Controlled selection',
  }),
  Object.freeze({
    description:
      'Accept, reject, and cancel asynchronous move requests while configuring their timeout budget.',
    name: 'move-request',
    title: 'Controlled move requests',
  }),
  Object.freeze({
    description:
      'Keep promotion choice and premove queues in application state without adding rules to the board.',
    name: 'rules-owned-moves',
    title: 'Promotion and premoves',
  }),
]) satisfies readonly GalleryRoute[];

const interactionRoutes = Object.freeze([
  Object.freeze({
    description:
      'Coordinate independently controlled boards through one explicit provider and shared overlay host.',
    name: 'provider-coordination',
    title: 'Provider coordination',
  }),
  Object.freeze({
    description:
      'Place reusable external pieces onto named standard and rectangular controlled boards.',
    name: 'spare-pieces',
    title: 'Spare pieces',
  }),
  Object.freeze({
    description:
      'Observe board and spare-piece press and drag-start events without mutating board state.',
    name: 'piece-callbacks',
    title: 'Piece callbacks',
  }),
  Object.freeze({
    description:
      'Observe canonical occupied and empty square press boundaries without claiming the gesture.',
    name: 'square-press-callbacks',
    title: 'Square press callbacks',
  }),
  Object.freeze({
    description:
      'Exercise scrolling, clipping, geometry invalidation, lifecycle cancellation, and render budgets.',
    name: 'interaction-hardening',
    title: 'Interaction hardening',
  }),
]) satisfies readonly GalleryRoute[];

const presentationRoutes = Object.freeze([
  Object.freeze({
    description:
      'Inspect inferred and explicit controlled transitions, interruption, rebasing, and reduced motion.',
    name: 'transitions',
    title: 'Controlled transitions',
  }),
  Object.freeze({
    description:
      'Layer themes, per-instance styles, square overrides, and visual-only custom renderers.',
    name: 'visual-customization',
    title: 'Visual customization',
  }),
  Object.freeze({
    description:
      'Validate the board as one adjustable control with a stable cursor and correlated announcements.',
    name: 'accessibility',
    title: 'Accessibility',
  }),
]) satisfies readonly GalleryRoute[];

const migrationRoutes = Object.freeze([
  Object.freeze({
    description:
      'Use familiar react-chessboard option and callback names over the same controlled native pipeline.',
    name: 'react-chessboard-compat',
    title: 'react-chessboard compatibility',
  }),
]) satisfies readonly GalleryRoute[];

export const GALLERY_ROUTE_SECTIONS = Object.freeze([
  Object.freeze({
    description:
      'Consumer-owned semantic state, async decisions, and rules-owned workflows.',
    id: 'controlled-state',
    routes: controlledStateRoutes,
    title: 'Controlled state',
  }),
  Object.freeze({
    description:
      'Provider composition, external sources, callbacks, and native gesture boundaries.',
    id: 'interaction-composition',
    routes: interactionRoutes,
    title: 'Interaction and composition',
  }),
  Object.freeze({
    description:
      'Motion, visual customization, and the single-control accessibility contract.',
    id: 'presentation-accessibility',
    routes: presentationRoutes,
    title: 'Presentation and accessibility',
  }),
  Object.freeze({
    description:
      'A focused adapter for consumers arriving from the web react-chessboard API.',
    id: 'migration',
    routes: migrationRoutes,
    title: 'Migration',
  }),
]) satisfies readonly GalleryRouteSection[];

export const GALLERY_ROUTES: readonly GalleryRoute[] = Object.freeze([
  ...controlledStateRoutes,
  ...interactionRoutes,
  ...presentationRoutes,
  ...migrationRoutes,
]);

export function galleryRouteHref(route: GalleryRoute): GalleryRouteHref {
  return `/${route.name}`;
}
