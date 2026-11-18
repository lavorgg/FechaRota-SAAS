"use client";

import { createContext, useContext, useSyncExternalStore } from "react";

import type { DriverStore } from "@/lib/driver-app/db";
import type { SyncEngine, SyncState } from "@/lib/driver-app/sync-engine";
import type { DriverUser } from "@/lib/driver-app/types";

export type DriverAppValue = { user: DriverUser; store: DriverStore; engine: SyncEngine };

export const DriverAppContext = createContext<DriverAppValue | null>(null);

export function useDriverApp(): DriverAppValue {
  const value = useContext(DriverAppContext);
  if (!value) throw new Error("useDriverApp fora do DriverAppContext.");
  return value;
}

export function useSyncState(): SyncState {
  const { engine } = useDriverApp();
  return useSyncExternalStore(engine.subscribe, engine.getState, engine.getState);
}
