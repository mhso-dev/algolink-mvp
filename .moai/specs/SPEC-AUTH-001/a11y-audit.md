# SPEC-AUTH-001 — M12 접근성 폴리시 + 에러 UX 정적 감사

**작성일**: 2026-04-27
**대상 SPEC**: SPEC-AUTH-001 (Supabase Auth + 역할 기반 라우팅)
**검증 범위**: REQ-AUTH-A11Y-001 ~ 006, REQ-AUTH-ERROR-001 ~ 004
**감사 모드**: 정적 코드 리뷰 (axe DevTools / Lighthouse 라이브 검증은 acceptance.md 단계로 위임)

---

## 1. 요약 (Executive Summary)

5개 폼 컴포넌트 + 1개 서버 렌더 에러 뷰 + 1개 토스트 영역 + `errors.ts` 메시지 매핑을 정적 감사한 결과, **모든 핵심 a11y 게이트(REQ-AUTH-A11Y-001..006)와 한국어 에러 메시지(REQ-AUTH-ERROR-002)는 사양과 일치**한다.

- 패치 적용 파일: **2개** (set-password-form.tsx, invite-form.tsx)
- 가장 빈번했던 이슈 유형: **헬프 텍스트(`<p>`)가 `aria-describedby`로 입력에 연결되지 않음** (입력의 가이드를 보조 기술이 자동 읽어주지 못함). 에러는 모두 정상 연결되어 있었으나 **에러가 없을 때 헬프 텍스트로의 링크 누락**이 주요 갭이었음.
- `errors.ts` 한국어 문자열: **REQ-AUTH-ERROR-002의 9개 문구 모두 character-for-character 일치** — 수정 불필요.
- TypeScript: 0 error / 단위 테스트: 41 pass / ESLint(`(auth)`, `(operator)`): 0 error.

---

## 2. 폼별 감사 표

| 폼 | 파일 | 상태 | 비고 |
|---|---|---|---|
| 로그인 | `src/app/(auth)/login/login-form.tsx` | PASS | Label/htmlFor, aria-invalid, aria-describedby, role=alert + aria-live=assertive, setFocus(invalid first), 패스워드 토글 (type=button, aria-pressed, aria-label switch, icon aria-hidden) 모두 충족. |
| 비밀번호 재설정 요청 | `src/app/(auth)/forgot-password/forgot-password-form.tsx` | PASS | 성공 시 role=status + aria-live=polite live region 사용. 다시보내기 링크 focus-visible OK. |
| 비밀번호 재설정 | `src/app/(auth)/reset-password/reset-password-form.tsx` | PASS | 헬프 텍스트(`#reset-help`)가 이미 aria-describedby로 연결됨 — 모범 사례. 두 입력 모두 토글 OK. |
| 초대 비밀번호 설정 | `src/app/(auth)/accept-invite/set-password/set-password-form.tsx` | PATCHED | 헬프 텍스트에 `id="set-password-help"` 부여 + 에러가 없을 때 aria-describedby로 링크. |
| 초대 발송 (operator) | `src/app/(app)/(operator)/operator/invite/invite-form.tsx` | PATCHED | admin 권한 가드 헬프 텍스트(`#invite-role-help`)에 id 부여 + Select Trigger의 aria-describedby에 조건부 연결. |
| 초대 수락 에러 뷰 (서버) | `src/app/(auth)/accept-invite/page.tsx` | PASS | 컨테이너 `role="alert"` + 한국어 메시지 + `/login` 복귀 링크 (focus-visible:ring-2). |
| 로그인 페이지 reset 토스트 | `src/app/(auth)/login/page.tsx` | PASS | role=status + aria-live=polite + 한국어 `AUTH_MSG.passwordResetCompleted`. |
| 한국어 에러 매핑 | `src/auth/errors.ts` | PASS | 9개 문구 모두 REQ-AUTH-ERROR-002와 정확히 일치 (구두점/공백 포함). |

---

## 3. 적용된 수정 (Diff Summary)

### 3-1. `src/app/(auth)/accept-invite/set-password/set-password-form.tsx`

**Before** (line ~79, ~96-99):

```tsx
aria-describedby={errorMessage ? "set-password-error" : undefined}
...
<p className="text-xs text-[var(--color-text-subtle)]">
  12자 이상이며 ...
</p>
```

**After**:

```tsx
aria-describedby={
  errorMessage ? "set-password-error" : "set-password-help"
}
...
<p id="set-password-help" className="text-xs text-[var(--color-text-subtle)]">
  12자 이상이며 ...
</p>
```

**효과**: 비밀번호 정책 가이드를 스크린리더가 입력 진입 시 자동으로 읽어준다 (REQ-AUTH-A11Y-002 보강). reset-password-form.tsx의 모범 패턴과 일치시킴.

