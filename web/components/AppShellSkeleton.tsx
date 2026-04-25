// Frame Ops — Provider 초기화 중 표시되는 미니멀 스플래시
// IDB 프리로드가 끝나 SWR 초기 데이터를 세팅할 때까지 흰 화면 대신 표시

'use client';

export function AppShellSkeleton() {
  return (
    <div className="fixed inset-0 flex items-center justify-center bg-surface-secondary">
      <div className="flex flex-col items-center gap-4">
        <div className="h-10 w-10 animate-spin rounded-full border-2 border-gray-200 border-t-brand-500" />
        <p className="text-caption1 text-gray-500">Frame Ops</p>
      </div>
    </div>
  );
}
