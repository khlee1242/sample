export type Role = "admin" | "author" | "approver" | "viewer";
export type Action = "quote:read" | "master:edit" | "quote:edit" | "quote:submit" | "quote:approve" | "cost:read" | "customer:export" | "system:manage";
// 초기 보수적 기본안. 실제 계정·정책 저장 및 API 연동은 후속 단계.
const grants: Record<Role, readonly Action[]> = {
  admin: ["quote:read", "master:edit", "quote:edit", "quote:submit", "quote:approve", "cost:read", "customer:export", "system:manage"],
  author: ["quote:read", "master:edit", "quote:edit", "quote:submit", "cost:read", "customer:export"],
  approver: ["quote:read", "quote:approve", "cost:read", "customer:export"],
  viewer: ["quote:read"],
};
export function assertPermission(role: Role, action: Action): void {
  if (!grants[role]?.includes(action)) throw new Error("권한이 없습니다.");
}
