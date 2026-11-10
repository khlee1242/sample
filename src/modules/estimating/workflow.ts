import { assertPermission, type Role } from "../identity/permissions";
export type RevisionState = { frozen: boolean; approval: "not-required" | "pending" | "approved" | "rejected" };
export function submitRevision(state: RevisionState, role: Role, approvalRequired: boolean): RevisionState {
  assertPermission(role, "quote:submit");
  if (state.frozen) throw new Error("제출된 버전은 새 초안으로 복사해야 합니다.");
  return { frozen: true, approval: approvalRequired ? "pending" : "not-required" };
}
export function decideApproval(state: RevisionState, role: Role, approve: boolean): RevisionState {
  assertPermission(role, "quote:approve");
  if (!state.frozen || state.approval !== "pending") throw new Error("승인 대기 버전만 처리할 수 있습니다.");
  return { frozen: true, approval: approve ? "approved" : "rejected" };
}
export function assertCustomerExport(state: RevisionState, role: Role) {
  assertPermission(role, "customer:export");
  if (!state.frozen || !["approved", "not-required"].includes(state.approval)) throw new Error("승인된 제출본만 출력할 수 있습니다.");
}
