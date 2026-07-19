import { createContext, useContext, type ReactNode } from "react";
import type { BotTransport } from "./types";

const BotTransportContext = createContext<BotTransport | null>(null);

export function BotTransportProvider({
  transport,
  children,
}: {
  transport: BotTransport;
  children: ReactNode;
}) {
  return (
    <BotTransportContext.Provider value={transport}>{children}</BotTransportContext.Provider>
  );
}

export function useBotTransport(): BotTransport {
  const transport = useContext(BotTransportContext);
  if (!transport) {
    throw new Error("useBotTransport must be used within BotTransportProvider");
  }
  return transport;
}
