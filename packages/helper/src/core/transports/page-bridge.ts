import { sendPageBridgeCommand } from "../../page-bridge/transport";
import type { Transport, WireMessage } from "../transport";

export interface PageBridgeTransportOptions {
  getTabId: () => Promise<number | null>;
  onWsEvent?: (payload: { raw: string; direction: "send" | "receive"; opcode: number }) => void;
}

export class PageBridgeTransport implements Transport {
  private messageHandler: ((message: WireMessage) => void) | null = null;
  private connectionHandler: ((connected: boolean, readyState?: number) => void) | null = null;

  constructor(private options: PageBridgeTransportOptions) {}

  relayWsEvent(payload: { raw: string; direction: "send" | "receive"; opcode: number }): void {
    this.options.onWsEvent?.(payload);
    this.messageHandler?.({
      direction: payload.direction,
      opcode: payload.opcode as 1 | 2,
      data: payload.raw,
    });
  }

  setConnection(connected: boolean, readyState: number): void {
    this.connectionHandler?.(connected, readyState);
  }

  async connect(): Promise<void> {
    const tabId = await this.options.getTabId();
    if (tabId == null) {
      throw new Error("No game tab found");
    }
    // Do not claim connected here — the host applies real WS status via setConnection.
  }

  async send(opcode: 1 | 2, data: string): Promise<void> {
    const tabId = await this.options.getTabId();
    if (tabId == null) {
      throw new Error("No game tab found");
    }
    // Do not emit locally — the MAIN-world WebSocket patch mirrors ws:send
    // back through relayWsEvent (avoids double handleWireMessage).
    await sendPageBridgeCommand(tabId, "ws:send", { opcode, data });
  }

  onMessage(handler: (message: WireMessage) => void): void {
    this.messageHandler = handler;
  }

  onConnectionChange(handler: (connected: boolean, readyState?: number) => void): void {
    this.connectionHandler = handler;
  }

  close(): void {
    this.connectionHandler?.(false, 3);
  }

  async sendKeepAlive(): Promise<void> {
    const tabId = await this.options.getTabId();
    if (tabId == null) {
      return;
    }
    await sendPageBridgeCommand(tabId, "page:keep-alive", {});
  }
}
