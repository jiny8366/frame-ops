import Link from 'next/link';

export default function CustomerHomePage() {
  return (
    <div className="space-y-6">
      <section>
        <h1 className="text-2xl font-bold">고객 포털</h1>
        <p className="mt-2 text-gray-500">
          콘택트렌즈를 선택하고 가까운 픽업가맹점에서 받아보세요.
        </p>
      </section>

      <section className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <Link
          href="/customer/order"
          className="rounded-2xl border border-gray-200 bg-white p-6 hover:border-brand-500"
        >
          <h2 className="font-semibold">주문하기</h2>
          <p className="mt-1 text-sm text-gray-500">렌즈 선택 → 가맹점 선택 → 결제</p>
        </Link>
        <Link
          href="/customer/orders"
          className="rounded-2xl border border-gray-200 bg-white p-6 hover:border-brand-500"
        >
          <h2 className="font-semibold">내 주문 현황</h2>
          <p className="mt-1 text-sm text-gray-500">주문완료 · 배송 중 · 픽업완료</p>
        </Link>
      </section>
    </div>
  );
}
