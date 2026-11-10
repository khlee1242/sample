"use client";
import { useEffect, useRef, useState } from "react";
import { QuoteCalculator } from "./quote-calculator";
import { sampleInput } from "../modules/estimating/sample";
import type { CalculationInput } from "../modules/estimating/calculation";
import type { Role } from "../modules/identity/permissions";
type References = { clients: { id: string; name: string }[]; sites: { id: string; name: string; clientId: string }[] };
type ListItem = { id: string; number: string; title: string; total: string; rowVersion: number };
async function api<T>(url: string, options?: RequestInit): Promise<T> {
  const response = await fetch(url, { ...options, headers: { "Content-Type": "application/json", ...options?.headers }, cache: "no-store" });
  const body = await response.json();
  if (!response.ok) throw new Error(body.error ?? "요청을 처리하지 못했습니다.");
  return body as T;
}
export function Workspace({ role }: { role: Role }) {
  const [input, setInput] = useState<CalculationInput>(sampleInput); const [title, setTitle] = useState("");
  const [clientId, setClientId] = useState(""); const [siteId, setSiteId] = useState("");
  const [references, setReferences] = useState<References>({ clients: [], sites: [] }); const [list, setList] = useState<ListItem[]>([]);
  const [saved, setSaved] = useState<{ id: string; number: string; rowVersion: number } | null>(null);
  const [message, setMessage] = useState(""); const [error, setError] = useState(""); const [busy, setBusy] = useState(false);
  const [newClient, setNewClient] = useState(""); const [newSite, setNewSite] = useState("");
  const request = useRef<{ serialized: string; id: string } | null>(null); const baseline = useRef("");
  const payload = JSON.stringify({ title, clientId, siteId, input }); const canEdit = role === "admin" || role === "author";
  async function refresh() { const [refs, rows] = await Promise.all([api<References>("/api/reference-data"), api<ListItem[]>("/api/quotes")]); setReferences(refs); setList(rows); }
  useEffect(() => { refresh().catch(() => setError("목록을 불러오지 못했습니다. 로그인 상태를 확인하고 새로고침하세요.")); }, []);
  useEffect(() => {
    const handler = (event: BeforeUnloadEvent) => { if (canEdit && baseline.current !== payload && (title || saved)) event.preventDefault(); };
    window.addEventListener("beforeunload", handler); return () => window.removeEventListener("beforeunload", handler);
  }, [payload, canEdit, title, saved]);
  function mayReplace() { return !(title || saved) || baseline.current === payload || window.confirm("저장하지 않은 변경이 있습니다. 변경을 버리고 이동할까요?"); }
  async function load(id: string) {
    if (!mayReplace()) return; setBusy(true); setError(""); setMessage("");
    try {
      const quote = await api<{ id: string; number: string; title: string; clientId: string; siteId: string; rowVersion: number; input?: CalculationInput; result: { total: string } }>(`/api/quotes/${id}`);
      if (!quote.input || !canEdit) { setMessage(`${quote.number} · ${quote.title} · 합계 ${BigInt(quote.result.total).toLocaleString("ko-KR")}원`); return; }
      setInput(quote.input); setTitle(quote.title); setClientId(quote.clientId); setSiteId(quote.siteId); setSaved({ id: quote.id, number: quote.number, rowVersion: quote.rowVersion }); request.current = null;
      baseline.current = JSON.stringify({ title: quote.title, clientId: quote.clientId, siteId: quote.siteId, input: quote.input }); setMessage("저장된 견적을 열었습니다.");
    } catch (e) { setError((e as Error).message); } finally { setBusy(false); }
  }
  async function save() {
    setBusy(true); setError(""); setMessage("");
    if (!request.current || request.current.serialized !== payload) request.current = { serialized: payload, id: crypto.randomUUID() };
    try {
      const result = await api<{ id: string; number: string; rowVersion: number }>(saved ? `/api/quotes/${saved.id}` : "/api/quotes", { method: saved ? "PATCH" : "POST", body: JSON.stringify({ ...JSON.parse(payload), requestId: request.current.id, ...(saved ? { expectedRowVersion: saved.rowVersion } : {}) }) });
      setSaved({ id: result.id, number: result.number, rowVersion: result.rowVersion }); baseline.current = payload; request.current = null; setMessage("서버 계산 결과로 저장했습니다.");
      try { await refresh(); } catch { setMessage("저장은 완료됐지만 목록을 갱신하지 못했습니다. 새로고침하면 확인할 수 있습니다."); }
    } catch (e) { setError((e as Error).message); } finally { setBusy(false); }
  }
  async function addReference(type: "client" | "site") {
    setBusy(true); setError("");
    try {
      const created = await api<{ id: string }>("/api/reference-data", { method: "POST", body: JSON.stringify(type === "client" ? { type, name: newClient } : { type, name: newSite, clientId }) });
      if (type === "client") { setClientId(created.id); setSiteId(""); setNewClient(""); } else { setSiteId(created.id); setNewSite(""); }
      await refresh();
    } catch (e) { setError((e as Error).message); } finally { setBusy(false); }
  }
  return <><section className="panel"><div className="section-title"><h2>저장된 견적</h2><span>최근 100건</span></div><div className="quote-list">{list.length ? list.map((q) => <button disabled={busy} className="quote-list-item" key={q.id} onClick={() => load(q.id)}><span>{q.number}<strong>{q.title}</strong></span><b>{BigInt(q.total).toLocaleString("ko-KR")}원</b></button>) : <p className="hint">저장된 견적이 없습니다.</p>}</div></section>
    {message && <p role="status" className="notice">{message}</p>}{error && <p role="alert" className="error">{error}</p>}
    {canEdit && <fieldset disabled={busy} className="editor"><section className="panel"><div className="section-title"><h2>{saved ? saved.number : "새 견적"}</h2><span>{saved ? `저장 버전 ${saved.rowVersion} · ${baseline.current === payload ? "저장 완료" : "변경됨"}` : "미저장"}</span></div><div className="fields">
      <label>공사명<input value={title} maxLength={200} onChange={(e) => setTitle(e.target.value)} /></label><label>거래처<select value={clientId} onChange={(e) => { setClientId(e.target.value); setSiteId(""); }}><option value="">선택하세요</option>{references.clients.map((v) => <option value={v.id} key={v.id}>{v.name}</option>)}</select></label><label>현장<select value={siteId} onChange={(e) => setSiteId(e.target.value)}><option value="">선택하세요</option>{references.sites.filter((v) => v.clientId === clientId).map((v) => <option value={v.id} key={v.id}>{v.name}</option>)}</select></label>
    </div><details className="quick-add"><summary>거래처·현장 등록</summary><div className="fields"><label>새 거래처 이름<input value={newClient} maxLength={200} onChange={(e) => setNewClient(e.target.value)} /></label><button disabled={!newClient.trim()} onClick={() => addReference("client")}>거래처 등록</button><label>선택한 거래처의 새 현장<input value={newSite} maxLength={200} onChange={(e) => setNewSite(e.target.value)} /></label><button disabled={!clientId || !newSite.trim()} onClick={() => addReference("site")}>현장 등록</button></div></details></section>
    <QuoteCalculator value={input} onChange={setInput} /><div className="save-bar"><span>저장하지 않은 변경은 서버에 반영되지 않습니다.</span><button className="quiet" onClick={() => { if (!mayReplace()) return; setInput(sampleInput()); setTitle(""); setClientId(""); setSiteId(""); setSaved(null); baseline.current = ""; request.current = null; setMessage(""); setError(""); }}>새 견적</button><button disabled={!title.trim() || !clientId || !siteId} onClick={save}>{busy ? "처리 중…" : "견적 저장"}</button></div></fieldset>}
  </>;
}
