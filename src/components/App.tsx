import { useEffect, useState } from "react";
import { Navigate, Route, Routes, HashRouter } from "react-router-dom";
import {
  useLaunchParams,
  useSignal,
  miniApp,
  initData,
} from "@tma.js/sdk-react";
import { AppRoot, Placeholder, Spinner } from "@telegram-apps/telegram-ui";

import { routes } from "@/navigation/routes.tsx";
import { supabase } from "@/supabaseClient";
import { LoginScreen } from "@/components/LoginScreen";

export function App() {
  const lp = useLaunchParams();
  const isDark = useSignal(miniApp.isDark);

  // State for permission checking
  const [isChecking, setIsChecking] = useState(true);
  const [hasAccess, setHasAccess] = useState(false);

  useEffect(() => {
    checkPermission();
  }, []);

  async function checkPermission() {
    setIsChecking(true);

    // 1. Get current Supabase Session
    const {
      data: { session },
    } = await supabase.auth.getSession();

    if (!session) {
      setHasAccess(false);
      setIsChecking(false);
      return;
    }

    // 2. (Optional but Recommended) Double Check:
    // Ensure the database record for this user actually matches the current Telegram ID.
    // This prevents access if a user switches Telegram accounts but the browser cache remains.
    const currentTgId = initData.state()?.user?.id;

    if (currentTgId) {
      const { data: profile } = await supabase
        .from("profiles")
        .select("telegram_id")
        .eq("id", session.user.id)
        .single();

      // Grant access only if the DB record matches the current Telegram User
      if (profile && profile.telegram_id == currentTgId) {
        setHasAccess(true);
      } else {
        // ID mismatch or no profile found -> force re-login/re-bind
        setHasAccess(false);
      }
    } else {
      // Fallback if running outside of Telegram or initData is missing
      setHasAccess(false);
    }

    setIsChecking(false);
  }

  // === Render Logic ===

  // 1. Loading State
  if (isChecking) {
    return (
      <AppRoot appearance={isDark ? "dark" : "light"}>
        <Placeholder description="Verifying permissions...">
          <Spinner size="l" />
        </Placeholder>
      </AppRoot>
    );
  }

  return (
    <AppRoot
      appearance={isDark ? "dark" : "light"}
      platform={["macos", "ios"].includes(lp.tgWebAppPlatform) ? "ios" : "base"}
    >
      {hasAccess ? (
        // 2. Main App (Authorized)
        <HashRouter>
          <Routes>
            {routes.map((route) => (
              <Route key={route.path} {...route} />
            ))}
            <Route path="*" element={<Navigate to="/" />} />
          </Routes>
        </HashRouter>
      ) : (
        // 3. Login Screen (Unauthorized)
        <LoginScreen onLoginSuccess={() => setHasAccess(true)} />
      )}
    </AppRoot>
  );
}
