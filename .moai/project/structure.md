# Structure: Algolink AI Agentic Platform

## 1. 디렉토리 구조 (예정)

```
algolink/
├── app/                          # Next.js App Router
│   ├── (auth)/                   # 비인증 라우트 그룹
│   │   ├── login/
│   │   └── signup/
│   ├── (instructor)/             # 강사 영역
│   │   ├── dashboard/
│   │   ├── resume/
│   │   ├── schedule/
│   │   └── settlements/
│   ├── (operator)/               # 담당자 + 관리자 영역
│   │   ├── dashboard/
│   │   ├── projects/
│   │   │   ├── new/
│   │   │   └── [id]/
│   │   ├── instructors/
│   │   │   └── [id]/
│   │   ├── clients/
│   │   ├── settlements/
│   │   └── notifications/
│   ├── (admin)/                  # 관리자 전용
│   │   ├── users/
│   │   └── analytics/
│   ├── api/                      # 라우트 핸들러 (외부 webhook 등)
│   │   └── ai/
│   │       ├── parse-resume/
│   │       └── recommend/
│   ├── layout.tsx
│   └── globals.css
│
├── src/
│   ├── lib/                      # 순수 도메인 로직 (테스트 대상)
│   │   ├── settlement/           # 정산 계산 (3.3%/8.8%/세금계산서)
│   │   ├── recommendation/       # 강사 추천 알고리즘 (점수화)
│   │   ├── notification/         # 알림 트리거 규칙
│   │   ├── validation/           # zod 스키마
│   │   └── format/               # 날짜/금액 포맷
│   │
│   ├── db/                       # Drizzle ORM
│   │   ├── schema/
│   │   │   ├── users.ts
│   │   │   ├── instructors.ts
│   │   │   ├── projects.ts
│   │   │   ├── clients.ts
│   │   │   ├── assignments.ts
│   │   │   ├── settlements.ts
│   │   │   ├── notifications.ts
│   │   │   ├── attachments.ts
│   │   │   └── index.ts
│   │   ├── queries/              # 재사용 쿼리 함수
│   │   ├── client.ts             # Drizzle 클라이언트(server only)
│   │   └── migrations/           # SQL 마이그레이션
│   │
│   ├── ai/                       # Claude API 통합
│   │   ├── client.ts             # Anthropic SDK 설정 + caching
│   │   ├── prompts/              # 시스템 프롬프트(상수)
│   │   │   ├── resume-parse.ts
│   │   │   ├── recommend-instructor.ts
│   │   │   └── summarize-feedback.ts
│   │   ├── parsers/              # 응답 → 도메인 객체
│   │   └── fallback.ts           # 에러 시 기본 동작
│   │
│   ├── auth/                     # Supabase Auth
│   │   ├── server.ts             # 서버 세션
│   │   ├── client.ts             # 클라이언트
│   │   ├── guards.ts             # 역할 가드
│   │   └── roles.ts              # role enum
│   │
│   ├── components/               # 공유 UI 컴포넌트
│   │   ├── ui/                   # shadcn 자동 생성
│   │   ├── forms/                # 도메인 폼 (ResumeForm 등)
│   │   ├── tables/               # 데이터 테이블
│   │   ├── calendar/             # FullCalendar 래퍼
│   │   └── layout/               # Nav, Sidebar
│   │
│   └── styles/
│
├── tests/
│   ├── unit/                     # Vitest (lib/)
│   ├── integration/              # DB 통합 테스트
│   └── e2e/                      # Playwright
│
├── public/
├── .moai/                        # MoAI-ADK 메타
├── .claude/                      # Claude Code 설정
│
├── drizzle.config.ts
├── next.config.ts
├── tailwind.config.ts
├── tsconfig.json
├── package.json
└── pnpm-lock.yaml
```

## 2. 모듈 의존성 규칙

```
app/  →  src/components/  →  src/lib/  →  src/db/, src/ai/, src/auth/
                              ↑
                          (순수 TS, 외부 의존 없음)
```

- `app/`: Next 라우트, Server Action만. 비즈니스 로직 금지.
- `src/lib/`: 순수 함수. React/Next/외부 API 의존 **금지**. 단위 테스트 대상.
- `src/db/`, `src/ai/`, `src/auth/`: 외부 시스템 격리 레이어.
- `src/components/`: UI 컴포넌트. `src/lib/`만 호출 가능.

## 3. 도메인 모델 개요

### 3.1 핵심 엔티티

