import { useCallback, useEffect, useMemo, useState } from "react";
import { HelperPartyShell, type HelperPartyTab } from "@stonegy/ui/shell/HelperPartyShell";
import { createHttpBotTransport, HELPER_BASE_URL } from "@stonegy/ui/transport/http";
import { useHelperConnection } from "@stonegy/ui/helper/useHelperConnection";
import type { PartySummary } from "@stonegy/ui/helper/types";
import {
  addProfile,
  connectSession,
  disconnectSession,
  fetchProfiles,
  listCharacters,
  loginBrowser,
  removeProfile,
  type CharacterOption,
  type PublicProfile,
} from "./api";

function partyLabel(party: PartySummary, index: number): string {
  const names = party.members.map((m) => m.name.trim()).filter(Boolean);
  if (names.length === 0) {
    return `Party ${index + 1}`;
  }
  if (names.length === 1) {
    return names[0]!;
  }
  if (names.length === 2) {
    return `${names[0]} & ${names[1]}`;
  }
  return `${names[0]} +${names.length - 1}`;
}

export function App() {
  const { online, version: helperVersion, parties } = useHelperConnection(HELPER_BASE_URL);
  const version = helperVersion ?? "…";
  const [profiles, setProfiles] = useState<PublicProfile[]>([]);
  const [hasLastAccountToken, setHasLastAccountToken] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [pickToken, setPickToken] = useState<string | null>(null);
  const [characters, setCharacters] = useState<CharacterOption[]>([]);
  const [manageOpen, setManageOpen] = useState(false);
  const [selectedPartyKey, setSelectedPartyKey] = useState<string | null>(null);

  const refreshProfiles = useCallback(async () => {
    try {
      const p = await fetchProfiles();
      setProfiles(p.profiles ?? []);
      setHasLastAccountToken(!!p.hasLastAccountToken);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : String(error));
    }
  }, []);

  const refresh = useCallback(async () => {
    if (!online) {
      return;
    }
    await refreshProfiles();
  }, [online, refreshProfiles]);

  useEffect(() => {
    if (!online) {
      setProfiles([]);
      setHasLastAccountToken(false);
      return;
    }
    void refreshProfiles();
  }, [online, refreshProfiles]);

  useEffect(() => {
    if (status == null) {
      return;
    }
    const timer = window.setTimeout(() => setStatus(null), 5000);
    return () => window.clearTimeout(timer);
  }, [status]);

  // When a token is already stored but no profiles exist, surface character pickers
  // without requiring another browser login.
  useEffect(() => {
    if (!online || !hasLastAccountToken || profiles.length > 0 || characters.length > 0 || busy) {
      return;
    }
    let cancelled = false;
    void (async () => {
      try {
        const listed = await listCharacters();
        if (cancelled || !listed.ok) {
          return;
        }
        if (listed.token) {
          setPickToken(listed.token);
        }
        setCharacters(listed.characters ?? []);
        if ((listed.characters?.length ?? 0) > 0) {
          setStatus(`Pick a character (${listed.characters?.length ?? 0} found)`);
        }
      } catch (error) {
        if (!cancelled) {
          setStatus(error instanceof Error ? error.message : String(error));
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [online, hasLastAccountToken, profiles.length, characters.length, busy]);

  const connectedIds = useMemo(() => {
    const ids = new Set<string>();
    for (const party of parties) {
      for (const member of party.members) {
        if (member.connected) {
          ids.add(member.characterId);
        }
      }
    }
    return ids;
  }, [parties]);

  const extensionLiveIds = useMemo(() => {
    const ids = new Set<string>();
    for (const party of parties) {
      for (const member of party.members) {
        if (member.extensionLive) {
          ids.add(member.characterId);
        }
      }
    }
    return ids;
  }, [parties]);

  const partyOptions = useMemo(
    () =>
      parties.map((party, index) => ({
        partyKey: party.partyKey,
        label: partyLabel(party, index),
        tabs: party.members.map((member): HelperPartyTab => {
          if (member.extensionLive && !member.connected) {
            return {
              characterId: member.characterId,
              characterName: member.name,
              transport: createHttpBotTransport(HELPER_BASE_URL, member.characterId),
              live: true,
            };
          }
          if (!member.managed || !member.connected) {
            return {
              characterId: member.characterId,
              characterName: member.name,
              transport: createHttpBotTransport(HELPER_BASE_URL, member.characterId),
              unmanaged: true,
            };
          }
          return {
            characterId: member.characterId,
            characterName: member.name,
            transport: createHttpBotTransport(HELPER_BASE_URL, member.characterId),
          };
        }),
      })),
    [parties]
  );

  useEffect(() => {
    if (partyOptions.length === 0) {
      setSelectedPartyKey(null);
      return;
    }
    if (!selectedPartyKey || !partyOptions.some((p) => p.partyKey === selectedPartyKey)) {
      setSelectedPartyKey(partyOptions[0]!.partyKey);
    }
  }, [partyOptions, selectedPartyKey]);

  const activeParty = useMemo(
    () => partyOptions.find((p) => p.partyKey === selectedPartyKey) ?? partyOptions[0] ?? null,
    [partyOptions, selectedPartyKey]
  );

  const offlineProfiles = useMemo(
    () =>
      profiles.filter(
        (p) => !connectedIds.has(p.characterId) && !extensionLiveIds.has(p.characterId)
      ),
    [profiles, connectedIds, extensionLiveIds]
  );

  const handleConnect = async (characterId: string, characterName: string) => {
    setBusy(true);
    setStatus(`Connecting ${characterName}…`);
    try {
      const result = await connectSession(characterId);
      if (!result.ok) {
        throw new Error("Connect failed");
      }
      setStatus(`Connected ${characterName}`);
      await refresh();
    } catch (error) {
      setStatus(error instanceof Error ? error.message : String(error));
    } finally {
      setBusy(false);
    }
  };

  const handleDisconnect = async (characterId: string, characterName: string) => {
    setBusy(true);
    try {
      await disconnectSession(characterId);
      setStatus(`Disconnected ${characterName}`);
      await refresh();
    } catch (error) {
      setStatus(error instanceof Error ? error.message : String(error));
    } finally {
      setBusy(false);
    }
  };

  const loadCharacterPicker = async (token?: string) => {
    const listed = await listCharacters(token);
    if (!listed.ok) {
      throw new Error(listed.error ?? "Failed to list characters");
    }
    if (listed.token) {
      setPickToken(listed.token);
    }
    setCharacters(listed.characters ?? []);
    setStatus(
      (listed.characters?.length ?? 0) > 0
        ? `Pick a character (${listed.characters?.length ?? 0} found)`
        : "No characters found on this account"
    );
  };

  const handleAddCharacter = async () => {
    setBusy(true);
    setStatus(hasLastAccountToken || pickToken ? "Loading characters…" : "Opening browser login…");
    try {
      if (pickToken || hasLastAccountToken) {
        await loadCharacterPicker(pickToken ?? undefined);
        return;
      }
      const result = await loginBrowser();
      if (!result.ok || !result.token) {
        throw new Error(result.error ?? "Login failed");
      }
      setPickToken(result.token);
      await loadCharacterPicker(result.token);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : String(error));
    } finally {
      setBusy(false);
    }
  };

  const handlePickCharacter = async (character: CharacterOption) => {
    setBusy(true);
    try {
      let token = pickToken;
      if (!token) {
        const listed = await listCharacters();
        token = listed.token ?? null;
        if (listed.token) {
          setPickToken(listed.token);
        }
      }
      if (!token) {
        setStatus("Login first");
        return;
      }
      await addProfile({
        token,
        characterId: character.id,
        characterName: character.name,
        worldId: character.worldId,
      });
      setCharacters([]);
      setPickToken(null);
      setStatus(`Added ${character.name}`);
      setManageOpen(true);
      await refresh();
    } catch (error) {
      setStatus(error instanceof Error ? error.message : String(error));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex h-full min-h-0 flex-col bg-[var(--bg-deep)] text-[var(--text-primary)]">
      <header className="flex shrink-0 flex-wrap items-center justify-between gap-3 border-b border-[var(--border-gold)] px-4 py-2.5">
        <div className="min-w-0">
          <h1 className="font-[family-name:var(--font-heading)] text-base tracking-wide">
            Stonegy Helper
          </h1>
          <p className="flex items-center gap-2 text-xs text-[var(--text-muted)]">
            <span
              className={[
                "inline-block h-1.5 w-1.5 rounded-full",
                online ? "bg-[var(--success)]" : "bg-[var(--danger)]",
              ].join(" ")}
              aria-hidden
            />
            {online ? `Online · v${version}` : "Server offline"}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {profiles.length > 0 ? (
            <button
              type="button"
              onClick={() => setManageOpen((open) => !open)}
              className={[
                "rounded border px-3 py-1.5 text-xs transition-colors",
                manageOpen
                  ? "border-[var(--border-gold-strong)] bg-[rgba(212,175,55,0.16)]"
                  : "border-[var(--border-gold)] hover:bg-[rgba(212,175,55,0.12)]",
              ].join(" ")}
            >
              Characters{offlineProfiles.length > 0 ? ` · ${offlineProfiles.length} offline` : ""}
            </button>
          ) : null}
          <button
            type="button"
            disabled={busy}
            onClick={() => void handleAddCharacter()}
            className="rounded border border-[var(--border-gold)] bg-[rgba(212,175,55,0.14)] px-3 py-1.5 text-xs hover:bg-[rgba(212,175,55,0.24)] disabled:opacity-50"
          >
            Add character
          </button>
        </div>
      </header>

      {status ? (
        <div className="shrink-0 border-b border-[var(--border-gold)] bg-[rgba(212,175,55,0.08)] px-4 py-2 text-xs">
          {status}
        </div>
      ) : null}

      {characters.length > 0 ? (
        <div className="shrink-0 border-b border-[var(--border-gold)] px-4 py-3">
          <div className="mb-2 flex items-center justify-between gap-2">
            <p className="text-xs uppercase tracking-wide text-[var(--text-muted)]">
              Choose character
            </p>
            <button
              type="button"
              className="text-xs text-[var(--text-muted)] hover:text-[var(--text-primary)]"
              onClick={() => {
                setCharacters([]);
                setPickToken(null);
              }}
            >
              Cancel
            </button>
          </div>
          <div className="flex flex-wrap gap-2">
            {characters.map((c) => (
              <button
                key={c.id}
                type="button"
                disabled={busy}
                onClick={() => void handlePickCharacter(c)}
                className="rounded bg-[rgba(212,175,55,0.15)] px-3 py-1.5 text-sm hover:bg-[rgba(212,175,55,0.28)]"
              >
                {c.name}
              </button>
            ))}
          </div>
        </div>
      ) : null}

      {manageOpen ? (
        <section className="shrink-0 border-b border-[var(--border-gold)] px-4 py-3">
          <div className="mb-2 flex items-center justify-between gap-2">
            <h2 className="text-xs font-semibold uppercase tracking-wide text-[var(--text-muted)]">
              Characters
            </h2>
            <button
              type="button"
              className="text-xs text-[var(--text-muted)] hover:text-[var(--text-primary)]"
              onClick={() => setManageOpen(false)}
            >
              Done
            </button>
          </div>
          {profiles.length === 0 ? (
            <p className="text-sm text-[var(--text-muted)]">
              {hasLastAccountToken
                ? "No characters saved yet. Use Add character to pick from the stored account."
                : "No characters saved yet. Add a character, or open the game with the extension so it can share credentials."}
            </p>
          ) : (
            <ul className="flex flex-col gap-2">
              {profiles.map((p) => {
                const connected = connectedIds.has(p.characterId);
                const extensionLive = extensionLiveIds.has(p.characterId);
                const online = connected || extensionLive;
                return (
                  <li
                    key={p.characterId}
                    className="flex flex-wrap items-center justify-between gap-2 rounded border border-[var(--border-gold)] bg-[rgba(1,4,7,0.55)] px-3 py-2 text-sm"
                  >
                    <span className="flex items-center gap-2">
                      <span
                        className={[
                          "inline-block h-1.5 w-1.5 rounded-full",
                          online ? "bg-[var(--success)]" : "bg-[var(--text-muted)]",
                        ].join(" ")}
                        aria-hidden
                      />
                      {p.characterName}
                      {extensionLive ? (
                        <span className="text-[9px] uppercase text-[var(--accent-green,#8f8)]">
                          live
                        </span>
                      ) : null}
                    </span>
                    <div className="flex items-center gap-3">
                      {connected ? (
                        <button
                          type="button"
                          disabled={busy}
                          className="text-xs text-[var(--text-muted)] hover:text-[var(--text-primary)] disabled:opacity-50"
                          onClick={() => void handleDisconnect(p.characterId, p.characterName)}
                        >
                          Disconnect
                        </button>
                      ) : extensionLive ? (
                        <span className="text-xs text-[var(--text-muted)]">Extension</span>
                      ) : (
                        <button
                          type="button"
                          disabled={busy}
                          className="text-xs text-[var(--accent-gold,#d4af37)] hover:underline disabled:opacity-50"
                          onClick={() => void handleConnect(p.characterId, p.characterName)}
                        >
                          Connect
                        </button>
                      )}
                      <button
                        type="button"
                        className="text-xs text-[var(--danger)]"
                        onClick={() => {
                          void removeProfile(p.characterId).then(refresh);
                        }}
                      >
                        Remove
                      </button>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      ) : null}

      {partyOptions.length > 1 ? (
        <div
          className="flex shrink-0 gap-1 overflow-x-auto border-b border-[var(--border-gold)] bg-[rgba(1,4,7,0.4)] px-3 py-1.5"
          role="tablist"
          aria-label="Parties"
        >
          {partyOptions.map((party) => {
            const active = party.partyKey === activeParty?.partyKey;
            return (
              <button
                key={party.partyKey}
                type="button"
                role="tab"
                aria-selected={active}
                onClick={() => setSelectedPartyKey(party.partyKey)}
                className={[
                  "shrink-0 rounded px-2.5 py-1 text-xs",
                  active
                    ? "bg-[rgba(212,175,55,0.22)] text-[var(--text-primary)]"
                    : "text-[var(--text-muted)] hover:bg-[rgba(255,255,255,0.04)]",
                ].join(" ")}
              >
                {party.label}
              </button>
            );
          })}
        </div>
      ) : null}

      <main className="flex min-h-0 flex-1 flex-col">
        {activeParty ? (
          <div className="min-h-0 flex-1 overflow-hidden">
            <HelperPartyShell tabs={activeParty.tabs} alwaysShowTabs />
          </div>
        ) : (
          <div className="flex flex-1 flex-col items-center justify-center gap-3 px-6 text-center">
            <p className="font-[family-name:var(--font-heading)] text-lg tracking-wide">
              No active session
            </p>
            <p className="max-w-md text-sm text-[var(--text-muted)]">
              {profiles.length === 0
                ? "Add a character to get started."
                : "Open Characters and connect a profile to start a session."}
            </p>
            {offlineProfiles.length > 0 ? (
              <button
                type="button"
                disabled={busy}
                onClick={() => setManageOpen(true)}
                className="rounded border border-[var(--border-gold)] px-3 py-1.5 text-xs hover:bg-[rgba(212,175,55,0.12)]"
              >
                Open characters
              </button>
            ) : profiles.length === 0 ? (
              <button
                type="button"
                disabled={busy}
                onClick={() => void handleAddCharacter()}
                className="rounded border border-[var(--border-gold)] bg-[rgba(212,175,55,0.14)] px-3 py-1.5 text-xs hover:bg-[rgba(212,175,55,0.24)] disabled:opacity-50"
              >
                Add character
              </button>
            ) : null}
          </div>
        )}
      </main>
    </div>
  );
}
