"""본사대시보드 진입점 — frame_ops/dash_app.py 를 Main file로 지정"""
import sys
from pathlib import Path

_ROOT = Path(__file__).parent  # frame_ops/
if str(_ROOT) not in sys.path:
    sys.path.insert(0, str(_ROOT))

import streamlit as st

st.set_page_config(
    page_title="본사대시보드 포털 — FRAME OPS",
    page_icon="🧭",
    layout="wide",
    initial_sidebar_state="collapsed",
)

from lib.service_portal import (
    MODE_HQ_DASH,
    render_frame_ops_chrome,
    set_query_param_for_mode,
    set_service_mode,
)

set_service_mode(MODE_HQ_DASH)
set_query_param_for_mode(MODE_HQ_DASH)
render_frame_ops_chrome()
