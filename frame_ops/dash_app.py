"""본사대시보드 진입점 — FRAME_OPS_DEFAULT_MODE=hq_dashboard 로 app.py 실행"""
import os as _os
_os.environ["FRAME_OPS_DEFAULT_MODE"] = "hq_dashboard"

import runpy as _rp, pathlib as _pl
_rp.run_path(str(_pl.Path(__file__).parent / "app.py"), run_name="__main__")
