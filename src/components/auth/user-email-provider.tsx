"use client";

import { createContext, useContext } from "react";

const UserEmailContext = createContext<string>("unknown");

export function UserEmailProvider({
  email,
  children,
}: {
  email: string;
  children: React.ReactNode;
}) {
  return <UserEmailContext.Provider value={email}>{children}</UserEmailContext.Provider>;
}

export function useCurrentUserEmail() {
  return useContext(UserEmailContext);
}
