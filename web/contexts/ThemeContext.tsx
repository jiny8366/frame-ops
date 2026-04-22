// Frame Ops — Apple HIG 테마 Context
// 'light' | 'dark' | 'system' 세 가지 모드 지원
// localStorage 영속, matchMedia OS 연동, FOUC 방지

'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from 'react';

// ── 타입 ──────────────────────────────────────────────────────────────────────
export type Theme = 'light' | 'dark' | 'system';
export type ResolvedTheme = 'light' | 'dark';

interface ThemeContextValue {
  /** 사용자가 선택한 값 ('system' 포함) */
  theme: Theme;
  /** 실제 적용된 테마 ('system' 선택 시 OS 설정에 따른 값) */
  resolvedTheme: ResolvedTheme;
  /** 테마 변경 */
  setTheme: (theme: Theme) => void;
}

const STORAGE_KEY = 'frameops-theme';

// ── Context ───────────────────────────────────────────────────────────────────
const ThemeContext = createContext<ThemeContextValue | null>(null);

// ── OS 다크모드 감지 헬퍼 ─────────────────────────────────────────────────────
function getSystemPreference(): ResolvedTheme {
  if (typeof window === 'undefined') return 'light';
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

// ── data-theme 속성 + color-scheme 적용 ──────────────────────────────────────
function applyTheme(resolved: ResolvedTheme) {
  const root = document.documentElement;
  root.setAttribute('data-theme', resolved);
  root.style.colorScheme = resolved;
}

// ── localStorage 헬퍼 ────────────────────────────────────────────────────────
function loadStoredTheme(): Theme {
  try {
    const stored = localStorage.getItem(STORAGE_KEY) as Theme | null;
    if (stored === 'light' || stored === 'dark' || stored === 'system') {
      return stored;
    }
  } catch {
    // SSR 또는 privacy 모드
  }
  return 'system';
}

function saveTheme(theme: Theme) {
  try {
    localStorage.setItem(STORAGE_KEY, theme);
  } catch {
    // 무시
  }
}

// ── Provider ─────────────────────────────────────────────────────────────────
export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setThemeState] = useState<Theme>('system');
  const [resolvedTheme, setResolvedTheme] = useState<ResolvedTheme>('light');

  // 초기화: localStorage → 없으면 'system'
  useEffect(() => {
    const stored = loadStoredTheme();
    setThemeState(stored);

    const resolved = stored === 'system' ? getSystemPreference() : stored;
    setResolvedTheme(resolved);
    applyTheme(resolved);
  }, []);

  // OS 다크모드 변경 감지 (system 모드일 때만 반응)
  useEffect(() => {
    const mq = window.matchMedia('(prefers-color-scheme: dark)');

    const handleChange = (e: MediaQueryListEvent) => {
      setThemeState((current) => {
        if (current === 'system') {
          const resolved: ResolvedTheme = e.matches ? 'dark' : 'light';
          setResolvedTheme(resolved);
          applyTheme(resolved);
        }
        return current;
      });
    };

    mq.addEventListener('change', handleChange);
    return () => mq.removeEventListener('change', handleChange);
  }, []);

  const setTheme = useCallback((newTheme: Theme) => {
    const resolved = newTheme === 'system' ? getSystemPreference() : newTheme;
    setThemeState(newTheme);
    setResolvedTheme(resolved);
    saveTheme(newTheme);
    applyTheme(resolved);
  }, []);

  return (
    <ThemeContext.Provider value={{ theme, resolvedTheme, setTheme }}>
      {children}
    </ThemeContext.Provider>
  );
}

// ── 커스텀 훅 ─────────────────────────────────────────────────────────────────
export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext);
  if (!ctx) {
    throw new Error('useTheme는 ThemeProvider 내부에서만 사용할 수 있습니다.');
  }
  return ctx;
}
