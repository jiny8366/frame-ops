'use client';

import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { formatKRW } from '@/lib/utils/format';

interface BaseSection {
  id: string;
  kind: string;
  title: string | null;
  config: Record<string, unknown>;
  variant: string | null;
}

interface ProductGridSection extends BaseSection {
  lenses?: Array<{
    id: string;
    brand: string;
    name: string;
    price: number;
    lensType?: string;
    replacementCycle?: string;
    piecesPerBox?: number;
    imageUrl?: string | null;
  }>;
}

type Section = BaseSection | ProductGridSection;

let sessionId: string | null = null;
function getSessionId(): string {
  if (typeof window === 'undefined') return '';
  if (sessionId) return sessionId;
  const key = 'fv_session_id';
  let id = window.localStorage.getItem(key);
  if (!id) {
    id = `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
    window.localStorage.setItem(key, id);
  }
  sessionId = id;
  return id;
}

const eventQueue: Array<{
  sectionId: string;
  eventType: 'impression' | 'click' | 'conversion';
  variant?: string;
}> = [];
let flushTimer: ReturnType<typeof setTimeout> | null = null;

function enqueue(e: (typeof eventQueue)[number]) {
  eventQueue.push(e);
  if (flushTimer) return;
  flushTimer = setTimeout(flush, 1000);
}

async function flush() {
  flushTimer = null;
  if (eventQueue.length === 0) return;
  const events = eventQueue.splice(0, eventQueue.length);
  try {
    await fetch('/api/home/events', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      keepalive: true,
      body: JSON.stringify({ events, sessionId: getSessionId() }),
    });
  } catch {
    // ignore
  }
}

function useImpression(sectionId: string, variant: string | null) {
  const ref = useRef<HTMLDivElement | null>(null);
  const sent = useRef(false);

  useEffect(() => {
    const el = ref.current;
    if (!el || sent.current) return;
    const obs = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (e.isIntersecting && !sent.current) {
            sent.current = true;
            enqueue({
              sectionId,
              eventType: 'impression',
              variant: variant ?? undefined,
            });
            obs.disconnect();
          }
        }
      },
      { threshold: 0.4 },
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, [sectionId, variant]);

  return ref;
}

function reportClick(sectionId: string, variant: string | null) {
  enqueue({ sectionId, eventType: 'click', variant: variant ?? undefined });
}

export function SectionRenderer({ section }: { section: Section }) {
  switch (section.kind) {
    case 'hero':
      return <HeroSection section={section} />;
    case 'product_grid':
      return <ProductGridRender section={section as ProductGridSection} />;
    case 'category_chips':
      return <CategoryChipsRender section={section} />;
    case 'banner_strip':
      return <BannerStripRender section={section} />;
    case 'countdown':
      return <CountdownRender section={section} />;
    case 'brand_story':
      return <BrandStoryRender section={section} />;
    default:
      return null;
  }
}

function HeroSection({ section }: { section: Section }) {
  const ref = useImpression(section.id, section.variant);
  const c = section.config as {
    headline?: string;
    subline?: string;
    imageUrl?: string;
    videoUrl?: string;
    bgColor?: string;
    textColor?: string;
    ctaLabel?: string;
    ctaHref?: string;
    align?: 'left' | 'center';
  };
  const align = c.align ?? 'left';
  return (
    <section
      ref={ref}
      className="relative overflow-hidden rounded-3xl"
      style={{ backgroundColor: c.bgColor ?? '#2563eb', color: c.textColor ?? '#fff' }}
    >
      {c.imageUrl && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={c.imageUrl} alt="" className="absolute inset-0 h-full w-full object-cover opacity-70" />
      )}
      {c.videoUrl && (
        <video autoPlay muted loop playsInline className="absolute inset-0 h-full w-full object-cover opacity-80">
          <source src={c.videoUrl} />
        </video>
      )}
      <div className={`relative px-6 py-16 md:px-12 md:py-24 ${align === 'center' ? 'text-center' : ''}`}>
        <h2 className="text-3xl font-bold leading-tight md:text-5xl">{c.headline}</h2>
        {c.subline && <p className="mt-3 text-base opacity-90 md:text-lg">{c.subline}</p>}
        {c.ctaHref && c.ctaLabel && (
          <Link
            href={c.ctaHref}
            onClick={() => reportClick(section.id, section.variant)}
            className="mt-6 inline-flex items-center gap-1 rounded-full bg-white px-6 py-3 text-sm font-semibold text-gray-900 transition hover:scale-[1.02]"
          >
            {c.ctaLabel} →
          </Link>
        )}
      </div>
    </section>
  );
}

function ProductGridRender({ section }: { section: ProductGridSection }) {
  const ref = useImpression(section.id, section.variant);
  const c = section.config as { layout?: 'grid' | 'carousel'; showPrice?: boolean; cardTone?: 'minimal' | 'photo' };
  const items = section.lenses ?? [];
  return (
    <section ref={ref}>
      {section.title && <h2 className="mb-3 text-lg font-bold">{section.title}</h2>}
      <div
        className={
          c.layout === 'carousel'
            ? 'flex gap-3 overflow-x-auto pb-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden'
            : 'grid grid-cols-2 gap-3 md:grid-cols-4'
        }
      >
        {items.map((l) => (
          <Link
            key={l.id}
            href={`/customer/order?lens=${l.id}`}
            onClick={() => reportClick(section.id, section.variant)}
            className="block min-w-[160px] rounded-2xl border border-gray-200 bg-white p-3 transition hover:border-brand-300"
          >
            <div className="aspect-square overflow-hidden rounded-xl bg-gray-100">
              {l.imageUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={l.imageUrl} alt={l.name} className="h-full w-full object-cover" />
              ) : (
                <div className="flex h-full w-full items-center justify-center text-gray-300">{l.brand[0]}</div>
              )}
            </div>
            <div className="mt-2">
              <div className="text-xs text-gray-500">{l.brand}</div>
              <div className="text-sm font-medium">{l.name}</div>
              {c.showPrice && <div className="mt-1 text-sm font-bold">{formatKRW(l.price)}</div>}
            </div>
          </Link>
        ))}
        {items.length === 0 && (
          <div className="col-span-full rounded-2xl border border-dashed border-gray-300 p-8 text-center text-sm text-gray-400">
            등록된 상품이 없습니다
          </div>
        )}
      </div>
    </section>
  );
}

function CategoryChipsRender({ section }: { section: Section }) {
  const ref = useImpression(section.id, section.variant);
  const c = section.config as {
    items?: Array<{ label: string; href: string; emoji?: string; badge?: string }>;
  };
  return (
    <section ref={ref}>
      {section.title && <h2 className="mb-3 text-lg font-bold">{section.title}</h2>}
      <div className="flex flex-wrap gap-2">
        {c.items?.map((it, idx) => (
          <Link
            key={idx}
            href={it.href}
            onClick={() => reportClick(section.id, section.variant)}
            className="relative inline-flex items-center gap-1.5 rounded-full border border-gray-200 bg-white px-4 py-2 text-sm font-medium hover:border-brand-300"
          >
            {it.emoji && <span>{it.emoji}</span>}
            {it.label}
            {it.badge && (
              <span className="absolute -right-1 -top-1 inline-flex h-5 items-center rounded-full bg-red-500 px-1.5 text-[10px] font-bold text-white">
                {it.badge}
              </span>
            )}
          </Link>
        ))}
      </div>
    </section>
  );
}

function BannerStripRender({ section }: { section: Section }) {
  const ref = useImpression(section.id, section.variant);
  const c = section.config as {
    message?: string;
    href?: string;
    bgColor?: string;
    textColor?: string;
  };
  const content = (
    <div
      ref={ref}
      className="rounded-full px-4 py-2.5 text-center text-sm font-medium"
      style={{ backgroundColor: c.bgColor ?? '#fef3c7', color: c.textColor ?? '#92400e' }}
    >
      {c.message}
    </div>
  );
  return c.href ? (
    <Link href={c.href} onClick={() => reportClick(section.id, section.variant)}>
      {content}
    </Link>
  ) : (
    content
  );
}

function CountdownRender({ section }: { section: Section }) {
  const ref = useImpression(section.id, section.variant);
  const c = section.config as {
    headline?: string;
    subline?: string;
    endsAt?: string;
    ctaLabel?: string;
    ctaHref?: string;
    bgColor?: string;
    textColor?: string;
  };
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  const endsAt = c.endsAt ? new Date(c.endsAt).getTime() : now;
  const diff = Math.max(0, endsAt - now);
  const h = Math.floor(diff / 3_600_000);
  const m = Math.floor((diff % 3_600_000) / 60_000);
  const s = Math.floor((diff % 60_000) / 1000);

  return (
    <section
      ref={ref}
      className="rounded-3xl px-6 py-10 text-center"
      style={{ backgroundColor: c.bgColor ?? '#0f172a', color: c.textColor ?? '#fbbf24' }}
    >
      <div className="text-xs font-semibold uppercase tracking-widest opacity-80">{c.headline}</div>
      <div className="mt-2 flex justify-center gap-3 font-mono text-3xl font-bold tabular-nums md:text-5xl">
        <Unit value={h} label="시" />
        <Unit value={m} label="분" />
        <Unit value={s} label="초" />
      </div>
      {c.subline && <div className="mt-3 text-sm opacity-90">{c.subline}</div>}
      {c.ctaHref && c.ctaLabel && (
        <Link
          href={c.ctaHref}
          onClick={() => reportClick(section.id, section.variant)}
          className="mt-5 inline-block rounded-full bg-white px-6 py-2.5 text-sm font-semibold text-gray-900"
        >
          {c.ctaLabel}
        </Link>
      )}
    </section>
  );
}

function Unit({ value, label }: { value: number; label: string }) {
  return (
    <div className="flex flex-col items-center">
      <span>{String(value).padStart(2, '0')}</span>
      <span className="text-[10px] opacity-70">{label}</span>
    </div>
  );
}

function BrandStoryRender({ section }: { section: Section }) {
  const ref = useImpression(section.id, section.variant);
  const c = section.config as {
    brand?: string;
    headline?: string;
    body?: string;
    imageUrl?: string;
    ctaLabel?: string;
    ctaHref?: string;
    layout?: 'image-left' | 'image-right' | 'image-top';
  };
  const layout = c.layout ?? 'image-right';
  const flexDir =
    layout === 'image-left' ? 'md:flex-row' : layout === 'image-right' ? 'md:flex-row-reverse' : 'flex-col';
  return (
    <section ref={ref} className={`flex flex-col gap-4 rounded-3xl bg-gray-50 p-6 md:items-center md:gap-6 md:p-8 ${flexDir}`}>
      {c.imageUrl && (
        <div className="md:flex-1">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={c.imageUrl} alt={c.brand ?? ''} className="aspect-video w-full rounded-2xl object-cover" />
        </div>
      )}
      <div className="md:flex-1">
        <div className="text-xs font-semibold uppercase tracking-widest text-brand-600">{c.brand}</div>
        <h3 className="mt-1 text-2xl font-bold">{c.headline}</h3>
        <p className="mt-2 text-sm text-gray-600">{c.body}</p>
        {c.ctaHref && c.ctaLabel && (
          <Link
            href={c.ctaHref}
            onClick={() => reportClick(section.id, section.variant)}
            className="mt-4 inline-flex items-center gap-1 text-sm font-semibold text-brand-600 hover:underline"
          >
            {c.ctaLabel} →
          </Link>
        )}
      </div>
    </section>
  );
}
