// Frame Ops — IndexedDB 유틸리티
// idb 라이브러리 사용 / frameops_db v2
// 스토어: frames, sales, sync_queue

import { openDB, type DBSchema, type IDBPDatabase } from 'idb';
import type { Product, Sale } from '@/types';

// ── DB 스키마 ─────────────────────────────────────────────────────────────────
interface FrameOpsDB extends DBSchema {
  frames: {
    key: string;
    value: Product;
    indexes: {
      by_brand: string;
      by_category: string;
      by_updated_at: string;
    };
  };
  sales: {
    key: string;
    value: Sale;
    indexes: {
      by_store: string;
      by_sold_at: string;
    };
  };
  sync_queue: {
    key: number;
    value: SyncQueueItem;
    autoIncrement: true;
  };
}

export type SyncStatus = 'pending' | 'syncing' | 'failed' | 'dead';

/**
 * sync_queue 의 table 식별자.
 *  - 'frames' → /api/products (제품 단순 CRUD, 레거시)
 *  - 'orders' → /api/orders (DEPRECATED, fo_sales 단순 insert. Phase 2 이전 호환)
 *  - 'sales'  → /api/sales/create (Phase 2 TASK 7 표준, 품목+재고 RPC 경로)
 */
export interface SyncQueueItem {
  id?: number;
  table: 'frames' | 'orders' | 'sales';
  operation: 'insert' | 'update' | 'delete';
  payload: Record<string, unknown>;
  created_at: string;
  retry_count: number;
  // 아래 3개는 Phase 1 TASK 8에서 추가된 선택 필드 — 기존 레코드와 호환
  status?: SyncStatus;
  last_error?: string;
  updated_at?: string;
}

// ── DB 열기 (싱글턴) ──────────────────────────────────────────────────────────
let _db: IDBPDatabase<FrameOpsDB> | null = null;

export async function getDB(): Promise<IDBPDatabase<FrameOpsDB>> {
  if (_db) return _db;

  _db = await openDB<FrameOpsDB>('frameops_db', 2, {
    upgrade(db, oldVersion) {
      // v1 → v2: customers, prescriptions, orders 스토어 제거
      if (oldVersion < 2) {
        for (const store of ['customers', 'prescriptions', 'orders'] as string[]) {
          if (db.objectStoreNames.contains(store as never)) {
            db.deleteObjectStore(store as never);
          }
        }
      }

      // frames 스토어
      if (!db.objectStoreNames.contains('frames')) {
        const framesStore = db.createObjectStore('frames', { keyPath: 'id' });
        framesStore.createIndex('by_brand', 'brand_id');
        framesStore.createIndex('by_category', 'category');
        framesStore.createIndex('by_updated_at', 'updated_at');
      }

      // sales 스토어
      if (!db.objectStoreNames.contains('sales')) {
        const salesStore = db.createObjectStore('sales', { keyPath: 'id' });
        salesStore.createIndex('by_store', 'store_id');
        salesStore.createIndex('by_sold_at', 'sold_at');
      }

      // sync_queue 스토어
      if (!db.objectStoreNames.contains('sync_queue')) {
        db.createObjectStore('sync_queue', {
          keyPath: 'id',
          autoIncrement: true,
        });
      }
    },
  });

  return _db;
}

// ── 범용 CRUD ─────────────────────────────────────────────────────────────────
type StoreName = 'frames' | 'sales';

/** 전체 조회 */
export async function dbGetAll<T>(store: StoreName): Promise<T[]> {
  const db = await getDB();
  return db.getAll(store) as Promise<T[]>;
}

/** 단건 조회 */
export async function dbGet<T>(store: StoreName, id: string): Promise<T | undefined> {
  const db = await getDB();
  return db.get(store, id) as Promise<T | undefined>;
}

/** 삽입 또는 업데이트 */
export async function dbPut<T>(store: StoreName, value: T): Promise<void> {
  const db = await getDB();
  await db.put(store, value as Product | Sale);
}

/** 대량 업서트 */
export async function dbPutMany<T>(store: StoreName, values: T[]): Promise<void> {
  const db = await getDB();
  const tx = db.transaction(store, 'readwrite');
  await Promise.all([
    ...values.map((v) => tx.store.put(v as Parameters<typeof tx.store.put>[0])),
    tx.done,
  ]);
}

/** 삭제 */
export async function dbDelete(store: StoreName, id: string): Promise<void> {
  const db = await getDB();
  await db.delete(store, id);
}

/** 인덱스로 조회 */
export async function dbGetByIndex<T>(
  store: StoreName,
  indexName: string,
  value: IDBKeyRange | string
): Promise<T[]> {
  const db = await getDB();
  return db.getAllFromIndex(store, indexName as never, value as never) as Promise<T[]>;
}

// ── sync_queue CRUD ───────────────────────────────────────────────────────────
export async function enqueueSync(item: Omit<SyncQueueItem, 'id'>): Promise<void> {
  const db = await getDB();
  await db.add('sync_queue', item);
}

export async function getSyncQueue(): Promise<SyncQueueItem[]> {
  const db = await getDB();
  return db.getAll('sync_queue');
}

export async function deleteSyncItem(id: number): Promise<void> {
  const db = await getDB();
  await db.delete('sync_queue', id);
}

/** sync_queue 레코드를 id 기반으로 업서트 (status 변경 시 사용) */
export async function putSyncItem(item: SyncQueueItem & { id: number }): Promise<void> {
  const db = await getDB();
  await db.put('sync_queue', item);
}

// ── 편의 함수 ─────────────────────────────────────────────────────────────────

/** 제품 검색 (style_code prefix) */
export async function searchProductsByStylePrefix(
  prefix: string
): Promise<Product[]> {
  const all = await dbGetAll<Product>('frames');
  if (!prefix) return all.slice(0, 30);
  const lower = prefix.toLowerCase();
  return all
    .filter((p) => p.style_code?.toLowerCase().startsWith(lower))
    .slice(0, 30);
}
