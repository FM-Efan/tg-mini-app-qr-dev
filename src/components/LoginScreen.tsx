import { useState } from "react";
import {
  Button,
  Input,
  List,
  Section,
  Placeholder,
  Spinner,
} from "@telegram-apps/telegram-ui";
import { initData } from "@tma.js/sdk-react";
import { supabase } from "@/supabaseClient";

interface LoginScreenProps {
  onLoginSuccess: () => void;
}

export function LoginScreen({ onLoginSuccess }: LoginScreenProps) {
  const [email, setEmail] = useState("");
  const [otp, setOtp] = useState("");
  const [step, setStep] = useState<"email" | "otp">("email");
  const [loading, setLoading] = useState(false);

  // 1. Send OTP
  const handleSendOtp = async () => {
    // Basic domain check on frontend
    if (!email.endsWith("@favoritemedium.com")) {
      alert("Access Denied: Only @favoritemedium.com emails are allowed.");
      return;
    }
    setLoading(true);

    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: { shouldCreateUser: true },
    });
    setLoading(false);

    if (error) {
      alert("Failed to send code: " + error.message);
    } else {
      setStep("otp");
    }
  };

  // 2. Verify OTP and Bind Telegram ID
  const handleVerify = async () => {
    setLoading(true);

    // 1. Debug: use initData module as the source of truth.
    const raw = initData.raw();
    console.log("Debug: initDataRaw =", raw);

    // === Defensive check ===
    if (!raw) {
      alert(
        "无法获取 initDataRaw：请从 Telegram 内部入口打开（Menu/Button）。",
      );
      setLoading(false);
      return;
    }

    // A. Verify OTP with Supabase
    const {
      data: { session },
      error,
    } = await supabase.auth.verifyOtp({
      email,
      token: otp,
      type: "email",
    });

    if (error || !session) {
      alert("Invalid code or session expired.");
      setLoading(false);
      return;
    }

    // B. Critical Step: Call Edge Function to bind Telegram ID
    // We send init data raw which contains the cryptographic signature from Telegram
    const { error: bindError } = await supabase.functions.invoke(
      "connect-telegram",
      {
        body: { initData: raw },
      },
    );

    setLoading(false);

    if (bindError) {
      alert("Binding failed: " + (bindError.message || "Unknown error"));
      // Optional: Sign out if binding fails to ensure data consistency
      // await supabase.auth.signOut();
    } else {
      onLoginSuccess();
    }
  };

  if (loading) {
    return (
      <Placeholder header="Processing" description="Please wait a moment...">
        <Spinner size="l" />
      </Placeholder>
    );
  }

  return (
    <List>
      <div style={{ textAlign: "center", padding: "20px" }}>
        <h3>Verification</h3>
      </div>

      <Section
        header={
          step === "email" ? "University Email" : "Enter Verification Code"
        }
      >
        {step === "email" ? (
          <>
            <Input
              header="Email"
              placeholder="name@favoritemedium.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
            <div style={{ padding: 10 }}>
              <Button size="l" stretched onClick={handleSendOtp}>
                Send Login Code
              </Button>
            </div>
          </>
        ) : (
          <>
            <Input
              header="Code"
              placeholder="123456"
              value={otp}
              onChange={(e) => setOtp(e.target.value)}
            />
            <div style={{ padding: 10 }}>
              <Button size="l" stretched onClick={handleVerify}>
                Verify & Login
              </Button>
              <Button
                mode="plain"
                size="s"
                stretched
                onClick={() => setStep("email")}
                style={{ marginTop: 8 }}
              >
                Back to Email
              </Button>
            </div>
          </>
        )}
      </Section>
    </List>
  );
}
