---
type: amendment-proposal
target: SPEC-AUTH-001
proposed_by: SPEC-AUTH-002
status: pending-orchestrator-review
created: 2026-04-28
author: 철
---

# SPEC-AUTH-001 HISTORY Amendment Proposal

본 문서는 SPEC-AUTH-002 도입에 따라 SPEC-AUTH-001의 HISTORY 섹션에 추가될 항목을 제안한다. **orchestrator가 검토 후 SPEC-AUTH-001/spec.md 파일에 직접 적용한다. 본 SPEC(SPEC-AUTH-002)은 SPEC-AUTH-001을 수정하지 않는다.**

---

## 1. 변경 대상

- 파일: `.moai/specs/SPEC-AUTH-001/spec.md`
- 섹션: `## HISTORY` (현재 1개 항목 — 2026-04-27 v1.0.0)
- 변경 성격: HISTORY entry 추가 (status 필드는 변경하지 않음 — `completed` 유지)

---

## 2. 추가 제안 HISTORY entry

다음 줄을 SPEC-AUTH-001/spec.md HISTORY 섹션의 기존 v1.0.0 entry **다음 줄**(아래)에 추가:

```markdown
- **2026-04-28 (amendment, no version bump)**: SPEC-AUTH-002 도입에 따른 명시. 본 SPEC §1.2 / §3은 self-signup을 영구 제외한다고 명시했으나, 사용자(철) 결정에 따라 SPEC-AUTH-002가 두 번째 정식 강사 온보딩 채널을 제한된 형태로 도입한다. SPEC-AUTH-002의 셀프 가입은 (a) 가입 직후 `users.is_active=false` 상태로 보류, (b) operator/admin의 명시적 승인을 거쳐야 활성화, (c) SPEC-ADMIN-002의 `requireUser` 가드가 비활성 사용자를 자동 차단하는 메커니즘에 의존한다. 따라서 본 SPEC §1.2의 "초대 전용" 가정과 §3의 "Self-signup 영구 제외"는 다음과 같이 갱신된다: **자동 활성화 금지 원칙은 유지** (외부 사용자가 자기 의지로 활성 계정을 만들 수 없음). 단, 가입 신청 → 운영자 승인 → 활성화의 2단계 게이트를 거치는 셀프 가입 채널은 SPEC-AUTH-002로 정식 도입된다. 본 SPEC의 invite fast-track 코드 경로는 한 줄도 변경되지 않으며 동작 보존된다 (SPEC-AUTH-002 §REQ-AUTH002-019 보장).
```

---

## 3. 부가 정정 (선택)

다음 항목은 amendment 적용 시 함께 검토 권장:

### 3.1 §1.3 Out of Scope — Self-Signup 항목

현재 텍스트:
> **자기 가입 (Self-Signup)**: 외부 사용자가 직접 가입하는 `/signup` 페이지 미빌드. Supabase 대시보드에서도 `Disable signup` 활성화.

권장 갱신 (amendment 적용 시):
> **자기 가입 (Self-Signup)**: 본 SPEC 시점에는 미빌드. SPEC-AUTH-002에서 운영자 승인 게이트를 동반한 형태로 도입됨 (자동 활성화 금지 원칙 유지). Supabase 대시보드의 `Disable signup` 설정은 SPEC-AUTH-002에서도 유지되며, 가입은 service-role의 `auth.admin.createUser`를 통해 서버 액션 내부에서만 발생한다.

### 3.2 §3 제외 사항 표

현재 행:
| 항목 | 위임 대상 |
|------|----------|
| Self-signup `/signup` 페이지 | 정책상 영구 제외 (초대 전용) |

권장 갱신:
| 항목 | 위임 대상 |
|------|----------|
| Self-signup `/signup` 페이지 (초기 가정) | SPEC-AUTH-002로 도입됨 (운영자 승인 게이트 포함, 자동 활성화 금지 원칙 유지) |

---

## 4. 변경하지 않을 항목 (명시적 보존)

다음은 SPEC-AUTH-002 도입에도 불구하고 SPEC-AUTH-001의 변경 없이 보존되어야 한다:

- **status: completed** (v1.0.0 그대로 유지). 본 amendment는 status 전환을 트리거하지 않음.
- **§2 EARS 요구사항** 전체 (REQ-AUTH-LOGIN/SESSION/PASSWORD/INVITE/GUARD/ROLE/SHELL/SECURITY/A11Y/OBS/ERROR 11개 모듈). 단 한 줄도 수정 없음.
- **§4 영향 범위 (Affected Files)** 전체. SPEC-AUTH-001이 만든 파일은 SPEC-AUTH-002에서 수정되지 않음 (단, `src/app/(auth)/login/login-form.tsx`에 "회원가입" 링크 1줄 추가는 SPEC-AUTH-002 M3 범위로 별도 SPEC 책임).
- **§9 Implementation Notes** (sync 2026-04-27). 보존.

---

## 5. 적용 절차 (orchestrator용)

1. SPEC-AUTH-002 spec/plan/acceptance 검토 완료 후
2. 본 amendment 제안을 검토
3. 승인 시: SPEC-AUTH-001/spec.md `## HISTORY` 섹션 끝에 §2의 entry 추가
4. (선택) §3 정정 함께 적용
5. SPEC-AUTH-001 파일 자체의 `updated` 필드는 갱신할지 여부 결정 — 권장: 갱신하지 않음 (amendment는 HISTORY 표기만으로 충분, 본문은 아카이브로 보존)
6. 적용 후 본 amendment 파일은 `.moai/specs/SPEC-AUTH-002/` 내에 그대로 보존 (감사 로그성)

---

## 6. 거부 시나리오

orchestrator가 본 amendment를 거부하는 경우:
- SPEC-AUTH-001은 변경 없음
- SPEC-AUTH-002 spec.md §1.2 / §10.1의 "SPEC-AUTH-001 §1.2 amendment" 언급은 "정책 보강 미적용 — SPEC-AUTH-002만 단독 신규 정책으로 작동" 문구로 후속 amendment 가능
- 기능적 영향 없음 (코드/마이그레이션 동작은 변경되지 않음, 문서 정합성만 영향)

---

_End of SPEC-AUTH-001 amendment proposal_
