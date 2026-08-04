"use client";

import { createContext, useContext, type ReactNode } from "react";

export interface SessionValue {
  userId: string;
  email: string;
  displayName: string | null;
  timeZone: string;
}

const SessionContext = createContext<SessionValue | null>(null);

/**
 * The signed-in user, established once by the server layout.
 *
 * Passed down rather than re-fetched in each client component: `auth.getUser()`
 * makes a network round trip to the auth server every call, so calling it from a
 * dozen components would add a dozen requests to every page load.
 */
export function SessionProvider({
  value,
  children,
}: {
  value: SessionValue;
  children: ReactNode;
}) {
  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export function useSession(): SessionValue {
  const context = useContext(SessionContext);
  if (!context) {
    throw new Error("useSession must be used inside a SessionProvider");
  }
  return context;
}
