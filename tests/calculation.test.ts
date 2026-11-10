import { describe, expect, it } from "vitest";
import { calculate, type CalculationInput } from "../src/modules/estimating/calculation";
import { toCustomerCalculation } from "../src/modules/documents/customer-dto";

function fixture(): CalculationInput {
  return {
    mode: "simple", rounding: "half-up", vatRate: "10", indirectRate: "0", profitRate: "0", profitBase: "direct",
    discount: { type: "amount", value: "0" },
    lines: [{ id: "a", name: "장비", quantity: "5", salePrice: "185000", materialCost: "120000", laborCost: "20000", expenseCost: "0" }],
  };
}
describe("견적 계산", () => {
  it("PRD 8.5: 5 × 185,000원과 VAT", () => {
    expect(calculate(fixture())).toMatchObject({ supply: "925000", vat: "92500", total: "1017500" });
  });
  it("PRD 8.5: 공급가액 100만원의 10% 할인", () => {
    const input = fixture(); input.lines[0].quantity = "1"; input.lines[0].salePrice = "1000000";
    input.discount = { type: "percent", value: "10" };
    expect(calculate(input)).toMatchObject({ supply: "900000", vat: "90000", total: "990000" });
  });
  it.each([ ["half-up", "1"], ["down", "0"], ["up", "1"] ] as const)("0.5원의 %s 처리", (rounding, amount) => {
    const input = fixture(); input.rounding = rounding; input.lines[0].quantity = "0.1"; input.lines[0].salePrice = "5";
    expect(calculate(input).supply).toBe(amount);
  });
  it("0.1 × 0.2를 이진 부동소수점 없이 처리", () => {
    const input = fixture(); input.lines[0].quantity = "0.1"; input.lines[0].salePrice = "0.2";
    expect(calculate(input).supply).toBe("0");
  });
  it("상세 원가와 간접비 포함 이윤 기준", () => {
    const input = fixture(); input.mode = "detailed"; input.indirectRate = "10"; input.profitRate = "20"; input.profitBase = "direct-plus-indirect";
    expect(calculate(input)).toMatchObject({ directCost: "700000", indirect: "70000", profit: "154000", supply: "924000", totalCost: "770000", expectedProfit: "154000", total: "1016400" });
  });
  it("0원 마진율은 null", () => {
    const input = fixture(); input.lines[0].quantity = "0";
    expect(calculate(input).marginPercent).toBeNull();
  });
  it.each(["-1", "NaN", "Infinity", "1e3", "", "0.1234567"])("잘못된 숫자 %s 거부", (value) => {
    const input = fixture(); input.lines[0].quantity = value;
    expect(() => calculate(input)).toThrow();
  });
  it("공급가액 초과 할인 거부", () => {
    const input = fixture(); input.discount.value = "925001";
    expect(() => calculate(input)).toThrow("할인액");
  });
  it("100% 초과 비율 거부", () => {
    const input = fixture(); input.vatRate = "101";
    expect(() => calculate(input)).toThrow();
  });
  it("중복 행 ID와 빈 품목명 거부", () => {
    const input = fixture(); input.lines.push({ ...input.lines[0] });
    expect(() => calculate(input)).toThrow();
    input.lines = [{ ...input.lines[0], name: " " }];
    expect(() => calculate(input)).toThrow();
  });
  it("100행 계산은 순서와 입력을 보존하고 반복 결과가 동일", () => {
    const input = fixture(); input.lines = Array.from({ length: 100 }, (_, i) => ({ ...input.lines[0], id: String(i) }));
    const snapshot = JSON.stringify(input); const result = calculate(input);
    expect(result.supply).toBe("92500000"); expect(result.lines.map((v) => v.id)).toEqual(input.lines.map((v) => v.id));
    expect(calculate(input)).toEqual(result); expect(JSON.stringify(input)).toBe(snapshot);
  });
  it("안전 정수 범위를 넘는 금액도 문자열로 정확히 반환", () => {
    const input = fixture(); input.lines[0].quantity = "999999999999"; input.lines[0].salePrice = "999999999999";
    expect(calculate(input).supply).toBe("999999999998000000000001");
  });
  it("고객용 DTO는 허용 필드만 반환", () => {
    const dto = toCustomerCalculation({ ...calculate(fixture()), internalMemo: "SECRET" } as ReturnType<typeof calculate>);
    expect(Object.keys(dto).sort()).toEqual(["lines", "supply", "total", "vat"]);
    expect(Object.keys(dto.lines[0]).sort()).toEqual(["amount", "name"]);
    expect(JSON.stringify(dto)).not.toMatch(/SECRET|Cost|margin|profit|internalMemo/);
  });
});
