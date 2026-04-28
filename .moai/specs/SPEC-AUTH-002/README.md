# SPEC-AUTH-002 — 강사 공개 셀프 가입 + 운영자 승인 플로우

**무엇 (What)**: 외부 강사 후보가 `/signup` 공개 라우트에서 직접 계정을 만들고, 운영자/관리자가 `/operator/signup-requests` 큐에서 승인/거부를 결정하는 콜드 패스(cold path) 가입 플로우.

**왜 (Why)**: SPEC-AUTH-001은 강사 온보딩을 초대 전용으로 한정하여 운영자가 강사 후보를 사전에 알아야 했다. 본 SPEC은 (a) 운영자 발견 비용 없이 강사 풀을 확장하면서, (b) "외부 사용자가 자기 의지로 활성 계정을 만들 수 없다"는 SPEC-AUTH-001의 핵심 원칙(자동 활성화 금지)을 유지하기 위해 **가입은 누구나, 활성화는 운영자가**라는 2단계 게이트를 도입한다. SPEC-ADMIN-002의 `is_active` 기반 가드를 재사용하여 차단 메커니즘은 0 신규로 처리한다.

**범위 외 (Out of Scope)**: CAPTCHA, Redis, 이메일 인증, 강사 스킬/이력 입력(승인 후 `/me`로 위임), operator 셀프 가입, 가입 알림 발송, 거부 사유 입력 / 사용자 통보, 셀프 탈퇴, MFA / OAuth, 약관 본문 콘텐츠, rate-limit 관리 UI. 자세한 비목표는 `spec.md` §3 참조.

---

## 산출물

- [`spec.md`](./spec.md) — 배경 / 목표 / 비목표 / 사용자 시나리오 / EARS 요구사항(REQ-AUTH002-001~023) / 데이터 모델 / API / UI / 보안 / 회귀 영향 / 결정 사항
- [`plan.md`](./plan.md) — 7개 모듈(M1 DB, M2 Server Action, M3 공개 폼, M4 승인 큐, M5 rate-limit, M6 e2e, M7 docs sync) + 우선순위 + 위험
- [`acceptance.md`](./acceptance.md) — 14개 AC + 9개 엣지 케이스 + 품질 게이트 + 자동화 검증 명령
- [`spec-auth-001-amendment.md`](./spec-auth-001-amendment.md) — SPEC-AUTH-001 HISTORY 보강 제안 (orchestrator 검토용)

---

## 의존성

선행 (완료): SPEC-AUTH-001, SPEC-ADMIN-002, SPEC-DB-001, SPEC-ADMIN-001, SPEC-LAYOUT-001, SPEC-SEED-002

연관: SPEC-E2E-002 (rbac-cross-role.spec.ts 보강), SPEC-SEED-002 (`instructorPending` 페르소나 추가)

---

_Status: draft / Author: 철 / Created: 2026-04-28_
