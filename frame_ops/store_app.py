"""지점용 진입점 — FRAME_OPS_DEFAULT_MODE=sales 로 app.py 실행"""
import os as _os
_os.environ["FRAME_OPS_DEFAULT_MODE"] = "sales"

import runpy as _rp, pathlib as _pl
_rp.run_path(str(_pl.Path(__file__).parent / "app.py"), run_name="__main__")