### 3-2. `src/app/(app)/(operator)/operator/invite/invite-form.tsx`

**Before**:

```tsx
<SelectTrigger id="invite-role" aria-label="초대할 역할 선택">
...
<p className="text-xs text-[var(--color-text-subtle)]">
  관리자 초대는 admin 권한이 필요합니다.
</p>
```

**After**:

```tsx
<SelectTrigger
  id="invite-role"
  aria-label="초대할 역할 선택"
  aria-describedby={!canInviteAdmin ? "invite-role-help" : undefined}
>
...
<p id="invite-role-help" className="text-xs text-[var(--color-text-subtle)]">
  관리자 초대는 admin 권한이 필요합니다.
</p>
```

**효과**: instructor/operator 초대 시 admin이 선택지에서 사라지는 이유를 보조 기술이 안내할 수 있게 됨.

---

## 4. 정적 검증 통과 항목 (Per Checklist)

### A. 폼 구조
- 모든 입력에 `<Label htmlFor>` 또는 `aria-labelledby` 연결: ✅
- `required` 속성 (시각 + 스크린리더): ✅ (Label primitive가 `required` prop으로 visual asterisk + aria-hidden 별표 렌더 + zod schema가 require enforcement)
- `aria-invalid` 동적 토글: ✅
- `aria-describedby` ↔ 에러 `<p id>` 연결: ✅
- 에러 `<p>`의 `role="alert"` + `aria-live="assertive"`: ✅ (제출 차단 에러에 적합)
- 성공 배너의 `role="status"` + `aria-live="polite"`: ✅ (forgot-password, invite, login reset toast)

### B. 패스워드 토글
- `type="button"`: ✅ 모든 토글
- aria-label 상태 전환 ("비밀번호 표시" / "비밀번호 숨김"): ✅
- `aria-pressed={state}`: ✅ (REQ-AUTH-A11Y-004 충족)
- 아이콘 `aria-hidden`: ✅ (Eye/EyeOff)

### C. 포커스 관리 (REQ-AUTH-A11Y-003)
- 클라이언트 검증 실패 시 첫 invalid 필드 포커스: ✅ (`useEffect`로 errors 변화 감지 후 setFocus)
- 서버 에러 시 첫 입력 필드 포커스: ✅ (login/forgot/reset/set-password/invite 모두 `setFocus(...)` 호출)

### D. 한국어 에러 메시지 (REQ-AUTH-ERROR-002)
`src/auth/errors.ts`의 상수와 SPEC §2.11 비교:

| # | SPEC | 코드 | 일치 |
|---|------|------|------|
| 1 | `이메일 또는 비밀번호가 올바르지 않습니다.` | `MSG_INVALID_CREDENTIALS` | ✅ |
| 2 | `잠시 후 다시 시도해주세요.` | `MSG_RATE_LIMIT` | ✅ |
| 3 | `세션이 만료되었습니다. 다시 로그인해주세요.` | `MSG_SESSION_EXPIRED` | ✅ |
| 4 | `초대 링크가 만료되었거나 이미 사용되었습니다. 운영자에게 재발급을 요청하세요.` | `MSG_INVITE_INVALID` | ✅ |
| 5 | `비밀번호는 12자 이상이며 대소문자/숫자/특수문자 중 3가지 이상을 포함해야 합니다.` | `MSG_PASSWORD_POLICY` | ✅ |
| 6 | `이메일을 발송했습니다. 받은편지함을 확인하세요.` | `AUTH_MSG.passwordResetEmailSent` | ✅ |
| 7 | `비밀번호가 변경되었습니다. 새 비밀번호로 로그인해주세요.` | `AUTH_MSG.passwordResetCompleted` | ✅ |
| 8 | `네트워크 연결을 확인하고 다시 시도해주세요.` | `MSG_NETWORK` | ✅ |
| 9 | `알 수 없는 오류가 발생했습니다. 잠시 후 다시 시도해주세요.` | `MSG_FALLBACK` | ✅ |

→ **수정 불필요**.

### E. 색상 대비 / 포커스 가시성 (REQ-AUTH-A11Y-005)
- Button primitive: `focus-visible:ring-2 focus-visible:ring-[var(--color-primary)] focus-visible:ring-offset-2` ✅
- Input primitive: `focus-visible:ring-2 focus-visible:ring-[var(--color-primary)] focus-visible:ring-offset-1 focus-visible:border-[var(--color-primary)]` ✅
- Input error state: `aria-[invalid=true]:border-[var(--color-state-alert)]` + 같은 색 ring ✅
- 토글 버튼: `focus-visible:ring-2 focus-visible:ring-[var(--color-primary)]` ✅
- 링크: 모두 `focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-primary)] rounded` ✅
- 명백히 잘못된 클래스(`text-white bg-white` 등) 발견되지 않음.

