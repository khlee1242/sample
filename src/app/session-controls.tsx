"use client";
import { useState } from "react";
import { authClient } from "./auth-client";
export function SessionControls({ name }: { name: string }) {
  const [error, setError] = useState("");
  return <div className="session-controls"><span>{name}</span><a href="/security">계정 보안</a><button className="quiet" onClick={async () => {
    try { const result = await authClient.signOut(); if (result.error) setError("로그아웃을 다시 시도하세요."); else window.location.assign("/login"); }
    catch { setError("서버에 연결하지 못했습니다."); }
  }}>로그아웃</button>{error && <span role="alert">{error}</span>}</div>;
}
