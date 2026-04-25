// Frame Ops Web — 사용자가 접근 가능한 매장 리스트 산출
// hq_super = 전 활성 매장. 그 외 = fo_staff_store_scopes 등록된 매장.

import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/types/database';

export interface AccessibleStore {
  id: string;
  store_code: string;
  name: string;
}

export async function listAccessibleStores(
  db: SupabaseClient<Database>,
  userId: string,
  roleCode: string
): Promise<AccessibleStore[]> {
  if (roleCode === 'hq_super') {
    const { data } = await db
      .from('fo_stores')
      .select('id, store_code, name')
      .eq('active', true)
      .order('store_code', { ascending: true });
    return data ?? [];
  }

  const { data: scopes } = await db
    .from('fo_staff_store_scopes')
    .select('store_id')
    .eq('user_id', userId);
  const ids = (scopes ?? []).map((r) => r.store_id);
  if (ids.length === 0) return [];

  const { data } = await db
    .from('fo_stores')
    .select('id, store_code, name')
    .in('id', ids)
    .eq('active', true)
    .order('store_code', { ascending: true });
  return data ?? [];
}
