import Link from 'next/link';

const portals = [
  {
    href: '/customer',
    title: '고객',
    description: '콘택트렌즈를 주문하고 가까운 가맹점에서 픽업',
    accent: 'bg-brand-600',
  },
  {
    href: '/warehouse',
    title: '픽업서비스 업체',
    description: '주문 접수, 픽리스트 출력, 패킹·출고 관리',
    accent: 'bg-emerald-600',
  },
  {
    href: '/store',
    title: '픽업가맹점',
    description: '입고 확인, 고객 픽업 처리 및 결제 완료',
    accent: 'bg-amber-600',
  },
] as const;

export default function Home() {
  return (
    <main className="mx-auto flex min-h-screen max-w-5xl flex-col items-center justify-center gap-10 p-8">
      <header className="text-center">
        <h1 className="text-4xl font-bold tracking-tight">Funnyview Pickup</h1>
        <p className="mt-3 text-base text-gray-500">
          콘택트렌즈 픽업서비스 플랫폼 · 역할을 선택해주세요
        </p>
      </header>

      <section className="grid w-full grid-cols-1 gap-4 md:grid-cols-3">
        {portals.map((portal) => (
          <Link
            key={portal.href}
            href={portal.href}
            className="group flex flex-col gap-3 rounded-2xl border border-gray-200 bg-white p-6 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md"
          >
            <span
              className={`inline-flex h-2 w-12 rounded-full ${portal.accent}`}
              aria-hidden
            />
            <h2 className="text-xl font-semibold">{portal.title}</h2>
            <p className="text-sm text-gray-500">{portal.description}</p>
            <span className="mt-auto text-sm font-medium text-brand-600 group-hover:underline">
              입장하기 →
            </span>
          </Link>
        ))}
      </section>

      <footer className="text-xs text-gray-400">
        v0.1.0 · Next.js 14 · PostgreSQL · Drizzle · Redis
      </footer>
    </main>
  );
}
