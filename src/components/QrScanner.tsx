import { useCallback, useState } from "react";
import { qrScanner } from "@tma.js/sdk-react";

export const QrScanner = () => {
  // Holds the latest scanned QR payload (string) or null when nothing scanned yet.
  const [qrResult, setQrResult] = useState<string | null>(null);

  // Holds a human-readable error message to show in UI.
  const [error, setError] = useState<string | null>(null);

  const openScanner = useCallback(async () => {
    setError(null);

    try {
      /**
       * Opens Telegram Mini App native QR scanner and captures a single QR.
       *
       * - `capture(scannedQr)` must return `true` when you want to accept the value and close the scanner.
       * - The returned promise may resolve with `undefined` when the user closes the scanner without scanning.
       */
      const scanned = await qrScanner.capture({
        capture(scannedQr) {
          // Accept the first non-empty QR payload.
          return typeof scannedQr === "string" && scannedQr.trim().length > 0;
        },
      });

      if (!scanned) {
        setError("QR scanner was closed or no QR content was captured.");
        return;
      }

      setQrResult(scanned);
    } catch (e) {
      // This may happen if the environment does not support QR scanning or the client rejects the call.
      setError(
        "Failed to open QR scanner (unsupported environment or client limitation).",
      );
      console.error(e);
    }
  }, []);

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
    </div>
  );
};
