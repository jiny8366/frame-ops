// Frame Ops Web — 클라이언트 측 세션 훅 (/api/auth/me 캐시)

import useSWR from 'swr';

export interface SessionMe {
  staff_user_id: string;
  display_name: string;
  role_code: string;
  permissions: string[];
  store_id: string;
  store_code: string;
  store_name: string;
}

interface MeResponse {
  data: SessionMe | null;
  error: string | null;
}

const fetcher = async (url: string): Promise<MeResponse> => {
  const res = await fetch(url, { credentials: 'same-origin' });
  return (await res.json()) as MeResponse;
};

export function useSession() {
  const { data, isLoading, mutate } = useSWR<MeResponse>('/api/auth/me', fetcher, {
    revalidateOnFocus: false,
    dedupingInterval: 30_000,
  });
  return {
    session: data?.data ?? null,
    isLoading,
    mutate,
  };
}
