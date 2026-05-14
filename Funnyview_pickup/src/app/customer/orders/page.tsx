export default function CustomerOrdersPage() {
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">내 주문</h1>
      <p className="text-gray-500">
        주문 상태(주문완료 · 출고 · 배송 중 · 픽업완료)를 실시간으로 확인합니다.
      </p>
      <div className="rounded-2xl border border-dashed border-gray-300 bg-white p-10 text-center text-sm text-gray-400">
        주문 목록 — 추후 구현
      </div>
    </div>
  );
}
