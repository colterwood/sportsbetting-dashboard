"use client";

import { useSyncExternalStore } from "react";

// The user's chosen matchup metrics (family keys), in display order. Persisted in
// localStorage so the selection AND order are stable across navigation and
// sessions — switching situation / season / possession only changes the data, it
// never touches this. Single source of truth for which metric rows show and how
// they're ordered. Read via useSyncExternalStore so SSR renders the defaults and
// hydration matches (no setState-in-effect).
const KEY = "matchup-families";

const listeners = new Set<() => void>();
function subscribe(cb: () => void) {
  listeners.add(cb);
  return () => listeners.delete(cb);
}
function readRaw(): string {
  try {
    return localStorage.getItem(KEY) ?? "";
  } catch {
    return "";
  }
}
function parseList(raw: string): string[] {
  try {
    return raw ? (JSON.parse(raw) as string[]) : [];
  } catch {
    return [];
  }
}

// The saved family list, or `fallback` (the defaults) when the user has never set
// one. An explicitly-saved list is always honored — including an empty one. The
// server snapshot is "" so SSR/first-hydration render the defaults.
export function useFamilyList(fallback: string[]): string[] {
  const raw = useSyncExternalStore(subscribe, readRaw, () => "");
  return raw ? parseList(raw) : fallback;
}

export function setFamilyList(list: string[]): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(list));
  } catch {
    /* ignore */
  }
  listeners.forEach((l) => l());
}