| 엔티티 | 설명 | 주요 관계 |
|---|---|---|
| `User` | Supabase auth.users 확장 (role) | 1:1 → InstructorProfile or OperatorProfile |
| `InstructorProfile` | 강사 프로필 + 이력서 | 1:N → Education, Career, TeachingHistory, Skill |
| `OperatorProfile` | 담당자/관리자 프로필 | 1:N → Project (담당) |
| `Client` | 고객사 (사업자등록증, 담당자 정보) | 1:N → Project |
| `Project` | 교육 프로젝트(의뢰) | 1:N → Assignment, 1:1 → Settlement |
| `Assignment` | 강사 배정 (1순위/2순위/3순위) | N:1 → Project, N:1 → Instructor |
| `Settlement` | 정산 정보 (인건비/세금계산서) | 1:1 → Project, 1:1 → Instructor |
| `Schedule` | 일정 (시스템/개인) | N:1 → Instructor |
| `Skill` / `Domain` | 기술스택 / 산업도메인 마스터 | M:N ↔ Instructor, Project |
| `Satisfaction` | 만족도 평가 | N:1 → Project, N:1 → Instructor |
| `Notification` | 인앱 알림 | N:1 → User |
| `Attachment` | 파일 업로드(이력서 PDF, 사업자등록증) | N:1 → owner_id (polymorphic) |

### 3.2 상태 머신

**Project status**:
```
draft → 의뢰 → 강사매칭 → 요청 → 컨펌 → 진행 → 종료 → 정산요청 → 정산완료
                                       ↓ (거절)
                                    재매칭
```

**Settlement status**: `정산전 → 정산요청 → 정산완료 / 보류`

**Notification type**: `assignment_request`, `assignment_confirmed`, `schedule_conflict`, `task_overdue`, `low_satisfaction_warn`, `settlement_request`

## 4. RLS (Row-Level Security) 정책 개요

| 테이블 | 강사(self) | 담당자 | 관리자 |
|---|---|---|---|
| `instructor_profiles` | own R/W | all R, own_assigned R/W | all R/W |
| `projects` | assigned R | own R/W | all R/W |
| `assignments` | assigned R | own R/W | all R/W |
| `settlements` | own R | own R/W | all R/W |
| `clients` | — | all R/W | all R/W |
| `users` | own R | — | all R/W |

## 5. 코드 컨벤션

- 파일명: `kebab-case.ts`
- 컴포넌트: `PascalCase.tsx`
- 상수: `SCREAMING_SNAKE_CASE`
- 함수/변수: `camelCase`
- 도메인 enum은 `src/lib/domain/enums.ts`에 단일 소스
- DB 컬럼명: `snake_case`, Drizzle에서 camelCase 매핑

## 6. 환경 변수 (예정)

```
# Supabase
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=

# Database (Drizzle direct)
DATABASE_URL=

# Anthropic
ANTHROPIC_API_KEY=
ANTHROPIC_MODEL_DEFAULT=claude-sonnet-4-6
ANTHROPIC_MODEL_FAST=claude-haiku-4-5

# App
NEXT_PUBLIC_APP_URL=
NODE_ENV=development|production
```

## 7. 마이그레이션 / 시드 전략

- Drizzle 마이그레이션은 `src/db/migrations/`에 SQL로 commit
- 시드 데이터: `scripts/seed.ts`
  - 마스터 기술스택/도메인 목록
  - 데모 강사 5명, 고객사 3개, 프로젝트 2건

## 8. 테스트 전략

| 레이어 | 도구 | 커버리지 목표 |
|---|---|---|
| `src/lib/` | Vitest | 90% (정산 계산, 추천 알고리즘 필수) |
| `src/db/queries/` | Vitest + 테스트 DB | 핵심 쿼리 |
| `app/` (Server Action) | Playwright | Golden path 시나리오 |

## 9. 다음 단계 SPEC 분할 (제안)

| SPEC ID | 제목 | 우선순위 |
|---|---|---|
| SPEC-AUTH-001 | Supabase Auth + 역할 기반 라우팅 | P1 |
| SPEC-DB-001 | Drizzle 스키마 + 마이그레이션 + RLS | P1 |
| SPEC-INSTR-001 | 강사 이력서 CRUD + AI 파싱 | P1 |
| SPEC-PROJ-001 | 교육 프로젝트 CRUD + 상태 머신 | P1 |
| SPEC-RECO-001 | AI 강사 추천 알고리즘 | P2 |
| SPEC-SCHED-001 | 일정 관리 + 충돌 감지 | P2 |
| SPEC-SETTLE-001 | 정산 계산 + 워크플로우 | P2 |
| SPEC-NOTIF-001 | 인앱 알림 + 트리거 규칙 | P2 |
| SPEC-CLIENT-001 | 고객사 관리 | P3 |
| SPEC-ADMIN-001 | 관리자 대시보드 | P3 |

---

Version: 0.1.0
Last Updated: 2026-04-27
