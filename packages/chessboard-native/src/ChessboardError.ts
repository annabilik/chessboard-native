import type { Revision } from './public-types';

/** Recovery domain affected by invalid controlled input. @public */
export type ChessboardErrorDomain =
  'board' | 'dimensions' | 'position' | 'annotations' | 'selection';

/**
 * Code and metadata for one typed contract violation.
 *
 * Board, dimension, and orientation failures have no semantic revision.
 * Controlled value failures identify the offending revision; malformed
 * revisions and incoming plain-tier switches use `null` because no valid
 * consumer revision exists. The domain itself is derived from the code and
 * cannot disagree with it.
 *
 * @public
 */
export type ChessboardErrorDetails =
  | {
      readonly code:
        'INVALID_BOARD_ID' | 'DUPLICATE_BOARD_ID' | 'BOARD_ID_CHANGED';
      readonly boardId: string | null;
      readonly revision: null;
    }
  | {
      readonly code: 'INVALID_DIMENSIONS' | 'INVALID_ORIENTATION';
      readonly boardId: string | null;
      readonly revision: null;
    }
  | {
      readonly code:
        | 'INVALID_FEN'
        | 'FEN_DIMENSION_MISMATCH'
        | 'INVALID_POSITION'
        | 'INVALID_POSITION_SQUARE'
        | 'DUPLICATE_PIECE_ID';
      readonly boardId: string | null;
      readonly revision: Revision;
    }
  | {
      readonly code:
        'INVALID_POSITION_REVISION' | 'POSITION_CONTROL_TIER_CHANGED';
      readonly boardId: string | null;
      readonly revision: Revision | null;
    }
  | {
      readonly code: 'INVALID_ANNOTATIONS' | 'DUPLICATE_ANNOTATION_ID';
      readonly boardId: string | null;
      readonly revision: Revision;
    }
  | {
      readonly code:
        'INVALID_ANNOTATION_REVISION' | 'ANNOTATION_CONTROL_TIER_CHANGED';
      readonly boardId: string | null;
      readonly revision: Revision | null;
    }
  | {
      readonly code: 'INVALID_SELECTION';
      readonly boardId: string | null;
      readonly revision: Revision;
    }
  | {
      readonly code:
        'INVALID_SELECTION_REVISION' | 'SELECTION_CONTROL_TIER_CHANGED';
      readonly boardId: string | null;
      readonly revision: Revision | null;
    };

/** Stable diagnostic category for a chessboard contract violation. @public */
export type ChessboardErrorCode = ChessboardErrorDetails['code'];

/** Metadata supplied to a production error callback. @public */
export interface ChessboardErrorContext {
  readonly boardId: string | null;
  readonly domain: ChessboardErrorDomain;
  readonly revision: Revision | null;
}

const errorDomainByCode = {
  ANNOTATION_CONTROL_TIER_CHANGED: 'annotations',
  BOARD_ID_CHANGED: 'board',
  DUPLICATE_ANNOTATION_ID: 'annotations',
  DUPLICATE_BOARD_ID: 'board',
  DUPLICATE_PIECE_ID: 'position',
  FEN_DIMENSION_MISMATCH: 'position',
  INVALID_ANNOTATIONS: 'annotations',
  INVALID_ANNOTATION_REVISION: 'annotations',
  INVALID_BOARD_ID: 'board',
  INVALID_DIMENSIONS: 'dimensions',
  INVALID_FEN: 'position',
  INVALID_ORIENTATION: 'dimensions',
  INVALID_POSITION: 'position',
  INVALID_POSITION_REVISION: 'position',
  INVALID_POSITION_SQUARE: 'position',
  INVALID_SELECTION: 'selection',
  INVALID_SELECTION_REVISION: 'selection',
  POSITION_CONTROL_TIER_CHANGED: 'position',
  SELECTION_CONTROL_TIER_CHANGED: 'selection',
} as const satisfies Record<ChessboardErrorCode, ChessboardErrorDomain>;

/**
 * Predictable error for malformed controlled input and identity violations.
 *
 * The derived domain is the atomic recovery unit. Presentation-only transition
 * hints are not part of this error taxonomy; malformed hints are ignored with
 * a development warning and never invalidate an otherwise valid position.
 *
 * @public
 */
export class ChessboardError extends Error {
  override readonly name = 'ChessboardError';
  readonly code: ChessboardErrorCode;
  readonly domain: ChessboardErrorDomain;
  readonly boardId: string | null;
  readonly revision: Revision | null;

  constructor(
    message: string,
    details: ChessboardErrorDetails,
    cause?: unknown,
  ) {
    super(message);
    if (cause !== undefined) {
      Object.defineProperty(this, 'cause', {
        configurable: true,
        value: cause,
        writable: true,
      });
    }
    this.code = details.code;
    this.domain = errorDomainByCode[details.code];
    this.boardId = details.boardId;
    this.revision = details.revision;
  }
}

/** Production error callback. The context mirrors the error recovery domain. @public */
export type OnChessboardError = (
  error: ChessboardError,
  context: ChessboardErrorContext,
) => void;
