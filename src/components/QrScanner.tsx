import { useCallback, useMemo, useState } from "react";
import {
  initData,
  isTMA,
  openLink,
  qrScanner,
  retrieveLaunchParams,
} from "@tma.js/sdk-react";

export const QrScanner = () => {
  // Holds the latest scanned QR payload (string) or null when nothing scanned yet.
  const [qrResult, setQrResult] = useState<string | null>(null);

  // Holds a human-readable error message to show in UI.
  const [error, setError] = useState<string | null>(null);

  // On-screen logs for debugging on mobile devices (where DevTools may be inconvenient).
  const [debugLogs, setDebugLogs] = useState<string[]>([]);

  const pushLog = useCallback((message: string) => {
    const ts = new Date().toISOString();
    setDebugLogs((prev) => [`${ts} ${message}`, ...prev].slice(0, 80));
  }, []);

  const clearLogs = useCallback(() => {
    setDebugLogs([]);
  }, []);

  // Useful context to quickly verify whether you're actually running inside Telegram.
  const envSnapshot = useMemo(() => {
    const w = window as any;
    /**
     * Telegram WebApp injection shape can differ by client/platform/version.
     * Some clients expose `window.Telegram.WebApp`, while others may expose only `window.TelegramWebviewProxy`.
     * We use a broader check to avoid false negatives.
     */
    const hasTelegram =
      Boolean(w?.Telegram?.WebApp) || Boolean(w?.TelegramWebviewProxy);

    const ua = typeof navigator !== "undefined" ? navigator.userAgent : "n/a";
    const url = typeof window !== "undefined" ? window.location.href : "n/a";

    // Additional checks:
    // 1) retrieveLaunchParams(): whether launch params are available (and what platform Telegram reports).
    let launchParamsOk = false;
    let launchPlatform: string | null = null;
    let launchError: string | null = null;
    try {
      const lp = retrieveLaunchParams();
      launchParamsOk = true;
      // lp.tgWebAppPlatform is usually present in Telegram environment.
      launchPlatform = (lp as any)?.tgWebAppPlatform ?? null;
    } catch (e) {
      launchError = e instanceof Error ? `${e.name}: ${e.message}` : String(e);
    }

    // 2) initData raw presence: whether init data is available in this runtime.
    let initDataRawPresent = false;
    let initDataError: string | null = null;
    try {
      const raw = initData.raw();
      initDataRawPresent = typeof raw === "string" && raw.length > 0;
    } catch (e) {
      initDataError =
        e instanceof Error ? `${e.name}: ${e.message}` : String(e);
    }

    // 3) isTMA('complete'): SDK-provided environment completeness check.
    // Note: `isTMA` returns a Promise, so we only store "pending" here and resolve it in code.
    const isTmaComplete = "pending" as const;

    return {
      hasTelegram,
      ua,
      url,
      launchParamsOk,
      launchPlatform,
      launchError,
      initDataRawPresent,
      initDataError,
      isTmaComplete,
    };
  }, []);

  /**
   * Best-effort URL detection for common QR payloads.
   * - Accepts http/https URLs.
   * - Also treats "www.example.com" as a URL and normalizes it to "https://www.example.com".
   */
  const normalizeUrl = (value: string): string | null => {
    const raw = value.trim();
    if (!raw) return null;

    // Fast path: explicit protocol.
    if (/^https?:\/\/\S+$/i.test(raw)) {
      try {
        // Validate URL shape.
        // eslint-disable-next-line no-new
        new URL(raw);
        return raw;
      } catch {
        return null;
      }
    }

    // Common QR case: "www.example.com/..." without protocol.
    if (/^www\.\S+$/i.test(raw)) {
      const normalized = `https://${raw}`;
      try {
        // eslint-disable-next-line no-new
        new URL(normalized);
        return normalized;
      } catch {
        return null;
      }
    }

    return null;
  };

  const openScanner = useCallback(async () => {
    pushLog("Tap: Start QR Scanner");
    setError(null);

    // If capture callback is invoked but the promise never resolves (seen on some iOS clients),
    // we still want to get a visible hint in logs and UI.
    let captureResolved = false;
    const timeoutId = window.setTimeout(() => {
      if (!captureResolved) {
        pushLog(
          "Timeout: qrScanner.capture() did not resolve. Using capture() callback handling (fallback).",
        );
      }
    }, 3000);

    try {
      pushLog(`Env: hasTelegramWebApp=${String(envSnapshot.hasTelegram)}`);

      // 1) Launch params check (sync)
      pushLog(
        `LaunchParams: ok=${String(envSnapshot.launchParamsOk)} platform=${JSON.stringify(
          envSnapshot.launchPlatform,
        )} err=${JSON.stringify(envSnapshot.launchError)}`,
      );

      // 2) initData presence check (sync)
      pushLog(
        `InitData: rawPresent=${String(envSnapshot.initDataRawPresent)} err=${JSON.stringify(
          envSnapshot.initDataError,
        )}`,
      );

      // 3) isTMA('complete') check (async)
      try {
        const ok = await isTMA("complete");
        pushLog(`isTMA('complete') => ${String(ok)}`);
      } catch (e) {
        const msg = e instanceof Error ? `${e.name}: ${e.message}` : String(e);
        pushLog(`isTMA('complete') threw => ${msg}`);
      }

      pushLog("Calling qrScanner.capture(...)");

      /**
       * Opens Telegram Mini App native QR scanner and captures a single QR.
       *
       * IMPORTANT:
       * Some clients can invoke `capture(scannedQr)` but never resolve the returned promise.
       * To avoid a "no result" UX, we handle the payload immediately inside the callback (fallback),
       * then still await the promise for the normal/expected flow.
       */
      const scanned = await qrScanner.capture({
        capture(scannedQr) {
          pushLog(`capture(): received=${JSON.stringify(scannedQr)}`);

          // Only handle valid non-empty strings.
          if (typeof scannedQr !== "string" || scannedQr.trim().length === 0) {
            return false;
          }

          // Fallback: handle payload immediately instead of waiting for the promise to resolve.
          const url = normalizeUrl(scannedQr);
          pushLog(`capture(): normalizeUrl => ${JSON.stringify(url)}`);

          if (url) {
            setQrResult(null);
            pushLog(`capture(): openLink(${url})`);
            try {
              openLink(url);
              pushLog("capture(): openLink dispatched.");
            } catch (e) {
              const msg =
                e instanceof Error ? `${e.name}: ${e.message}` : String(e);
              pushLog(`capture(): openLink threw => ${msg}`);
            }
          } else {
            pushLog("capture(): showing payload in UI.");
            setQrResult(scannedQr);
          }

          // Accept (and close) immediately after we've handled the payload.
          return true;
        },
      });

      captureResolved = true;
      window.clearTimeout(timeoutId);

      pushLog(`qrScanner.capture resolved: ${JSON.stringify(scanned)}`);

      // If the promise resolved with a value, we can run the normal flow too.
      // (This is mostly redundant with the callback handling, but kept for correctness.)
      if (!scanned) {
        setError("QR scanner was closed or no QR content was captured.");
        pushLog("No payload returned (scanner closed / undefined).");
        return;
      }

      const url = normalizeUrl(scanned);
      pushLog(`normalizeUrl => ${JSON.stringify(url)}`);

      if (url) {
        setQrResult(null);
        pushLog(`Opening link via openLink(): ${url}`);
        try {
          openLink(url);
          pushLog("openLink(): dispatched.");
        } catch (e) {
          const msg =
            e instanceof Error ? `${e.name}: ${e.message}` : String(e);
          pushLog(`openLink(): threw => ${msg}`);
          throw e;
        }
        return;
      }

      pushLog("Showing scanned payload in UI.");
      setQrResult(scanned);
    } catch (e) {
      // This may happen if the environment does not support QR scanning or the client rejects the call.
      const msg =
        e instanceof Error
          ? `${e.name}: ${e.message}`
          : `Non-Error throw: ${String(e)}`;

      setError(
        "Failed to open QR scanner (unsupported environment or client limitation).",
      );
      pushLog(`Exception: ${msg}`);
      // Keep console output as well for cases when DevTools/Eruda is enabled.
      console.error(e);
    } finally {
      if (!captureResolved) {
        // If promise is still pending, keep timeout log behavior. Otherwise safely clean up.
      } else {
        window.clearTimeout(timeoutId);
      }
    }
  }, [envSnapshot.hasTelegram, pushLog]);

  return (
    <div
      style={{
        padding: "20px",
        display: "flex",
        flexDirection: "column",
        gap: "15px",
        alignItems: "center",
        width: "100%",
      }}
    >
      <h2 style={{ margin: 0 }}>Vite + TMA QR Scanner</h2>

      <button
        onClick={openScanner}
        style={{
          padding: "12px 24px",
          borderRadius: "12px",
          backgroundColor: "#0088cc", // Telegram blue
          color: "white",
          border: "none",
          fontSize: "16px",
          fontWeight: 700,
          cursor: "pointer",
        }}
      >
        Start QR Scanner
      </button>

      {/* Result section */}
      {qrResult && (
        <div
          style={{
            marginTop: "10px",
            padding: "15px",
            background: "#f0f0f0",
            borderRadius: "8px",
            width: "100%",
            wordBreak: "break-word",
          }}
        >
          <strong>Scanned result:</strong>
          <p style={{ margin: "8px 0 0 0" }}>{qrResult}</p>
        </div>
      )}

      {/* Error section */}
      {error && <div style={{ color: "red", marginTop: "10px" }}>{error}</div>}

      {/* Debug section */}
      <div
        style={{
          marginTop: "10px",
          width: "100%",
          background: "#111",
          color: "#eee",
          borderRadius: "8px",
          padding: "12px",
          boxSizing: "border-box",
        }}
      >
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            gap: "10px",
          }}
        >
          <strong>Debug logs</strong>
          <button
            onClick={clearLogs}
            style={{
              padding: "6px 10px",
              borderRadius: "8px",
              border: "1px solid #444",
              background: "#222",
              color: "#eee",
              cursor: "pointer",
              fontSize: "12px",
            }}
          >
            Clear
          </button>
        </div>

        <div style={{ marginTop: "10px", fontSize: "12px", opacity: 0.9 }}>
          <div>hasTelegramWebApp: {String(envSnapshot.hasTelegram)}</div>

          <div style={{ marginTop: "6px" }}>
            <strong>Launch params</strong>
          </div>
          <div>ok: {String(envSnapshot.launchParamsOk)}</div>
          <div>platform: {String(envSnapshot.launchPlatform ?? "")}</div>
          {envSnapshot.launchError && (
            <div style={{ wordBreak: "break-word" }}>
              error: {envSnapshot.launchError}
            </div>
          )}

          <div style={{ marginTop: "6px" }}>
            <strong>Init data</strong>
          </div>
          <div>raw present: {String(envSnapshot.initDataRawPresent)}</div>
          {envSnapshot.initDataError && (
            <div style={{ wordBreak: "break-word" }}>
              error: {envSnapshot.initDataError}
            </div>
          )}

          <div style={{ marginTop: "6px" }}>
            <strong>Runtime</strong>
          </div>
          <div style={{ wordBreak: "break-word" }}>url: {envSnapshot.url}</div>
          <div style={{ wordBreak: "break-word" }}>ua: {envSnapshot.ua}</div>
        </div>

        <pre
          style={{
            marginTop: "10px",
            whiteSpace: "pre-wrap",
            wordBreak: "break-word",
            background: "#0b0b0b",
            padding: "10px",
            borderRadius: "6px",
            maxHeight: "260px",
            overflow: "auto",
            border: "1px solid #222",
          }}
        >
          {debugLogs.length
            ? debugLogs.join("\n")
            : "No logs yet. Tap the button to start."}
        </pre>
      </div>
    </div>
  );
};
