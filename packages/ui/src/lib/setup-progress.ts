import type { NoteSummary, PackInfo } from "@marcozvd/basics-core";

export function setupStorageKey(vault: string, flag: "dismissed" | "approved") {
  return `basics:setup:${flag}:${vault}`;
}

export function readSetupFlag(vault: string, flag: "dismissed" | "approved"): boolean {
  try {
    return localStorage.getItem(setupStorageKey(vault, flag)) === "1";
  } catch {
    return false;
  }
}

export function writeSetupFlag(vault: string, flag: "dismissed" | "approved"): void {
  try {
    localStorage.setItem(setupStorageKey(vault, flag), "1");
  } catch {
    // Restricted storage must not prevent setup or an approval from succeeding.
  }
}

/** Missing API data means unknown, never evidence that a step has been completed. */
export function setupProgress({
  vaultLoaded,
  packs,
  clients,
  notes,
  approvedBefore = false,
}: {
  vaultLoaded: boolean;
  packs?: Pick<PackInfo, "installed">[];
  clients?: { connected: boolean }[];
  notes?: Pick<NoteSummary, "source">[];
  approvedBefore?: boolean;
}): (boolean | undefined)[] {
  return [
    vaultLoaded,
    packs?.some((pack) => Boolean(pack.installed)),
    clients?.some((client) => client.connected),
    approvedBefore || notes?.some((note) => note.source.startsWith("agent:")),
  ];
}
