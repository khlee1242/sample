import type { CalculationResult } from "../estimating/calculation";
// 허용 목록으로만 구성한다. 내부 객체 spread 및 직렬화 금지.
// 실제 출력 서비스는 인증·승인 검증 후 이 함수를 호출해야 한다.
export function toCustomerCalculation(result: CalculationResult) {
  return {
    lines: result.lines.map((line) => ({ name: line.name, amount: line.amount })),
    supply: result.supply, vat: result.vat, total: result.total,
  };
}
