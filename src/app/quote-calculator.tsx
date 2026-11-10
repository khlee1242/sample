"use client";
import { useState, type Dispatch, type SetStateAction } from "react";
import { calculate, type CalculationInput } from "../modules/estimating/calculation";
import { sampleInput } from "../modules/estimating/sample";

const money = (value: string) => BigInt(value).toLocaleString("ko-KR") + "원";
export function QuoteCalculator({ value, onChange }: { value?: CalculationInput; onChange?: Dispatch<SetStateAction<CalculationInput>> } = {}) {
  const [localInput, setLocalInput] = useState(sampleInput);
  const input = value ?? localInput;
  const setInput = onChange ?? setLocalInput;
  let result: ReturnType<typeof calculate> | undefined;
  let error = "";
  try { result = calculate(input); } catch (caught) { error = caught instanceof Error && caught.message.startsWith("할인") ? caught.message : "품목명과 숫자 입력을 확인하세요. 음수·지수 표기는 지원하지 않습니다."; }
  function updateLine(id: string, key: keyof CalculationInput["lines"][number], value: string) {
    setInput((current) => ({ ...current, lines: current.lines.map((line) => line.id === id ? { ...line, [key]: value } : line) }));
  }
  const columns = input.mode === "simple" ? ["salePrice", "materialCost", "laborCost", "expenseCost"] as const : ["materialCost", "laborCost", "expenseCost"] as const;
  const labels = { salePrice: "판매단가", materialCost: "자재원가", laborCost: "노무원가", expenseCost: "경비원가" };
  return <>
    <section className="panel"><div className="section-title"><h2>견적 조건</h2><span>KRW · 단일 과세</span></div><div className="fields">
      <label>계산 방식<select value={input.mode} onChange={(e) => setInput({ ...input, mode: e.target.value as CalculationInput["mode"] })}><option value="simple">단순 견적 · 수량 × 판매단가</option><option value="detailed">상세 원가 · 원가 + 간접비 + 이윤</option></select></label>
      <label>원 단위 처리<select value={input.rounding} onChange={(e) => setInput({ ...input, rounding: e.target.value as CalculationInput["rounding"] })}><option value="half-up">반올림</option><option value="down">버림</option><option value="up">올림</option></select></label>
      <label>VAT (%)<input inputMode="decimal" value={input.vatRate} onChange={(e) => setInput({ ...input, vatRate: e.target.value })} /></label>
      <label>할인 방식<select value={input.discount.type} onChange={(e) => setInput({ ...input, discount: { type: e.target.value as "amount" | "percent", value: "0" } })}><option value="amount">정액 (원)</option><option value="percent">정률 (%)</option></select></label>
      <label>할인 값<input inputMode="decimal" value={input.discount.value} onChange={(e) => setInput({ ...input, discount: { ...input.discount, value: e.target.value } })} /></label>
      {input.mode === "detailed" && <><label>간접비율 (%)<input inputMode="decimal" value={input.indirectRate} onChange={(e) => setInput({ ...input, indirectRate: e.target.value })} /></label><label>이윤율 (%)<input inputMode="decimal" value={input.profitRate} onChange={(e) => setInput({ ...input, profitRate: e.target.value })} /></label><label>이윤 기준<select value={input.profitBase} onChange={(e) => setInput({ ...input, profitBase: e.target.value as CalculationInput["profitBase"] })}><option value="direct">직접원가</option><option value="direct-plus-indirect">직접원가 + 간접비</option></select></label></>}
    </div><p className="hint">행 금액을 원 단위로 처리한 뒤 합산합니다. 간접비는 예상 총원가에 포함합니다.</p></section>
    <section className="panel"><div className="section-title"><h2>견적 품목 <span className="count">{input.lines.length}</span></h2><button onClick={() => setInput({ ...input, lines: [...input.lines, { id: crypto.randomUUID(), name: "새 품목", quantity: "1", salePrice: "0", materialCost: "0", laborCost: "0", expenseCost: "0" }] })}>+ 품목 추가</button></div>
      <div className="table-wrap"><table><thead><tr><th>품목명</th><th>수량</th>{columns.map((key) => <th key={key}>{labels[key]}</th>)}<th>행 공급가액</th><th>작업</th></tr></thead><tbody>{input.lines.map((line, index) => <tr key={line.id}><td><input aria-label={`${index + 1}행 품목명`} value={line.name} onChange={(e) => updateLine(line.id, "name", e.target.value)} /></td><td><input aria-label={`${index + 1}행 수량`} inputMode="decimal" value={line.quantity} onChange={(e) => updateLine(line.id, "quantity", e.target.value)} /></td>{columns.map((key) => <td key={key}><input aria-label={`${index + 1}행 ${labels[key]}`} inputMode="decimal" value={line[key]} onChange={(e) => updateLine(line.id, key, e.target.value)} /></td>)}<td className="amount">{result ? money(result.lines[index].amount) : "—"}</td><td><button className="quiet" disabled={input.lines.length === 1} aria-label={`${index + 1}행 삭제`} onClick={() => setInput({ ...input, lines: input.lines.filter((v) => v.id !== line.id) })}>삭제</button></td></tr>)}</tbody></table></div>
    </section>
    {error && <p className="error" role="alert">{error}</p>}
    <section className="summary" aria-live="polite"><div><span>예상 총원가</span><strong>{result ? money(result.totalCost) : "—"}</strong></div><div><span>예상 마진율</span><strong>{result?.marginPercent != null ? result.marginPercent + "%" : "N/A"}</strong></div><div><span>공급가액</span><strong>{result ? money(result.supply) : "—"}</strong></div><div><span>부가세</span><strong>{result ? money(result.vat) : "—"}</strong></div><div className="grand"><span>최종 견적금액</span><strong>{result ? money(result.total) : "—"}</strong></div></section>
  </>;
}
