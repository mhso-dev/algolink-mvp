# 잔여 기능 개발 계획 — 알고링크 MVP

## Context

알고링크 MVP의 기초 인프라 3개(SPEC-DB-001, SPEC-AUTH-001, SPEC-LAYOUT-001)가 main에 머지되어 코드 영역이 완료된 상태입니다. 사용자는 (1) 남은 기능이 무엇이며 (2) 전부 병렬 개발 가능한지 확인하고자 합니다. 결론적으로 **남은 7개 SPEC 중 4개는 병렬 가능, 3개는 Phase 1 이후 진행**해야 합니다.

---

## 완료 현황

| SPEC | 제목 | PR / 커밋 |
|------|------|-----------|
| SPEC-DB-001 | Database Schema (Drizzle + RLS, PG17 검증) | #7 / `1be8d21` |
| SPEC-AUTH-001 | Supabase Auth + 역할 기반 라우팅 | #5 / `683c1ff` (+#9 정합화) |
| SPEC-LAYOUT-001 | App Shell + Design Tokens + UI Primitives | #4 / `19b2f76` |

운영 잔여: SPEC-AUTH-001 라이브 acceptance(시나리오 1-7 + axe/Lighthouse), `.moai/project/db/schema.md` _TBD_ 해소.

---

## 남은 SPEC (7개) 및 의존성

### Phase 1 — 핵심 도메인 4개 (완전 병렬 가능)

기초 3개 SPEC이 모두 완료되어 아래 4개는 **상호 독립**입니다. 4개 워크트리에서 동시 진행 가능합니다.

| SPEC | 범위 | 핵심 기능 IDs | 주요 경로 |
|------|------|--------------|-----------|
| **SPEC-ME-001** | 강사 개인영역 | F-101/102/103/104 (이력서, 일정, 정산 조회, 설정) | `app/(instructor)/me/**`, `lib/db/queries/instructor/**` |
| **SPEC-PROJECT-001** | 프로젝트 관리 + AI 추천 | F-202 | `app/(manager)/projects/**`, `lib/recommend/**` |
| **SPEC-DASHBOARD-001** | 담당자 대시보드 (KPI/칸반/캘린더) | F-201 | `app/(manager)/dashboard/**`, `components/dashboard/**` |
| **SPEC-INSTRUCTOR-001** | 강사 관리 (테이블 + AI 만족도 요약) | F-203 | `app/(manager)/instructors/**` |

병렬화 안전 조건:
- DB 스키마는 SPEC-DB-001 통합 마이그레이션에 포함되어 있음 → 추가 마이그레이션 충돌 없음
- 라우트 그룹이 `(instructor)` vs `(manager)`로 분리됨 → 파일 경합 없음
- 공유 컴포넌트는 `components/ui/`(SPEC-LAYOUT-001 산출물) 재사용 → 신규 작성 금지

### Phase 2 — 보조 기능 3개 (Phase 1 산출물 위에서 진행)

| SPEC | 범위 | 의존 이유 |
|------|------|-----------|
| **SPEC-CMDK-001** | ⌘K 명령 팔레트 (F-206 일부) | Phase 1의 라우트/엔티티가 명령 대상으로 필요 |
| **SPEC-NOTIF-001** | 알림 센터 + 벨 드로어 (F-002) | DASHBOARD/PROJECT 이벤트 소스 필요 |
| **SPEC-ADMIN-001** | 관리자 페이지 (F-301/302) | `NEXT_PUBLIC_FEATURE_ADMIN=false` 게이트, MVP 종료 시점 노출 |

Phase 2 내부 3개는 서로 독립이므로 다시 병렬 가능합니다.

### MVP 제외 (별도 SPEC 필요)

F-204 고객사 관리, F-205 정산 관리, F-206 알림 트리거(스케줄러), 외부 채널 연동, 알림톡/전자계약/뉴스레터 — 모두 MVP 범위 밖.

---

## 의존성 그래프

```
[DB ✅] [LAYOUT ✅] [AUTH ✅]
            │
   ┌────────┼────────┬────────┐
   ▼        ▼        ▼        ▼
  ME    PROJECT  DASHBOARD  INSTRUCTOR    ← Phase 1 (4개 병렬)
   └────────┴────────┴────────┘
            │
   ┌────────┼────────┐
   ▼        ▼        ▼
  CMDK    NOTIF    ADMIN                  ← Phase 2 (3개 병렬)
```

**최대 동시 작업 수**: Phase 1 = 4, Phase 2 = 3.
**전부 동시 병렬 불가능**: Phase 2의 CMDK/NOTIF는 Phase 1 라우트와 이벤트 소스에 의존.

---

## 권장 진행 순서

1. **선행 마무리** (병렬 가능, 작은 작업): SPEC-AUTH-001 라이브 acceptance 검증, `.moai/project/db/schema.md` 작성
2. **Phase 1 SPEC 작성**: `/moai plan`으로 ME/PROJECT/DASHBOARD/INSTRUCTOR 4개 SPEC을 동시에 생성 (manager-spec 병렬 호출)
3. **Phase 1 구현**: 4개 워크트리(`moai worktree new SPEC-XXX-001`)에서 `/moai run` 동시 실행 — 도메인별 1명씩 4명 분담
4. **Phase 1 머지 후 Phase 2 진행**: CMDK/NOTIF/ADMIN SPEC 작성 → 3-way 병렬 구현
5. **최종 sync**: `/moai sync`로 문서/코드맵 동기화 후 MVP 릴리스

---

## 검증 방법 (이 계획서 자체에 대한 확인)

- `ls .moai/specs/` — 현재 등록된 SPEC 디렉터리 존재 여부
- `git log --oneline main` — 머지 이력 대조
- `cat .moai/project/product.md` — 기능 ID(F-101 등) 정의 일치 확인
- 사용자 합의 후 `/moai plan "SPEC-ME-001 강사 개인영역"` 등으로 Phase 1 SPEC 4개 생성 시작

## 핵심 파일 (수정 예정)

신규 SPEC 4개:
- `.moai/specs/SPEC-ME-001/spec.md`, `acceptance.md`, `plan.md`
- `.moai/specs/SPEC-PROJECT-001/...`
- `.moai/specs/SPEC-DASHBOARD-001/...`
- `.moai/specs/SPEC-INSTRUCTOR-001/...`

운영 잔여:
- `.moai/project/db/schema.md` (현재 _TBD_)
- SPEC-AUTH-001 acceptance 결과 추가
