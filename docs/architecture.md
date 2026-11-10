# 아키텍처 및 기술 결정

상태: 첫 기반 구현. 요구사항 기준은 PRD.md다.

- 단일 Next.js App Router 애플리케이션, React, TypeScript strict 사용.
- 업무 계산은 React·DB에 의존하지 않는 순수 모듈. Decimal 컨텍스트를 별도 생성한다.
- 숫자 API/저장 경계는 문자열로 전달하며, PostgreSQL NUMERIC 저장을 다음 단계에서 구현한다.
- 검증은 Zod, 단위 테스트는 Vitest. 정확한 설치 버전은 pnpm-lock.yaml을 기준으로 한다.
- 실행 Node.js는 로컬 확인된 24.22.1. 실제 설치 버전은 docs/validation.md에 기록했다. 직접 의존성과 lockfile을 고정했다.
- ORM은 Drizzle, 인증은 Better Auth와 공식 Drizzle 어댑터를 연결했다. 그리드·문서 출력 라이브러리는 미선정이다.
- 로컬은 파일 기반 PGlite를 사용하며 운영은 pg.Pool 기반 PostgreSQL 드라이버를 준비했다. 동일 스키마·SQL 마이그레이션을 사용한다. PGlite는 단일 프로세스 개발용이고 운영용 PostgreSQL 실증은 별도다.
- 최초 기반 UI는 일반 CSS를 사용한다. PRD의 Tailwind·접근성 컴포넌트 도입은 업무 UI 확장 전에 검증한다.
- 견적·기준정보 API는 매 요청 DB 세션과 활성 membership을 확인한다. 역할은 클라이언트 입력이 아니라 DB에서 결정한다. 조회자 견적 응답에 원가 입력과 마진을 포함하지 않는다.
- 서버는 저장 시 계산을 확정하며 견적/행/감사를 한 트랜잭션에 반영한다. 조건부 row_version 갱신으로 충돌을 감지한다. 현재는 첫 차수 초안만 지원한다.

Next.js 공식 설치 문서: https://nextjs.org/docs/app/getting-started/installation
Node.js 공식 릴리스: https://nodejs.org/en/about/previous-releases

클라우드·메일 등 외부 운영 서비스는 연결하지 않았고 배포하지 않았다.

설계 근거: [Better Auth Drizzle 어댑터](https://better-auth.com/docs/adapters/drizzle), [Next.js 통합](https://better-auth.com/docs/integrations/next), [TOTP](https://better-auth.com/docs/plugins/2fa), [PGlite 파일 저장](https://pglite.dev/docs/filesystems), [Drizzle PGlite](https://orm.drizzle.team/docs/connect-pglite).
