'use client';

import { useRouter } from 'next/navigation';

export function LogoutButton() {
  const router = useRouter();
  async function onClick() {
    await fetch('/api/auth/logout', { method: 'POST' });
    router.replace('/');
    router.refresh();
  }
  return (
    <button
      onClick={onClick}
      className="text-gray-500 hover:text-gray-900"
      type="button"
    >
      로그아웃
    </button>
  );
}
