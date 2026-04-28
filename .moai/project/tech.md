# Tech Stack: Algolink AI Agentic Platform

## 1. 기술 선택 원칙

MVP 단계의 절대 우선순위:
1. **빠른 출시** — 풀스택 단일 코드베이스
2. **운영 비용 최소화** — 매니지드 서비스 우선, 인프라 코드 최소
3. **AI 통합 용이성** — Claude API 1급 지원
4. **확장성 준비** — 사용자/데이터 10x 증가에도 코드 변경 최소

## 2. 핵심 스택

### 2.1 Frontend + Backend (단일)

| 항목 | 선택 | 버전 | 근거 |
|---|---|---|---|
| 프레임워크 | **Next.js** | 16 (App Router) | 풀스택 단일 코드, RSC, Server Actions, Vercel 1급 지원 |
| 언어 | **TypeScript** | 5.x (strict) | 타입 안전성, 도메인 모델 명시 |
| UI 라이브러리 | **React** | 19 | Next.js 16 표준 |
| 스타일 | **Tailwind CSS** | v4 | 디자인 토큰, 빠른 반복 |
| 컴포넌트 | **shadcn/ui** | latest | 복사 기반, 커스터마이징 자유, Radix 접근성 |
| 폼 | **react-hook-form + zod** | latest | 검증 + 타입 추론 |
| 데이터 페칭 | **TanStack Query** | v5 | 서버 상태 캐시, 낙관적 업데이트 |
| 차트 | **Recharts** | latest | 매출/매입 대시보드 |
| 캘린더 | **FullCalendar** | v6.1.20 | 월/주 뷰, 드래그 편집 (daygrid/timegrid/interaction/react 패키지) |
| PDF | **@react-pdf/renderer** | latest | 이력서 PDF 다운로드 (한국어 NotoSansKR 폰트 필수, public/fonts/) |
| DnD | **@dnd-kit** | core^6.3.1, sortable^10.0.0 | 드래그 앤 드롭 (Kanban 컬럼 등) |
| 날짜 | **date-fns** + **date-fns-tz** | ^4.1.0 / ^3.2.0 | 날짜 포맷·연산, Asia/Seoul 타임존 처리 |
| 날짜 피커 | **react-day-picker** | ^9.14.0 | 날짜 범위 선택 UI |
| 아이콘 | **lucide-react** | latest | shadcn 표준 |

### 2.2 Database / Auth / Storage (BaaS)

| 항목 | 선택 | 근거 |
|---|---|---|
| Database | **Supabase Postgres 16** | RLS 기반 멀티 역할 권한, pgcrypto, Realtime |
| Auth | **Supabase Auth** | 이메일/비밀번호 + OTP, 역할(JWT claim) |
| Storage | **Supabase Storage** | 이력서/사업자등록증/통장사본 파일 |
| ORM | **Drizzle ORM** | TypeScript-native, 마이그레이션 코드화, RLS와 공존 |
| Migration | **Drizzle Kit** | `drizzle-kit generate` + Supabase migration |

> 대안 고려: Prisma — Drizzle이 더 가볍고 RSC 친화적이라 채택.
> 대안 고려: Neon — Supabase Auth + Storage 통합 우위로 Supabase 채택.

### 2.3 AI Layer

| 항목 | 선택 | 근거 |
|---|---|---|
| LLM | **Anthropic Claude** | 한글 품질, 긴 컨텍스트, prompt caching |
| 모델 | `claude-sonnet-4-6` (기본), `claude-haiku-4-5` (분류/요약) | 작업별 효율 |
| SDK | **@anthropic-ai/sdk** ^0.91.1 (Node) | 공식 SDK, Prompt Caching 지원 |
| 캐싱 | **Prompt Caching** 활성 (`cache_control: {type: "ephemeral"}`) | 이력서 양식/시스템 프롬프트 캐시 |
| Fallback | OpenAI gpt-4o-mini (옵션) | API 장애 대응 (env 토글) |

### 2.4 외부 서비스 (스텁 우선, 추후 연동)

| 항목 | MVP | 추후 |
|---|---|---|
| 이메일 발송 | console.log + 인앱 알림 테이블 | Resend or AWS SES |
| 알림톡 | — | 카카오 비즈메시지 |
| 결제/세금계산서 | 데이터 기록만 | 더존/팝빌 |
| 일정 동기화 | — | Google Calendar API |

### 2.5 Infrastructure / DevOps

| 항목 | 선택 | 근거 |
|---|---|---|
| 호스팅 | **Vercel** | Next.js 표준, 자동 미리보기 배포, Edge |
| DB 호스팅 | **Supabase Cloud** | 매니지드, 무료 티어로 MVP 충분 |
| Repo | GitHub | Vercel/Supabase 연동 표준 |
| CI/CD | Vercel Preview + GitHub Actions(lint/test) | 별도 인프라 무 |
| 환경 변수 | Vercel + `.env.local` | 표준 |

