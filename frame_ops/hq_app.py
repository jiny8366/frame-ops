"""본사어드민 진입점 — frame_ops/hq_app.py 를 Main file로 지정"""
import sys
from pathlib import Path

_ROOT = Path(__file__).parent  # frame_ops/
if str(_ROOT) not in sys.path:
    sys.path.insert(0, str(_ROOT))

import streamlit as st

st.set_page_config(
    page_title="본사어드민 포털 — FRAME OPS",
    page_icon="🧭",
    layout="wide",
    initial_sidebar_state="collapsed",
)

from lib.service_portal import (
    MODE_HQ,
    render_frame_ops_chrome,
    set_query_param_for_mode,
    set_service_mode,
)

set_service_mode(MODE_HQ)
set_query_param_for_mode(MODE_HQ)
render_frame_ops_chrome()
