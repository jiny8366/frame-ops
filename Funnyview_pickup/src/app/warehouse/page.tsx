export default function WarehouseDashboardPage() {
  return (
    <div className="space-y-6">
      <section>
        <h1 className="text-2xl font-bold">픽업서비스 업체 대시보드</h1>
        <p className="mt-2 text-gray-500">
          신규 주문 알림 · 픽리스트 출력 · 패킹 및 출고 처리
        </p>
      </section>

      <section className="grid grid-cols-1 gap-4 md:grid-cols-3">
        <div className="rounded-2xl border border-gray-200 bg-white p-6">
          <p className="text-xs uppercase text-gray-400">신규 주문</p>
          <p className="mt-2 text-3xl font-bold">—</p>
        </div>
        <div className="rounded-2xl border border-gray-200 bg-white p-6">
          <p className="text-xs uppercase text-gray-400">패킹 대기</p>
          <p className="mt-2 text-3xl font-bold">—</p>
        </div>
        <div className="rounded-2xl border border-gray-200 bg-white p-6">
          <p className="text-xs uppercase text-gray-400">금일 출고</p>
          <p className="mt-2 text-3xl font-bold">—</p>
        </div>
      </section>
    </div>
  );
}
