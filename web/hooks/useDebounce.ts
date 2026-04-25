// Frame Ops — debounce 훅
// 입력 후 일정 시간 추가 입력 없을 때만 값 갱신.
// /pos 검색에서 키마다 RPC 호출 방지용.

'use client';

import { useEffect, useState } from 'react';

export function useDebounce<T>(value: T, delayMs: number = 200): T {
  const [debounced, setDebounced] = useState(value);

  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), delayMs);
    return () => clearTimeout(t);
  }, [value, delayMs]);

  return debounced;
}
