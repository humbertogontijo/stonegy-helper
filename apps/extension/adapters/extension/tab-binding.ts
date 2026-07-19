/**
 * Pin the extension session to a single game tab so concurrent characters
 * (second window / other tab) cannot thrash in-memory settings.
 */
export function resolveBoundTabAcceptance(
  boundTabId: number | null,
  senderTabId: number | null | undefined
): { accept: boolean; nextBoundTabId: number | null } {
  if (senderTabId == null) {
    return { accept: false, nextBoundTabId: boundTabId };
  }
  if (boundTabId == null) {
    return { accept: true, nextBoundTabId: senderTabId };
  }
  return {
    accept: senderTabId === boundTabId,
    nextBoundTabId: boundTabId,
  };
}
