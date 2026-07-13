import { createInterface } from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";
import { findCharacter, listCharacters } from "../lib/api/characters";
import { StonegyApiError, type Character } from "../lib/api/types";

const CHARACTER_ID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function readFlag(args: string[], name: string): string | undefined {
  const index = args.indexOf(name);
  if (index === -1) {
    return undefined;
  }
  return args[index + 1];
}

export function hasFlag(args: string[], name: string): boolean {
  return args.includes(name);
}

export function requireTokenFlag(args: string[]): string {
  const token =
    readFlag(args, "--token") ?? readFlag(args, "-t") ?? process.env.STONEGY_TOKEN;
  if (!token) {
    throw new Error("Missing token. Pass --token or set STONEGY_TOKEN.");
  }
  return token;
}

async function loadCharacters(token: string) {
  try {
    return await listCharacters(token);
  } catch (error) {
    if (error instanceof StonegyApiError) {
      throw new Error(`Character list failed (${error.status}): ${error.message}`);
    }
    throw error;
  }
}

export async function promptCharacter(token: string): Promise<Character> {
  const response = await loadCharacters(token);
  const characters = response.characters;

  if (!characters.length) {
    throw new Error("No characters found on this account.");
  }

  if (characters.length === 1) {
    const character = characters[0];
    console.log(
      `Using character ${character.name} (${character.vocation} ${character.level}) [${character.id}]`
    );
    return character;
  }

  console.log("Select a character:");
  for (const [index, character] of characters.entries()) {
    console.log(
      `  ${index + 1}. ${character.name} (${character.vocation} ${character.level}) on ${character.world.name} [${character.id}]`
    );
  }

  const rl = createInterface({ input, output });
  try {
    while (true) {
      const answer = (await rl.question("Character number or name: ")).trim();
      if (!answer) {
        continue;
      }

      const byIndex = Number(answer);
      if (Number.isInteger(byIndex) && byIndex >= 1 && byIndex <= characters.length) {
        return characters[byIndex - 1];
      }

      const byName = findCharacter(characters, answer);
      if (byName) {
        return byName;
      }

      console.log("Invalid selection. Enter a list number or character name.");
    }
  } finally {
    rl.close();
  }
}

export async function resolveCharacter(token: string, args: string[]): Promise<Character> {
  const selector =
    readFlag(args, "--character") ??
    readFlag(args, "--character-id") ??
    readFlag(args, "-c");

  if (selector) {
    const response = await loadCharacters(token);
    const characters = response.characters;

    if (CHARACTER_ID_PATTERN.test(selector)) {
      const byId = characters.find(
        (character) => character.id.toLowerCase() === selector.toLowerCase()
      );
      if (!byId) {
        throw new Error(`Character not found: ${selector}`);
      }
      return byId;
    }

    const byName = findCharacter(characters, selector);
    if (!byName) {
      throw new Error(`Character not found: ${selector}`);
    }
    return byName;
  }

  return promptCharacter(token);
}

export function printError(error: unknown) {
  if (error instanceof Error) {
    console.error(`Error: ${error.message}`);
    return;
  }
  console.error("Error:", error);
}
