export interface AuthRequest {
  username: string;
  password: string;
  turnstileToken?: string;
}

export interface AuthResponse {
  token: string;
}

export interface RgbColor {
  r: number;
  g: number;
  b: number;
}

export interface WorldRuntime {
  onlinePlayers: number;
  activeHunts: number;
  updatedAt: string;
  isOnline: boolean;
}

export interface World {
  id: number;
  slug: string;
  name: string;
  region: string;
  status: string;
  wsUrl: string | null;
  apiUrl: string | null;
  maxOnline: number;
  maxActiveHunts: number | null;
  citySocialChannelCap: number;
  allowNewCharacters: boolean;
  allowTransfersIn: boolean;
  runtime: WorldRuntime;
}

export interface Character {
  id: string;
  name: string;
  worldId: number;
  level: number;
  vocation: string;
  fist: number;
  fistPercent: number;
  avatarSelected: number;
  armColor: RgbColor;
  bodyColor: RgbColor;
  headColor: RgbColor;
  isMale: boolean;
  outfitSelected: number;
  mountSelected: number | null;
  legColor: RgbColor;
  displayAddon1: boolean;
  displayAddon2: boolean;
  world: World;
}

export interface AccountMeta {
  unlockedMapLayouts: unknown[];
  unlockedEmotes: unknown[];
  selectedCharacterSelectMapLayoutId: string | null;
}

export interface CharactersResponse {
  characters: Character[];
  account: AccountMeta;
}

export interface ApiErrorBody {
  message?: string;
  error?: string;
}

export class StonegyApiError extends Error {
  readonly status: number;
  readonly body: unknown;

  constructor(message: string, status: number, body: unknown) {
    super(message);
    this.name = "StonegyApiError";
    this.status = status;
    this.body = body;
  }
}
