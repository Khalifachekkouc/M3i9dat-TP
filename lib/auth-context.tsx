"use client";

import { useRouter } from "next/navigation";
import {
  createContext,
  Fragment,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { flushSync } from "react-dom";
import { onAuthStateChanged, signOut as fbSignOut, type User } from "firebase/auth";
import { doc, onSnapshot, type DocumentSnapshot } from "firebase/firestore";
import { auth, db } from "./firebase";
import { ROLES, type Role, type UserProfile } from "./types";

export type AuthState =
  | { status: "loading" }
  /** Logging out: the screens are unmounted before Firebase signs out. */
  | { status: "signingOut" }
  | { status: "signedOut" }
  | { status: "noRole"; user: User }
  | { status: "error"; user: User; message: string }
  | { status: "ready"; user: User; profile: UserProfile };

interface AuthValue {
  state: AuthState;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthValue>({
  state: { status: "loading" },
  logout: async () => undefined,
});

/** How long a sign-in waits for the server's copy of the role before using the cached one (offline device). */
const CACHE_FALLBACK_MS = 5000;

export function AuthProvider({ children }: { children: ReactNode }) {
  const router = useRouter();
  const [state, setState] = useState<AuthState>({ status: "loading" });
  // Bumped when an account signs out: everything below is mounted again from
  // scratch, so no state of the previous account survives. That includes the
  // pages Next.js keeps alive but hidden after you leave them (cacheComponents),
  // such as the login form left in its « Connexion… » state.
  const [generation, setGeneration] = useState(0);
  // Each auth change starts a new session; late answers from an older one are dropped.
  const session = useRef(0);
  const stopProfile = useRef<() => void>(() => undefined);
  const hadUser = useRef(false);

  const watchProfile = useCallback((user: User, id: number) => {
    const current = () => id === session.current;
    const apply = (snap: DocumentSnapshot) => {
      if (!current()) return;
      const role = snap.get("role") as unknown;
      if (!snap.exists() || !ROLES.includes(role as Role)) setState({ status: "noRole", user });
      else setState({ status: "ready", user, profile: snap.data() as UserProfile });
    };

    // The role is read fresh from the server: a cached copy (possibly another
    // account's era on this device) is only used if the server cannot answer.
    let fresh = false;
    let acceptCache = typeof navigator !== "undefined" && !navigator.onLine;
    let cached: DocumentSnapshot | null = null;
    const fallback = setTimeout(() => {
      acceptCache = true;
      if (!fresh && cached) apply(cached);
    }, CACHE_FALLBACK_MS);
    let unsubscribe: () => void = () => undefined;
    stopProfile.current = () => {
      clearTimeout(fallback);
      unsubscribe();
    };

    // A new ID token first, then the profile, live: a role change by the
    // admin applies without a reload.
    void user
      .getIdToken(true)
      .catch(() => undefined)
      .then(() => {
        if (!current()) return;
        unsubscribe = onSnapshot(
          doc(db, "users", user.uid),
          { includeMetadataChanges: true },
          (snap) => {
            if (!snap.metadata.fromCache) {
              fresh = true;
              apply(snap);
            } else if (fresh || acceptCache) apply(snap);
            else cached = snap;
          },
          (error) => {
            if (current()) setState({ status: "error", user, message: error.message });
          },
        );
      });
  }, []);

  useEffect(() => {
    // The counter itself (not a DOM node): bumping it on unmount is the point.
    const sessions = session;
    const unsubscribeAuth = onAuthStateChanged(auth, (user) => {
      const id = ++session.current;
      stopProfile.current();

      if (!user) {
        setState({ status: "signedOut" });
        // Signed out here or elsewhere (another tab, a revoked session).
        if (hadUser.current) setGeneration((g) => g + 1);
        hadUser.current = false;
        return;
      }

      hadUser.current = true;
      setState({ status: "loading" });
      watchProfile(user, id);
    });

    return () => {
      sessions.current++;
      stopProfile.current();
      unsubscribeAuth();
    };
  }, [watchProfile]);

  /**
   * In this order: unmount the screens (their onSnapshot listeners close
   * while still signed in, so none of them is refused afterwards), stop the
   * profile listener, sign out, then go to the login page. The cashier's cart
   * and pending order stay in localStorage on purpose.
   */
  const logout = useCallback(async () => {
    session.current++;
    stopProfile.current();
    flushSync(() => setState({ status: "signingOut" }));
    // Let the unmounted screens' effect cleanups run before the token goes away.
    await new Promise((resolve) => setTimeout(resolve, 0));
    try {
      await fbSignOut(auth);
    } catch (error) {
      // Still signed in: show the session again.
      const user = auth.currentUser;
      if (user) {
        const id = ++session.current;
        setState({ status: "loading" });
        watchProfile(user, id);
      }
      throw error;
    }
    router.replace("/login");
  }, [router, watchProfile]);

  const value = useMemo(() => ({ state, logout }), [state, logout]);

  return (
    <AuthContext.Provider value={value}>
      <Fragment key={generation}>{children}</Fragment>
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthState {
  return useContext(AuthContext).state;
}

/** Logs the current account out (see AuthProvider.logout). */
export function useLogout(): () => Promise<void> {
  return useContext(AuthContext).logout;
}

export const HOME_BY_ROLE: Record<Role, string> = {
  admin: "/admin",
  cashier: "/cashier",
  kitchen: "/kitchen",
};
