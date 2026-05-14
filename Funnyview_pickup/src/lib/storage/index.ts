import { localStorage } from './local';
import type { StorageAdapter } from './types';

/**
 * STORAGE_PROVIDER 환경변수로 선택.
 * 현재 지원: 'local' (기본).
 * 추후 's3' 어댑터 추가 예정.
 */
export function getStorage(): StorageAdapter {
  return localStorage;
}

export type { StorageAdapter, UploadResult } from './types';
