import { describe, expect, it } from "vitest";
import { assertCustomerExport, decideApproval, submitRevision, type RevisionState } from "../src/modules/estimating/workflow";
import { assertPermission } from "../src/modules/identity/permissions";
const draft: RevisionState = { frozen: false, approval: "not-required" };
describe("제출·승인·출력 경계", () => {
  it("제출은 원본 상태를 바꾸지 않고 버전을 동결", () => {
    expect(submitRevision(draft, "author", true)).toEqual({ frozen: true, approval: "pending" });
    expect(draft.frozen).toBe(false);
  });
  it("작성자는 승인 불가", () => {
    expect(() => decideApproval(submitRevision(draft, "author", true), "author", true)).toThrow("권한");
  });
  it("승인 전 출력 차단, 승인 후 허용", () => {
    const submitted = submitRevision(draft, "author", true);
    expect(() => assertCustomerExport(submitted, "author")).toThrow("승인");
    expect(() => assertCustomerExport(decideApproval(submitted, "approver", true), "author")).not.toThrow();
  });
  it("반려본도 불변, 재승인을 위해 새 초안 필요", () => {
    const rejected = decideApproval(submitRevision(draft, "author", true), "approver", false);
    expect(() => assertCustomerExport(rejected, "author")).toThrow();
    expect(() => submitRevision(rejected, "author", true)).toThrow("새 초안");
  });
  it("조회자의 제출·원가 조회 거부", () => {
    expect(() => submitRevision(draft, "viewer", false)).toThrow("권한");
    expect(() => assertPermission("viewer", "cost:read")).toThrow("권한");
  });
  it("승인 면제도 제출 전 출력 불가", () => {
    expect(() => assertCustomerExport(draft, "admin")).toThrow();
    expect(() => assertCustomerExport(submitRevision(draft, "admin", false), "admin")).not.toThrow();
  });
  it("대기 상태가 아니면 승인 불가", () => {
    expect(() => decideApproval(draft, "approver", true)).toThrow("대기");
  });
});
