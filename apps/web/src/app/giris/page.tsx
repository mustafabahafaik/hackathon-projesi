"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { useStore } from "@/lib/store";

/**
 * Sign-in. Two steps, e-mail then code — the shape Privy's e-mail login and
 * embedded wallet take in production. No key material ever reaches this UI.
 */
export default function LoginPage() {
  const router = useRouter();
  const { actions } = useStore();
  const [step, setStep] = useState<"email" | "code">("email");
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [hint, setHint] = useState("");

  function sendCode() {
    if (!email.includes("@")) {
      setHint("Geçerli bir e-posta adresi girin.");
      return;
    }
    setStep("code");
    setHint("Kod gönderildi · 10 dakika geçerli");
  }

  function verify() {
    if (code.replace(/\D/g, "").length < 4) {
      setHint("Kod en az 4 hane olmalı.");
      return;
    }
    setHint("");
    actions.login(email);
    router.push("/uygulama");
  }

  return (
    <div className="grid place-items-center px-8 py-login-y">
      <div className="card elev-md grid w-[min(430px,100%)] gap-6 p-card-2xl">
        {step === "email" ? (
          <div className="grid gap-6">
            <h1 className="m-0 font-heading text-[22px] font-medium">Hesabınıza giriş yapın</h1>
            <p className="m-0 text-[13.5px] leading-[1.65] text-neutral-300">
              Cüzdan kurmanız gerekmez. E-postanızı doğrulayınca hesabınız hazır olur.
            </p>
            <div className="field">
              <label htmlFor="lg-email">E-posta adresi</label>
              <input
                className="input"
                id="lg-email"
                type="email"
                placeholder="ad.soyad@ogrenci.edu.tr"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && sendCode()}
              />
            </div>
            <button type="button" className="btn btn-primary btn-block" onClick={sendCode}>
              Doğrulama kodu gönder
            </button>
            <div className="text-[12px] leading-[1.6] text-neutral-400">
              {hint || "Devam ederek aydınlatma metnini ve emanet koşullarını kabul etmiş olursunuz."}
            </div>
          </div>
        ) : (
          <div className="grid gap-6">
            <h1 className="m-0 font-heading text-[22px] font-medium">Kodu girin</h1>
            <p className="m-0 text-[13.5px] leading-[1.65] text-neutral-300">
              {email} adresine 6 haneli bir kod gönderdik.
            </p>
            <div className="field">
              <label htmlFor="lg-code">Doğrulama kodu</label>
              <input
                className="input"
                id="lg-code"
                inputMode="numeric"
                placeholder="••••••"
                value={code}
                onChange={(e) => setCode(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && verify()}
              />
            </div>
            <button type="button" className="btn btn-primary btn-block" onClick={verify}>
              Doğrula ve gir
            </button>
            <button
              type="button"
              className="btn btn-ghost btn-block"
              onClick={() => {
                setStep("email");
                setCode("");
                setHint("");
              }}
            >
              E-postayı değiştir
            </button>
            <div className="text-[12px] leading-[1.6] text-neutral-400">{hint}</div>
          </div>
        )}
      </div>
    </div>
  );
}
