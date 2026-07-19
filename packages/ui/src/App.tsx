import { useMemo } from "react";
import { HelperPartyShell, type HelperPartyTab } from "./shell/HelperPartyShell";
import { createChromeBotTransport } from "./transport/chrome";
import { createHttpBotTransport, HELPER_BASE_URL } from "./transport/http";
import { BotTransportProvider } from "./transport/context";
import { useBotState } from "./hooks/useBotState";
import { useHelperConnection } from "./helper/useHelperConnection";

/**
 * Builds party tabs from the live character's roster.
 * Self → chrome transport; other managed+connected members → HTTP; else unmanaged.
 */
function PartyDrivenApp() {
  const chromeTransport = useMemo(() => createChromeBotTransport(), []);
  const { state } = useBotState();
  const { online: helperUp, membersById: managed } = useHelperConnection(HELPER_BASE_URL);

  const tabs = useMemo((): HelperPartyTab[] => {
    const selfId = state?.character.characterId ?? null;
    const selfName = state?.character.characterName?.trim() || "Live";
    const members = state?.party.partyMembers ?? [];

    const selfTab: HelperPartyTab = {
      characterId: selfId ?? "live",
      characterName: selfName,
      transport: chromeTransport,
      live: true,
    };

    if (!selfId || members.length <= 1) {
      return [selfTab];
    }

    const tabsOut: HelperPartyTab[] = [selfTab];
    for (const member of members) {
      const id = member.id;
      if (!id || id === selfId) {
        continue;
      }
      const name = member.name?.trim() || id;
      const remote = helperUp ? managed.get(id) : undefined;
      if (remote?.managed && remote.connected) {
        tabsOut.push({
          characterId: id,
          characterName: name,
          transport: createHttpBotTransport(HELPER_BASE_URL, id),
        });
      } else {
        tabsOut.push({
          characterId: id,
          characterName: name,
          transport: chromeTransport,
          unmanaged: true,
        });
      }
    }
    return tabsOut;
  }, [
    chromeTransport,
    helperUp,
    managed,
    state?.character.characterId,
    state?.character.characterName,
    state?.party.partyMembers,
  ]);

  return <HelperPartyShell tabs={tabs} />;
}

export function App() {
  const chromeTransport = useMemo(() => createChromeBotTransport(), []);
  return (
    <BotTransportProvider transport={chromeTransport}>
      <PartyDrivenApp />
    </BotTransportProvider>
  );
}
