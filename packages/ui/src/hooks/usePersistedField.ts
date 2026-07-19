import { useCallback, useEffect, useRef, useState } from "react";

function defaultEqual<T>(a: T, b: T): boolean {
  return a === b;
}

/**
 * Local form state that syncs from persisted bot settings without clobbering
 * in-progress edits when live WebSocket traffic refreshes the full BotState.
 *
 * Pass `scopeKey` (e.g. characterId) to reset local state when the owning
 * profile changes without unmounting the component.
 *
 * `remoteValue` of `undefined` means "not loaded yet" (use fallback). Explicit
 * `null` is kept so nullable settings can clear the local field.
 */
export function usePersistedField<T>(
  remoteValue: T | undefined,
  fallback: T,
  isEqual: (a: T, b: T) => boolean = defaultEqual,
  scopeKey?: string | null
): [T, (value: T | ((prev: T) => T)) => void] {
  // Only treat `undefined` as missing so nullable remotes (e.g. null position) stick.
  const resolvedRemote = remoteValue !== undefined ? remoteValue : fallback;
  const [local, setLocalState] = useState(resolvedRemote);
  const dirtyRef = useRef(false);
  const initializedRef = useRef(false);
  const scopeRef = useRef(scopeKey);

  useEffect(() => {
    if (scopeKey !== scopeRef.current) {
      scopeRef.current = scopeKey;
      dirtyRef.current = false;
      initializedRef.current = false;
      setLocalState(resolvedRemote);
    }
  }, [scopeKey, resolvedRemote]);

  useEffect(() => {
    if (!initializedRef.current) {
      setLocalState(resolvedRemote);
      initializedRef.current = true;
      return;
    }

    if (dirtyRef.current) {
      setLocalState((current) => {
        if (isEqual(current, resolvedRemote)) {
          dirtyRef.current = false;
        }
        return current;
      });
      return;
    }

    setLocalState((current) => (isEqual(current, resolvedRemote) ? current : resolvedRemote));
  }, [resolvedRemote, isEqual]);

  const setLocal = useCallback((value: T | ((prev: T) => T)) => {
    dirtyRef.current = true;
    setLocalState(value);
  }, []);

  return [local, setLocal];
}

export function jsonEqual<T>(a: T, b: T): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}
