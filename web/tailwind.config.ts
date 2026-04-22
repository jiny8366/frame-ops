import type { Config } from 'tailwindcss';

const config: Config = {
  content: [
    './pages/**/*.{js,ts,jsx,tsx,mdx}',
    './components/**/*.{js,ts,jsx,tsx,mdx}',
    './app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      // Frame Ops 브랜드 컬러
      colors: {
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
        surface: {
          DEFAULT: '#ffffff',
          secondary: '#f8f9fa',
          tertiary: '#f1f3f5',
        },
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