### 2.6 품질 도구

| 항목 | 선택 |
|---|---|
| Lint | ESLint 9 (flat config) + `@typescript-eslint` |
| Format | Prettier 3 |
| Test (unit) | **Vitest** + `@testing-library/react` |
| Test (E2E) | **Playwright** |
| Type check | `tsc --noEmit` (CI) |
| Pre-commit | `lint-staged` + `husky` |

## 3. 디렉토리 / 모듈 의존성 원칙

```
app/          → UI(라우트, 페이지, 서버 액션)
src/lib/      → 도메인 로직(순수 함수, 단위 테스트 대상)
src/db/       → Drizzle 스키마, 쿼리
src/ai/       → Claude 프롬프트, 응답 파서
src/auth/     → Supabase 세션, 역할 가드
```

규칙:
- `app/` → `src/lib/` → `src/db/`, `src/ai/`, `src/auth/`
- `src/lib/`는 React/Next 의존 금지(순수 TS)
- 외부 API(Claude/Supabase)는 `src/ai/`, `src/db/`, `src/auth/`로만 격리

## 4. 데이터 보안

- Supabase RLS: 모든 테이블 기본 deny, 역할별 정책 명시
- 강사 민감정보(주민번호, 계좌): `pgcrypto`로 application-level 암호화
  - 암호화 패턴: `SECURITY DEFINER` RPC (`encrypt_payout_field` / `decrypt_payout_field`) 경유
  - GUC 키: `app.pii_encryption_key` — DB 설정에서 주입, 코드/환경변수 평문 저장 절대 금지
  - 마이그레이션: `supabase/migrations/20260428000010_pgcrypto_payout_rpc.sql`
- Storage 버킷: 강사 본인 + 담당자만 read 가능한 RLS
- AI 호출 시 PII 마스킹 후 전송(이름/이메일은 OK, 주민번호/계좌는 제거)

## 5. 성능 목표

| 지표 | 목표 |
|---|---|
| LCP (메인 대시보드) | < 2.5s |
| API p95 (CRUD) | < 300ms |
| 이력서 AI 파싱 | < 10s |
| 강사 추천 응답 | < 1s (DB 인덱스) |

## 6. 개발 환경 명령어 (예정)

```bash
pnpm dev                # Next.js dev server
pnpm db:generate        # Drizzle schema → SQL
pnpm db:migrate         # Supabase에 적용
pnpm test               # Vitest
pnpm test:e2e           # Playwright
pnpm lint && pnpm typecheck
```

## 7. 결정 기록 (ADR 요약)

| ID | 결정 | 대안 | 사유 |
|---|---|---|---|
| ADR-001 | Next.js App Router 풀스택 | NestJS+React 분리 | MVP 빠른 출시 |
| ADR-002 | Supabase | 자체 Postgres + NextAuth | Auth+DB+Storage 통합, RLS |
| ADR-003 | Drizzle ORM | Prisma | RSC 친화, 가벼움 |
| ADR-004 | Claude API 단일 | OpenAI 병행 | 한글 품질 + caching |
| ADR-005 | 이메일 발송 스텁 | Resend 즉시 통합 | MVP 단계 도메인/SPF 불필요 |
| ADR-006 | FullCalendar v6 | react-big-calendar | 월/주/일 뷰 동시 지원, 드래그 편집 즉시 사용 가능 |
| ADR-007 | @dnd-kit | react-beautiful-dnd | React 19 호환, accessibility API 내장 |
| ADR-008 | date-fns-tz | moment-timezone | 번들 크기, tree-shaking 지원 |

> 사용자가 다른 스택을 선호할 경우 변경 가능. 합리적 디폴트로 진행.

---

## 8. 주요 패턴 결정 (ADR 추가)

| ID | 결정 | 사유 |
|---|---|---|
| ADR-009 | PDF 한국어 렌더링: public/fonts/NotoSansKR-*.ttf 등록 필수 | @react-pdf/renderer는 시스템 폰트 접근 불가, TTF 직접 등록만 동작 |
| ADR-010 | pgcrypto RPC 패턴: SECURITY DEFINER + GUC 키 | 평문을 App 레이어가 직접 다루지 않고, DB 함수가 암호화/복호화 전담. GUC 키는 DB 설정값으로만 관리 |
| ADR-011 | KPI 모듈 분리: src/lib/recommend/kpi.ts | product.md §5 KPI를 SQL 집계 쿼리와 동일하게 순수 함수로 구현, 단위 테스트 12종으로 검증 |

---

Version: 1.2.0
Last Updated: 2026-04-28
