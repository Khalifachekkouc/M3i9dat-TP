"use client";

import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { onAuthStateChanged, signOut as fbSignOut, type User } from "firebase/auth";
import { doc, onSnapshot } from "firebase/firestore";
import { auth, db } from "./firebase";
import { ROLES, type Role, type UserProfile } from "./types";

export type AuthState =
  | { status: "loading" }
  | { status: "signedOut" }
  | { status: "noRole"; user: User }
  | { status: "error"; user: User; message: string }
  | { status: "ready"; user: User; profile: UserProfile };

const AuthContext = createContext<AuthState>({ status: "loading" });

export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AuthState>({ status: "loading" });

  useEffect(() => {
    let unsubscribeProfile: (() => void) | undefined;

    const unsubscribeAuth = onAuthStateChanged(auth, (user) => {
      unsubscribeProfile?.();
      unsubscribeProfile = undefined;

      if (!user) {
        setState({ status: "signedOut" });
        return;
      }

      setState({ status: "loading" });
      // Live: a role change by the admin applies without a reload.
      unsubscribeProfile = onSnapshot(
        doc(db, "users", user.uid),
        (snap) => {
          const role = snap.get("role") as unknown;
          if (!snap.exists() || !ROLES.includes(role as Role)) {
            setState({ status: "noRole", user });
            return;
          }
          setState({ status: "ready", user, profile: snap.data() as UserProfile });
        },
        (error) => setState({ status: "error", user, message: error.message }),
      );
    });

    return () => {
      unsubscribeProfile?.();
      unsubscribeAuth();
    };
  }, []);

  return <AuthContext.Provider value={state}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthState {
  return useContext(AuthContext);
}

export const signOut = () => fbSignOut(auth);

export const HOME_BY_ROLE: Record<Role, string> = {
  admin: "/admin",
  cashier: "/cashier",
  kitchen: "/kitchen",
};
