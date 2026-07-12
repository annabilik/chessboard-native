/** Read an Error message without trusting a consumer-thrown value. */
export function safeErrorMessage(error: unknown, fallback: string): string {
  try {
    if (error instanceof Error) {
      const message: unknown = error.message;
      return typeof message === 'string' ? message : fallback;
    }
  } catch {
    // A revoked or hostile Proxy can throw during instanceof or property access.
  }
  return fallback;
}
