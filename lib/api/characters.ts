import { apiRequestCharacters } from "./client";
import type { Character, CharactersResponse } from "./types";

export async function listCharacters(token: string): Promise<CharactersResponse> {
  return apiRequestCharacters("/api/character", { token });
}

export function findCharacter(
  characters: Character[],
  selector: string
): Character | undefined {
  const normalized = selector.trim().toLowerCase();
  return (
    characters.find((character) => character.id === selector) ??
    characters.find((character) => character.name.toLowerCase() === normalized)
  );
}
