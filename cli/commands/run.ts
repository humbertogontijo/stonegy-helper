import { hasFlag, requireTokenFlag, resolveCharacter } from "../util";
import { CliSession } from "../session";
import { loadCharacterConfig } from "../config";
import { runRepl } from "../interactive/repl";

export async function runInteractive(args: string[]): Promise<void> {
  const token = requireTokenFlag(args);
  const character = await resolveCharacter(token, args);
  const verbose = hasFlag(args, "--verbose") || hasFlag(args, "-v");

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
