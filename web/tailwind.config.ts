import type { Config } from 'tailwindcss';

const config: Config = {
  content: [
    './pages/**/*.{js,ts,jsx,tsx,mdx}',
    './components/**/*.{js,ts,jsx,tsx,mdx}',
    './app/**/*.{js,ts,jsx,tsx,mdx}',
    './contexts/**/*.{js,ts,jsx,tsx}',
  ],

  // Apple HIG 테마: class + data-attribute 병행 전략
  // data-theme='dark' 속성으로 제어 (system/auto 세 번째 옵션 지원)
  darkMode: ['class', '[data-theme="dark"]'],

  theme: {
    extend: {
      // ── Apple HIG 의미론적 색상 (CSS 변수 매핑) ──────────────────────────
      colors: {
        // 배경
        'bg-primary':           'var(--color-bg-primary)',
        'bg-secondary':         'var(--color-bg-secondary)',
        'bg-tertiary':          'var(--color-bg-tertiary)',
        'bg-grouped':           'var(--color-bg-grouped-primary)',
        // 라벨
        'label-primary':        'var(--color-label-primary)',
        'label-secondary':      'var(--color-label-secondary)',
        'label-tertiary':       'var(--color-label-tertiary)',
        // Fill
        'fill-primary':         'var(--color-fill-primary)',
        'fill-secondary':       'var(--color-fill-secondary)',
        'fill-tertiary':        'var(--color-fill-tertiary)',
        'fill-quaternary':      'var(--color-fill-quaternary)',
        // 구분선
        'separator':            'var(--color-separator-opaque)',
        'separator-non-opaque': 'var(--color-separator-non-opaque)',
        // 시스템 컬러
        'system-blue':          'var(--color-system-blue)',
        'system-green':         'var(--color-system-green)',
        'system-red':           'var(--color-system-red)',
        'system-orange':        'var(--color-system-orange)',
        'system-yellow':        'var(--color-system-yellow)',
        'system-purple':        'var(--color-system-purple)',
        'system-pink':          'var(--color-system-pink)',
        'system-teal':          'var(--color-system-teal)',
        'system-indigo':        'var(--color-system-indigo)',
        // 그레이
        'gray-system':          'var(--color-gray)',
        'gray2-system':         'var(--color-gray2)',
        'gray3-system':         'var(--color-gray3)',
        'gray4-system':         'var(--color-gray4)',
        'gray5-system':         'var(--color-gray5)',
        'gray6-system':         'var(--color-gray6)',
        // 편의 별칭
        accent:      'var(--color-system-blue)',
        destructive: 'var(--color-system-red)',
        success:     'var(--color-system-green)',
        warning:     'var(--color-system-orange)',

        // Frame Ops 브랜드 컬러 (유지)
        brand: {
          50:  '#f0f4ff',
          100: '#dde5ff',
          200: '#c3d0ff',
          300: '#9fb0ff',
          400: '#7585fc',
          500: '#5b61f8',
          600: '#4b43ec',
          700: '#3f37d1',
          800: '#342fa8',
          900: '#2d2c85',
          950: '#1c1a50',
        },
      },

      // ── 박스 그림자 (CSS 변수) ────────────────────────────────────────────
      boxShadow: {
        'hig-xs': 'var(--shadow-xs)',
        'hig-sm': 'var(--shadow-sm)',
        'hig-md': 'var(--shadow-md)',
        'hig-lg': 'var(--shadow-lg)',
        'hig-xl': 'var(--shadow-xl)',
      },

      // Apple HIG 기반 타이포그래피 스케일
      fontSize: {
        'caption2':  ['11px', { lineHeight: '13px' }],
        'caption1':  ['12px', { lineHeight: '16px' }],
        'footnote':  ['13px', { lineHeight: '18px' }],
        'subhead':   ['15px', { lineHeight: '20px' }],
        'callout':   ['16px', { lineHeight: '21px' }],
        'body':      ['17px', { lineHeight: '22px' }],
        'headline':  ['17px', { lineHeight: '22px', fontWeight: '600' }],
        'title3':    ['20px', { lineHeight: '25px' }],
        'title2':    ['22px', { lineHeight: '28px' }],
        'title1':    ['28px', { lineHeight: '34px' }],
        'largetitle':['34px', { lineHeight: '41px' }],
      },

      // 최소 터치 타겟 (Apple HIG: 44pt)
      minHeight: {
        'touch': '44px',
        'touch-lg': '52px',
      },
      minWidth: {
        'touch': '44px',
      },

      // 애니메이션
      keyframes: {
        'slide-up': {
          '0%': { transform: 'translateY(100%)', opacity: '0' },
          '100%': { transform: 'translateY(0)', opacity: '1' },
        },
        'fade-in': {
          '0%': { opacity: '0' },
          '100%': { opacity: '1' },
        },
      },
      animation: {
        'slide-up': 'slide-up 0.25s ease-out',
        'fade-in': 'fade-in 0.15s ease-out',
      },
    },
  },
  plugins: [],
};

export default config;
