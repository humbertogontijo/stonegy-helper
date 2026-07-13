#!/usr/bin/env node

import { Command } from "commander";
import { runInteractive } from "./commands/run";
import { printError } from "./util";

const program = new Command();

program
  .name("stonegy-helper")
  .description("Stonegy Helper — interactive CLI for headless automation")
  .version("0.1.0");

program
  .command("run", { isDefault: false })
  .description("Connect to a character and manage features interactively")
  .option("-t, --token <token>", "Bearer token (or set STONEGY_TOKEN)")
  .option("-c, --character <name|uuid>", "Character name or UUID (skips prompt)")
  .option("-v, --verbose", "Verbose WebSocket logging")
  .action(async (options) => {
    const args = ["run"];
    if (options.token) {
      args.push("--token", options.token);
    }
    if (options.character) {
      args.push("--character", options.character);
    }
    if (options.verbose) {
      args.push("--verbose");
    }
    try {
      await runInteractive(args);
    } catch (error) {
      printError(error);
      process.exit(1);
    }
  });

program.addHelpText(
  "after",
  `
Examples:
  stonegy-helper run --token YOUR_TOKEN
  stonegy-helper run --token YOUR_TOKEN --character "My Char"
  STONEGY_TOKEN=... stonegy-helper run

Before starting, the CLI loads characters from /api/character and prompts you to pick one.
Pass --character with a UUID or name to skip the prompt.
`
);

async function main() {
  const [, , maybeCommand] = process.argv;

  if (!maybeCommand || maybeCommand === "--help" || maybeCommand === "-h" || maybeCommand === "help") {
    program.help();
    return;
  }

  await program.parseAsync(process.argv);
}

main().catch((error) => {
  printError(error);
  process.exit(1);
});
