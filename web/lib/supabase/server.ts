// Frame Ops Web — Supabase 서버사이드 클라이언트
// API Routes / Server Actions 전용. 클라이언트 컴포넌트에서 절대 import 금지.
// 서비스롤 키 사용 → 브라우저에 절대 노출되지 않음

import { createClient } from '@supabase/supabase-js';

function createServerClient() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !key) {
    throw new Error(
      'SUPABASE_URL 과 SUPABASE_SERVICE_ROLE_KEY 가 .env.local에 설정되지 않았습니다.'
    );
  }

  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

// API Route마다 새 인스턴스 생성 (서버리스 환경 안전)
export const getDB = createServerClient;

// 싱글턴이 필요한 경우 (장시간 실행 서버)
let _client: ReturnType<typeof createServerClient> | null = null;
export function getDBSingleton() {
  if (!_client) _client = createServerClient();
  return _client;
}
