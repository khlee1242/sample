import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { getPrincipal, HttpError } from "../server/access";
import { getAuth } from "../server/auth";
import { Workspace } from "./workspace";
import { SessionControls } from "./session-controls";
import { QuoteCalculator } from "./quote-calculator";
export const dynamic = "force-dynamic";
export default async function Home() {
  // 배포 전 DB와 인증 비밀키가 없는 환경에서도 계산 시제품은 확인할 수 있다.
  if (!process.env.DATABASE_URL && !process.env.PGLITE_DATA_DIR) {
    return <main className="preview-page"><header><div><p className="eyebrow">ESTIMATE WORKSPACE</p><h1>kedg견적관리</h1><p>견적 금액 계산 미리보기</p></div><span className="badge">미리보기</span></header>
      <div className="notice">견적 금액을 시험해 볼 수 있습니다. 입력 내용은 저장되지 않습니다. 저장 기능은 운영 DB와 인증 설정 후 사용할 수 있습니다.</div>
      <QuoteCalculator />
    </main>;
  }
  const requestHeaders = await headers();
  let actor;
  try { actor = await getPrincipal(requestHeaders); }
  catch (error) { if (error instanceof HttpError && error.status === 401) redirect("/login"); throw error; }
  const session = await getAuth().api.getSession({ headers: requestHeaders });
  return <div className="shell"><aside><div className="brand">kedg견적관리<span>정보통신공사</span></div><nav aria-label="주 메뉴"><a href="/" aria-current="page">견적 작성</a><a href="/security">계정 보안</a></nav><p className="aside-note">개발 2단계<br />견적 저장·다시 열기</p></aside>
    <main><header><div><p className="eyebrow">ESTIMATE WORKSPACE</p><h1>견적 작업 공간</h1><p>거래처와 현장을 선택하고 견적을 저장하세요.</p></div><SessionControls name={session?.user.name ?? "직원"} /></header>
      <div className="notice">현재는 초안을 수동 저장합니다. 저장 후 목록에서 다시 열 수 있습니다. 승인·고객 발송·문서 출력은 준비 중입니다.</div><Workspace role={actor.role} />
    </main></div>;
}
