"use client";

// 클라이언트 컴포넌트에서 사용하는 Supabase 브라우저 클라이언트.
// `@/utils/supabase/client`의 SDK 어댑터를 명시적인 이름으로 재노출한다.

export { createClient as createBrowserSupabase } from "@/utils/supabase/client";
