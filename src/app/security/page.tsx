import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { getAuth } from "../../server/auth";
import { SecurityForm } from "./security-form";
export const dynamic = "force-dynamic";
export default async function SecurityPage() {
  const session = await getAuth().api.getSession({ headers: await headers() }); if (!session) redirect("/login");
  return <main className="security-page"><a href="/">← 견적 작업 공간</a><h1>계정 보안</h1><p>{session.user.email}</p><SecurityForm enabled={!!session.user.twoFactorEnabled} /></main>;
}
