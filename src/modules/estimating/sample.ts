import type { CalculationInput } from "./calculation";
export function sampleInput(): CalculationInput {
  return { mode: "simple", rounding: "half-up", vatRate: "10", indirectRate: "0", profitRate: "0", profitBase: "direct", discount: { type: "amount", value: "0" },
    lines: [{ id: "initial", name: "네트워크 장비 설치", quantity: "5", salePrice: "185000", materialCost: "120000", laborCost: "20000", expenseCost: "0" }] };
}
