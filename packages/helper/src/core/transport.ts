export interface WireMessage {
  direction: "send" | "receive";
  opcode: 1 | 2;
  data: string;
}

export interface Transport {
  connect(): Promise<void>;
  send(opcode: 1 | 2, data: string): Promise<void>;
  onMessage(handler: (message: WireMessage) => void): void;
  onConnectionChange(handler: (connected: boolean, readyState?: number) => void): void;
  close(): void;
}
