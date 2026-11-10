"use client";
import { useState } from "react";
import { authClient } from "../auth-client";
export function LoginForm() {
  const [email, setEmail] = useState(""); const [password, setPassword] = useState(""); const [code, setCode] = useState("");
  const [secondFactor, setSecondFactor] = useState(false); const [backup, setBackup] = useState(false);
  const [error, setError] = useState(""); const [busy, setBusy] = useState(false);
  async function submit(event: React.FormEvent) {
    event.preventDefault(); setBusy(true); setError("");
    try {
      if (secondFactor) {
        const response = backup ? await authClient.twoFactor.verifyBackupCode({ code, trustDevice: false }) : await authClient.twoFactor.verifyTotp({ code, trustDevice: false });
        if (response.error) { setError("인증 코드를 확인하거나 잠시 후 다시 시도하세요."); return; }
        window.location.assign("/");
      } else {
        const response = await authClient.signIn.email({ email, password }); setPassword("");
        if (response.error) { setError("로그인 정보를 확인하거나 잠시 후 다시 시도하세요."); return; }
        if (response.data && "twoFactorRedirect" in response.data && response.data.twoFactorRedirect) setSecondFactor(true);
        else window.location.assign("/");
      }
    } catch { setError("서버에 연결하지 못했습니다."); } finally { setBusy(false); }
  }
  return <form onSubmit={submit}><fieldset disabled={busy} className="form-stack">{!secondFactor ? <><label>이메일<input type="email" autoComplete="username" required value={email} onChange={(e) => setEmail(e.target.value)} /></label><label>비밀번호<input type="password" autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} /></label></> : <><label>{backup ? "복구 코드" : "인증 앱의 6자리 코드"}<input autoComplete="one-time-code" required value={code} onChange={(e) => setCode(e.target.value)} /></label><button type="button" className="quiet" onClick={() => { setBackup(!backup); setCode(""); }}>{backup ? "인증 앱 사용" : "복구 코드 사용"}</button></>}<button type="submit">{busy ? "확인 중…" : secondFactor ? "인증하기" : "로그인"}</button></fieldset>{error && <p role="alert" className="error">{error}</p>}</form>;
}
