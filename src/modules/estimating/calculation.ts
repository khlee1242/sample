import Decimal from "decimal.js";
import { z } from "zod";

// 연산 컨텍스트를 분리해 다른 모듈의 전역 Decimal 설정 영향을 방지한다.
const D = Decimal.clone({ precision: 60 });
const numeric = z.string().regex(/^\d{1,12}(?:\.\d{1,6})?$/, "0 이상의 숫자를 입력하세요 (정수 12자리, 소수 6자리 이내).");
const rate = numeric.refine((v) => new D(v).lte(100), "비율은 100 이하여야 합니다.");
export const inputSchema = z.object({
  mode: z.enum(["simple", "detailed"]),
  lines: z.array(z.object({
    id: z.string().min(1).max(100), name: z.string().trim().min(1).max(200),
    quantity: numeric, salePrice: numeric,
    materialCost: numeric, laborCost: numeric, expenseCost: numeric,
  })).min(1).max(1000).refine((lines) => new Set(lines.map((line) => line.id)).size === lines.length, "행 ID가 중복되었습니다."),
  rounding: z.enum(["half-up", "down", "up"]),
  vatRate: rate,
  indirectRate: rate,
  profitRate: rate,
  profitBase: z.enum(["direct", "direct-plus-indirect"]),
  discount: z.discriminatedUnion("type", [
    z.object({ type: z.literal("amount"), value: numeric }),
    z.object({ type: z.literal("percent"), value: rate }),
  ]),
});
export type CalculationInput = z.infer<typeof inputSchema>;
export type CalculationResult = ReturnType<typeof calculate>;

/** 초기 지원 정책: 행 원 단위 처리, 단일 과세, 추가비용·목표금액은 미지원. */
export function calculate(raw: unknown) {
  const input = inputSchema.parse(raw);
  const rounding = { "half-up": D.ROUND_HALF_UP, down: D.ROUND_DOWN, up: D.ROUND_UP }[input.rounding];
  const round = (n: Decimal) => n.toDecimalPlaces(0, rounding);
  const sum = (values: Decimal[]) => values.reduce((a, b) => a.plus(b), new D(0));
  const lines = input.lines.map((line) => {
    const quantity = new D(line.quantity);
    const cost = sum([line.materialCost, line.laborCost, line.expenseCost].map((v) => quantity.times(v)));
    return { id: line.id, name: line.name, cost, amount: round(input.mode === "simple" ? quantity.times(line.salePrice) : cost) };
  });
  const directCost = round(sum(lines.map((line) => line.cost)));
  const base = sum(lines.map((line) => line.amount));
  const indirect = input.mode === "detailed" ? round(base.times(input.indirectRate).div(100)) : new D(0);
  const profitBase = input.profitBase === "direct-plus-indirect" ? base.plus(indirect) : base;
  const profit = input.mode === "detailed" ? round(profitBase.times(input.profitRate).div(100)) : new D(0);
  const beforeDiscount = base.plus(indirect).plus(profit);
  const discount = input.discount.type === "amount" ? round(new D(input.discount.value)) : round(beforeDiscount.times(input.discount.value).div(100));
  if (discount.gt(beforeDiscount)) throw new Error("할인액이 할인 전 공급가액을 초과합니다.");
  const supply = beforeDiscount.minus(discount);
  const vat = round(supply.times(input.vatRate).div(100));
  const total = supply.plus(vat);
  // 초기 정책에서는 간접비 전액을 예상 원가로 간주한다.
  const totalCost = directCost.plus(indirect);
  const expectedProfit = supply.minus(totalCost);
  return {
    policyVersion: "initial-line-krw-v1" as const,
    lines: lines.map((line) => ({ id: line.id, name: line.name, amount: line.amount.toFixed(0) })),
    directCost: directCost.toFixed(0), indirect: indirect.toFixed(0), profit: profit.toFixed(0),
    beforeDiscount: beforeDiscount.toFixed(0), discount: discount.toFixed(0),
    supply: supply.toFixed(0), vat: vat.toFixed(0), total: total.toFixed(0),
    totalCost: totalCost.toFixed(0), expectedProfit: expectedProfit.toFixed(0),
    marginPercent: supply.isZero() ? null : expectedProfit.div(supply).times(100).toFixed(2),
  };
}