### F. Tab 순서
DOM 순서:
1. 로그인: email → password → toggle(absolute right inside relative wrapper) → submit → 비밀번호 잊으셨나요? 링크 — 시각/DOM 일치.
2. forgot-password: email → submit → 로그인 링크 — 일치.
3. reset-password / set-password: pw input → pw toggle → confirm input → confirm toggle → submit — 일치.
4. invite: email → role select → submit — 일치.

토글 버튼이 absolute로 입력 우측에 오버레이되지만, DOM에서 입력 직후에 위치하므로 `input → toggle → next field` 순서가 자연스러움. 시각 reading order와 DOM order 간 충돌 없음.

---

## 5. 미해결 우려사항 (Outstanding Concerns)

| # | 우려 | 영향 | 권장 후속 조치 |
|---|------|------|---------------|
| 1 | 다크 모드 색상 대비를 정적 코드만으로 검증 불가 | 잠재적 WCAG 2.1 AA 4.5:1 미달 | acceptance.md 검증 단계에서 Lighthouse Accessibility를 light/dark 모두 ≥ 95 확인 |
| 2 | axe DevTools `/login` critical 0건 게이트 (Success Criteria) | acceptance.md 미충족 시 SPEC 미완 | 사용자가 dev server 띄운 뒤 axe DevTools 또는 `@axe-core/cli` 실행 |
| 3 | 라이브 keyboard-only 시나리오 (Tab → Enter → Esc) 미실측 | REQ-AUTH-A11Y-001 라이브 검증 필요 | acceptance.md M12 시나리오에서 사용자 수기 점검 또는 Playwright로 자동화 |
| 4 | Radix Select(invite-form `role` 필드)의 키보드 내비게이션은 Radix가 보장하나, 한국어 Voice Over/NVDA에서의 발음 미실측 | 사용성 (a11y는 통과) | 라이브 검증 단계에서 스크린리더 1회 실행 권장 |
| 5 | invite-form의 Select Trigger는 `aria-label`을 사용 — `<Label htmlFor>` 직접 매핑은 아님 | REQ-AUTH-A11Y-002 자구상 위반 가능성, 그러나 Radix Select는 native input이 아니므로 aria-label이 표준 패턴 | 현 구현 유지. SPEC text의 "every input" 의도는 forms control에 적용; 본 구현은 시각 Label과 aria-label 둘 다 제공하여 중복 안전망. |

---

## 6. 라이브 검증 권장 사항 (Recommendation)

acceptance.md M12 검증 단계에서 다음을 수기 또는 자동으로 실행할 것:

1. **axe DevTools** — 5개 페이지(`/login`, `/forgot-password`, `/reset-password?token=…`, `/accept-invite/set-password`, `/operator/invite`)에 대해 critical issue **0건** 확인. (Success Criteria: §1.4)
2. **Lighthouse Accessibility** — 같은 5개 페이지에 대해 light/dark 모두 **≥ 95**. (Success Criteria: §1.4)
3. **키보드 only 워크플로우** — 마우스 없이 로그인 → 잘못된 비밀번호 입력 → 에러 announce 청취 → 비밀번호 표시 토글 (aria-pressed 변경 announce) → 비밀번호 잊으셨나요? 링크 → 재설정 메일 발송 → reset 토스트 announce. 모든 경로가 Tab + Enter만으로 도달 가능해야 함.
4. **스크린리더 spot check** — VoiceOver(macOS) 또는 NVDA(Windows)로 `/login`을 한 번 통과하여 아래를 확인:
   - "이메일, 필수, 편집" 식의 Label + required 발음
   - 잘못된 자격증명 입력 후 "이메일 또는 비밀번호가 올바르지 않습니다." 자동 announce (assertive)
   - 패스워드 토글이 "비밀번호 표시 토글 버튼, 누르지 않음"으로 발음

라이브 검증 결과는 `.moai/specs/SPEC-AUTH-001/acceptance.md`에 기록한다.

---

## 7. 산출물 / 변경 파일

```
M  src/app/(auth)/accept-invite/set-password/set-password-form.tsx   (헬프 텍스트 aria-describedby 연결)
M  src/app/(app)/(operator)/operator/invite/invite-form.tsx           (Select 헬프 텍스트 aria-describedby 연결)
A  .moai/specs/SPEC-AUTH-001/a11y-audit.md                            (본 문서)
```

검증 결과:
- `pnpm tsc --noEmit` → **0 error**
- `pnpm test:unit` → **41 pass / 0 fail**
- `pnpm exec eslint 'src/app/(auth)/' 'src/app/(app)/(operator)/operator/'` → **0 error / 0 warning**

---

_End of a11y-audit.md_
