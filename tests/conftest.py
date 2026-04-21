"""pytest 공통 — headless Matplotlib (macOS GUI 백엔드 크래시 방지)."""

from __future__ import annotations

import matplotlib

matplotlib.use("Agg")
