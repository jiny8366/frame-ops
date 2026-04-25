// Frame Ops Web — Supabase 서버사이드 클라이언트
// API Routes / Server Actions 전용. 클라이언트 컴포넌트에서 절대 import 금지.
// 서비스롤 키 사용 → 브라우저에 절대 노출되지 않음

import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/types/database';

// HMR-safe 싱글턴 (dev 서버에서 모듈 재평가 시 중복 클라이언트 방지)
const globalForSupabase = globalThis as unknown as {
  __frameops_supabase?: SupabaseClient<Database>;
};

let _client: SupabaseClient<Database> | null = null;

export function getDB(): SupabaseClient<Database> {
  if (globalForSupabase.__frameops_supabase) return globalForSupabase.__frameops_supabase;
  if (_client) return _client;

  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !key) {
    throw new Error(
      'SUPABASE_URL 과 SUPABASE_SERVICE_ROLE_KEY 가 .env.local에 설정되지 않았습니다.'
    );
  }

  const client = createClient<Database>(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
    db: { schema: 'public' },
  });

  if (process.env.NODE_ENV !== 'production') {
    globalForSupabase.__frameops_supabase = client;
  } else {
    _client = client;
  }

  return client;
}
