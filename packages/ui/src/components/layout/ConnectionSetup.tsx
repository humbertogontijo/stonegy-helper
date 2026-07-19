import type { ConnectionHint } from "../../types/bot";
import { StonegyButton } from "../ui/StonegyButton";
import { StonegyPanel } from "../ui/StonegyPanel";

interface ConnectionSetupProps {
  hint: ConnectionHint | null;
  message: string | null;
  reloading: boolean;
  onReloadPage: () => void;
}

const STEPS = [
  {
    title: "Open Stonegy",
    detail: "Go to stonegy-online.com in a browser tab and keep it open.",
  },
  {
    title: "Enter the game",
    detail: "Log in and select a character so the game session is active.",
  },
  {
    title: "Reload the page",
    detail: "Click Reload page below after logging in, or if the game seems stuck.",
  },
];

function hintTitle(hint: ConnectionHint | null): string {
  switch (hint) {
    case "connecting":
      return "Connecting to Stonegy…";
    case "no-tab":
      return "Stonegy tab not found";
    case "no-game-session":
      return "Not connected to the game";
    default:
      return "Connect to Stonegy";
  }
}

function hintDescription(hint: ConnectionHint | null, message: string | null): string {
  if (message) {
    return message;
  }
  switch (hint) {
    case "connecting":
      return "Waiting for the game WebSocket to open. This usually takes a few seconds after you enter the world.";
    case "no-tab":
      return "The bot needs an open Stonegy tab to read game data and send commands.";
    case "no-game-session":
      return "The Stonegy tab is open, but the bot cannot reach an active game session yet.";
    default:
      return "The bot cannot control your character until it connects to an active Stonegy game session.";
  }
}

export function ConnectionSetup({ hint, message, reloading, onReloadPage }: ConnectionSetupProps) {
  const isConnecting = hint === "connecting";

  return (
    <main className="flex flex-1 min-h-0 flex-col overflow-y-auto p-4">
      <StonegyPanel className="flex flex-col gap-4">
        <div className="flex items-start gap-3">
          <div
            className={`mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-full border text-lg ${
              isConnecting
                ? "border-[var(--teal)] bg-[rgba(10,200,185,0.12)] text-[var(--teal)]"
                : "border-[var(--danger)] bg-[rgba(214,91,74,0.12)] text-[var(--danger)]"
            }`}
            aria-hidden
          >
            {isConnecting ? "…" : "!"}
          </div>
          <div className="min-w-0">
            <h2 className="section-title !text-sm !tracking-[0.06em]">{hintTitle(hint)}</h2>
            <p className="m-0 mt-1.5 text-[12px] leading-relaxed text-[var(--text-body)]">
              {hintDescription(hint, message)}
            </p>
          </div>
        </div>

        <ol className="m-0 flex list-none flex-col gap-2.5 p-0">
          {STEPS.map((step, index) => {
            const emphasized =
              (hint === "no-tab" && index === 0) ||
              (hint === "no-game-session" && index === 1) ||
              (hint === "connecting" && index === 2) ||
              (hint === "no-game-session" && index === 2);

            return (
              <li
                key={step.title}
                className={`rounded-md border px-3 py-2.5 ${
                  emphasized
                    ? "border-[var(--border-gold-strong)] bg-[rgba(200,155,60,0.1)]"
                    : "border-[var(--border-gold-soft)] bg-[rgba(5,5,5,0.35)]"
                }`}
              >
                <div className="flex items-start gap-2.5">
                  <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-[rgba(200,155,60,0.18)] text-[10px] font-extrabold text-[var(--gold)]">
                    {index + 1}
                  </span>
                  <div className="min-w-0">
                    <p className="m-0 text-[11px] font-bold uppercase tracking-wide text-[var(--text-primary)]">
                      {step.title}
                    </p>
                    <p className="m-0 mt-0.5 text-[11px] leading-relaxed text-[var(--text-muted)]">
                      {step.detail}
                    </p>
                  </div>
                </div>
              </li>
            );
          })}
        </ol>

        <div className="flex flex-col gap-2">
          <StonegyButton fullWidth onClick={onReloadPage} disabled={reloading}>
            {reloading ? "Reloading…" : "Reload page"}
          </StonegyButton>
          <p className="m-0 text-center text-[10px] text-[var(--text-muted)]">
            Bot features stay hidden until the game connection is open.
          </p>
        </div>
      </StonegyPanel>
    </main>
  );
}
