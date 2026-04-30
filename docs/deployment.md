# 배포/환경 운영 가이드

## 원칙

- **로컬 개발**: `.env.local` 로컬 Supabase만 사용
- **Vercel 배포**: Vercel Environment Variables 로 클라우드 Supabase만 사용
- **배포 브랜치**: `main` 단일 브랜치

## 로컬 체크리스트

`.env.local` 은 아래 로컬 주소를 유지한다.

- `DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:54322/postgres`
- `NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321`
- `NEXT_PUBLIC_APP_URL=http://localhost:3000`

로컬 실행:

```bash
pnpm supabase:start
pnpm supabase:reset
pnpm dev
```

## 클라우드 반영

마이그레이션이 생겼을 때만 수동 반영한다.

```bash
pnpm supabase:push:cloud
```

내부적으로:

1. `supabase link --project-ref nqwbhkdqwwhqpgemahul`
2. `supabase db push --linked --include-all`

## Vercel 설정

Vercel Dashboard에서 아래를 맞춘다.

1. **Production Branch = `main`**
2. Environment Variables에 클라우드 Supabase 값 등록
   - `DATABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`
   - `SUPABASE_SERVICE_ROLE_KEY`
   - `NEXT_PUBLIC_APP_URL`
   - `PII_ENCRYPTION_KEY`

## 실제 운영 플로우

```bash
# 1) 로컬 개발 / 테스트
pnpm typecheck && pnpm lint && pnpm test:unit

# 2) DB 변경이 있으면 클라우드 반영
pnpm supabase:push:cloud

# 3) main push
git push origin main
```

이후 Vercel이 `main`을 자동 배포한다.
