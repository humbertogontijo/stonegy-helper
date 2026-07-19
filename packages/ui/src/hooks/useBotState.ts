import { useCallback, useEffect, useRef, useState } from "react";
import { BotRpcError } from "../api/bot";
import type { BotState } from "@stonegy/helper/types";
import type { BotResponse, ConnectionHint } from "../types/bot";
import { useBotTransport } from "../transport/context";
import { isGameConnected } from "../utils/format";

export function useBotState() {
  const transport = useBotTransport();
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

  const applyConnectionResponse = useCallback((response: BotResponse) => {
    if (response?.state) {
      setState((previous) => {
        if (
          previous &&
          isGameConnected(previous) &&
          !isGameConnected(response.state!) &&
          response.connectionHint === "no-game-session"
        ) {
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
      const response = await transport.send("bot:check-connection");
      if (!mountedRef.current) {
        return response;
      }
      applyConnectionResponse(response);
      if (isGameConnected(response?.state ?? null)) {
        const refreshed = await transport.send("bot:get-state");
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
  }, [applyConnectionResponse, transport]);

  const reloadGamePage = useCallback(async () => {
    setReloadingPage(true);
    setConnectionHint("connecting");
    setConnectionMessage("Reloading Stonegy…");
    try {
      const response = await transport.send("bot:reload-game-tab");
      if (response?.ok === false) {
        throw new Error(response.error ?? "Failed to reload Stonegy tab");
      }
      if (mountedRef.current && response?.state) {
        setState(response.state);
      }

      for (let attempt = 0; attempt < 24; attempt += 1) {
        if (!mountedRef.current) {
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
    } finally {
      if (mountedRef.current) {
        setReloadingPage(false);
      }
    }
  }, [checkConnection, transport]);

  const refreshState = useCallback(async () => {
    try {
      const response = await transport.send("bot:get-state");
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
  }, [transport]);

  useEffect(() => {
    void checkConnection();

    return transport.subscribe((next) => {
      setState(next);
      if (isGameConnected(next)) {
        setConnectionHint("connected");
        setConnectionMessage(null);
      } else if (next.connection.readyState === 0) {
        setConnectionHint("connecting");
        setConnectionMessage("Connecting to the game server…");
      }
    });
  }, [checkConnection, transport]);

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
