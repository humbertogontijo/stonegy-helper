export type PageBridgeStatus = {
  connected: boolean;
  readyState: number;
  url: string | null;
};

export type PageBridgeCommandResult = Record<string, unknown> & {
  ok?: boolean;
  error?: string;
};

export type ConnectionSnapshot = {
  connected: boolean;
  readyState: number;
};

export type WsEventMessage = {
  channel?: string;
  type?: string;
  payload?: Record<string, unknown>;
  connected?: boolean;
  readyState?: number;
  script?: string;
};
