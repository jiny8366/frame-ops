export default function StoreDashboardPage() {
  return (
    <div className="space-y-6">
      <section>
        <h1 className="text-2xl font-bold">픽업가맹점 대시보드</h1>
        <p className="mt-2 text-gray-500">
          입고 예정 · 픽업 대기 · 결제 및 처리완료
        </p>
      </section>

      <section className="grid grid-cols-1 gap-4 md:grid-cols-3">
        <div className="rounded-2xl border border-gray-200 bg-white p-6">
          <p className="text-xs uppercase text-gray-400">배송 중</p>
          <p className="mt-2 text-3xl font-bold">—</p>
        </div>
        <div className="rounded-2xl border border-gray-200 bg-white p-6">
          <p className="text-xs uppercase text-gray-400">픽업 대기</p>
          <p className="mt-2 text-3xl font-bold">—</p>
        </div>
        <div className="rounded-2xl border border-gray-200 bg-white p-6">
          <p className="text-xs uppercase text-gray-400">금일 완료</p>
          <p className="mt-2 text-3xl font-bold">—</p>
        </div>
      </section>
    </div>
  );
}
