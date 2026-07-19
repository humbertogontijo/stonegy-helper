import { useEffect, useMemo, useState } from "react";
import { HELPER_BASE_URL } from "../transport/http";
import { subscribeHelperConnection } from "./connection";
import type { HelperConnectionSnapshot } from "./types";
import { partyMembersById } from "./types";

const INITIAL: HelperConnectionSnapshot = {
  online: false,
  version: null,
  parties: [],
};

/** React binding for {@link subscribeHelperConnection} — used by extension and web UI. */
export function useHelperConnection(baseUrl: string = HELPER_BASE_URL) {
  const [snapshot, setSnapshot] = useState<HelperConnectionSnapshot>(INITIAL);

  useEffect(() => subscribeHelperConnection(setSnapshot, { baseUrl }), [baseUrl]);

  const membersById = useMemo(
    () => partyMembersById(snapshot.parties),
    [snapshot.parties]
  );

  return {
    ...snapshot,
    membersById,
  };
}
