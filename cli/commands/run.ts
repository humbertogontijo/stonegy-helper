import { hasFlag, resolveCharacter, resolveToken } from "../util";
import { CliSession } from "../session";
import { loadCharacterConfig } from "../config";
import { runRepl } from "../interactive/repl";
import { clearStoredAuthToken } from "../auth-store";
import { interactiveBrowserLogin } from "../login-flow";

function isUnauthorizedError(error: unknown): boolean {
  return (
    error instanceof Error &&
    /token expired|re-login|\(401\)|unauthorized/i.test(error.message)
  );
}

function usedStoredToken(args: string[]): boolean {
  return (
    !hasFlag(args, "--token") &&
    !hasFlag(args, "-t") &&
    !process.env.STONEGY_TOKEN &&
    !hasFlag(args, "--login")
  );
}

export async function runInteractive(args: string[]): Promise<void> {
  let token = await resolveToken(args);
  const verbose = hasFlag(args, "--verbose") || hasFlag(args, "-v");

  let character;
  try {
    character = await resolveCharacter(token, args);
  } catch (error) {
    if (usedStoredToken(args) && isUnauthorizedError(error)) {
      console.log("Stored token expired — opening login again…");
      await clearStoredAuthToken();
      token = await interactiveBrowserLogin();
      character = await resolveCharacter(token, args);
    } else {
      throw error;
    }
  }

  const config = await loadCharacterConfig(character.id);

  const cliSession = new CliSession({
    token,
    characterId: character.id,
    characterName: character.name,
    worldId: character.worldId,
    verbose,
    featureMasters: config.featureMasters,
    initialSettings: {
      ...config.settings,
      characterId: character.id,
      characterName: character.name,
    },
  });

  await cliSession.connect();
  await runRepl(cliSession, config.featureMasters, character.id);
}
