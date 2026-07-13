import WebSocket from "ws";
import { StonegyWsClient, type WsClientOptions } from "../../api/ws-client";
import type { Transport, WireMessage } from "../transport";

export class DirectWsTransport implements Transport {
  private client: StonegyWsClient;
  private messageHandler: ((message: WireMessage) => void) | null = null;
  private connectionHandler: ((connected: boolean, readyState?: number) => void) | null = null;

  constructor(options: WsClientOptions) {
    this.client = new StonegyWsClient({
      ...options,
      onMessage: (raw, _parsed, opcode = 1) => {
        this.messageHandler?.({
          direction: "receive",
          opcode: opcode as 1 | 2,
          data: raw,
        });
      },
      onClose: () => {
        this.connectionHandler?.(false, WebSocket.CLOSED);
      },
    });
  }

  async connect(): Promise<void> {
    await this.client.connect();
    this.connectionHandler?.(true, WebSocket.OPEN);
  }

  async send(opcode: 1 | 2, data: string): Promise<void> {
    if (opcode !== 1) {
      throw new Error("Direct WS transport only supports JSON commands (opcode 1)");
    }
    this.messageHandler?.({ direction: "send", opcode: 1, data });
    this.client.sendJson(data);
  }

  onMessage(handler: (message: WireMessage) => void): void {
    this.messageHandler = handler;
  }

  onConnectionChange(handler: (connected: boolean, readyState?: number) => void): void {
    this.connectionHandler = handler;
  }

  close(): void {
    this.client.close();
    this.connectionHandler?.(false, WebSocket.CLOSED);
  }

  sendPing(json: string): void {
    this.client.sendJson(json);
  }
}
