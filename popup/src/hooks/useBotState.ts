import { useCallback, useEffect, useRef, useState } from "react";
import { BotRpcError, sendBot } from "../api/bot";
import type { BotState } from "../../../lib/types";
import type { ConnectionHint } from "../types/bot";
import { isGameConnected } from "../utils/format";

export function useBotState() {
  const [state, setState] = useState<BotState | null>(null);
  const [loading, setLoading] = useState(true);
  const [reloadingPage, setReloadingPage] = useState(false);
  const [connectionHint, setConnectionHint] = useState<ConnectionHint | null>(null);
  const [connectionMessage, setConnectionMessage] = useState<string | null>(null);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const applyConnectionResponse = useCallback((response: Awaited<ReturnType<typeof sendBot>>) => {
    if (response?.state) {
      setState((previous) => {
        if (
          previous &&
          isGameConnected(previous) &&
          !isGameConnected(response.state!) &&
          response.connectionHint === "no-game-session"
        ) {
          // Keep character header but surface the hint below.
          return {
            ...previous,
            connection: response.state!.connection,
          };
        }
        return response.state!;
      });
    }
    if (!(response?.connectionHint === "no-game-session")) {
      setConnectionHint(response?.connectionHint ?? null);
      setConnectionMessage(response?.message ?? null);
    } else {
      setConnectionHint("no-game-session");
      setConnectionMessage(response?.message ?? "Open Stonegy and enter the world.");
    }
  }, []);

  const checkConnection = useCallback(async () => {
    try {
      const response = await sendBot("bot:check-connection");
      if (!mountedRef.current) {
        return response;
      }
      applyConnectionResponse(response);
      if (isGameConnected(response?.state ?? null)) {
        const refreshed = await sendBot("bot:get-state");
        if (mountedRef.current && refreshed?.state) {
          setState(refreshed.state);
        }
      }
      return response;
    } catch (error) {
      if (mountedRef.current) {
        setConnectionHint("no-tab");
        setConnectionMessage(
          error instanceof BotRpcError
            ? error.message
            : "Background unreachable — reload the extension"
        );
      }
      return { ok: false, error: String(error) };
    } finally {
      if (mountedRef.current) {
        setLoading(false);
      }
    }
  }, [applyConnectionResponse]);

  const reloadGamePage = useCallback(async () => {
    setReloadingPage(true);
    setConnectionHint("connecting");
    setConnectionMessage("Reloading Stonegy…");
    let aborted = false;
    const abort = () => {
      aborted = true;
    };
    // Cleared on unmount via mountedRef checks inside the loop.
    try {
      const response = await sendBot("bot:reload-game-tab");
      if (response?.ok === false) {
        throw new Error(response.error ?? "Failed to reload Stonegy tab");
      }
      if (mountedRef.current && response?.state) {
        setState(response.state);
      }

      for (let attempt = 0; attempt < 24; attempt += 1) {
        if (!mountedRef.current || aborted) {
          break;
        }
        await new Promise((resolve) => setTimeout(resolve, 1000));
        if (!mountedRef.current) {
          break;
        }
        const status = await checkConnection();
        if (isGameConnected(status?.state ?? null)) {
          if (mountedRef.current) {
            setConnectionHint("connected");
            setConnectionMessage(null);
          }
          break;
        }
      }
      void abort;
    } finally {
      if (mountedRef.current) {
        setReloadingPage(false);
      }
    }
  }, [checkConnection]);

  const refreshState = useCallback(async () => {
    try {
      const response = await sendBot("bot:get-state");
      if (mountedRef.current && response?.state) {
        setState(response.state);
      }
    } catch (error) {
      if (mountedRef.current) {
        setConnectionMessage(
          error instanceof BotRpcError
            ? error.message
            : "Background unreachable — reload the extension"
        );
      }
    } finally {
      if (mountedRef.current) {
        setLoading(false);
      }
    }
  }, []);

  useEffect(() => {
    void checkConnection();

    const listener = (message: { channel?: string; state?: BotState }) => {
      if (message.channel === "state-updated" && message.state) {
        setState(message.state);
        if (isGameConnected(message.state)) {
          setConnectionHint("connected");
          setConnectionMessage(null);
        } else if (message.state.connection.readyState === 0) {
          setConnectionHint("connecting");
          setConnectionMessage("Connecting to the game server…");
        }
      }
    };

    chrome.runtime.onMessage.addListener(listener);
    return () => chrome.runtime.onMessage.removeListener(listener);
  }, [checkConnection]);

  return {
    state,
    loading,
    reloadingPage,
    connectionHint,
    connectionMessage,
    reloadGamePage,
    refreshState,
    setState,
    connected: isGameConnected(state),
  };
}
