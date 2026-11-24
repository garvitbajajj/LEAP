"""
Retraining gate: decides whether a candidate model should replace the current
active model based on offline evaluation metrics.
"""
from __future__ import annotations

import json
import logging
import os
from datetime import datetime, timezone

log = logging.getLogger("leap.eval.gate")


def should_activate(
    current_metrics: dict,
    candidate_metrics: dict,
    primary_metric: str = "ndcg",
    primary_k: int = 10,
    min_improvement: float = 0.01,
    max_regression: float = 0.05,
) -> tuple[bool, str]:
    """Compare candidate model metrics against the current model.

    Returns (activate, reason).

    Rules:
      1. The candidate's primary metric at ``primary_k`` must improve by at
         least ``min_improvement`` (absolute) over the current model.
      2. Neither precision nor recall at ``primary_k`` may regress by more
         than ``max_regression`` (relative, i.e. 5 %).
    """
    k_key = f"@{primary_k}"

    # Safely extract metric dicts
    cur = current_metrics.get(k_key, {})
    cand = candidate_metrics.get(k_key, {})

    if not cur or not cand:
        return False, f"Missing metrics at k={primary_k}; cannot compare."

    cur_primary = cur.get(primary_metric, 0.0)
    cand_primary = cand.get(primary_metric, 0.0)
    improvement = cand_primary - cur_primary

    # Rule 1: primary metric improvement
    if improvement < min_improvement:
        return (
            False,
            f"{primary_metric}@{primary_k} improved by only {improvement:+.4f} "
            f"(current={cur_primary:.4f}, candidate={cand_primary:.4f}); "
            f"minimum required improvement is {min_improvement:.4f}.",
        )

    # Rule 2: no significant regression in precision or recall
    for guard_metric in ("precision", "recall"):
        cur_val = cur.get(guard_metric, 0.0)
        cand_val = cand.get(guard_metric, 0.0)
        if cur_val > 0:
            regression = (cur_val - cand_val) / cur_val
            if regression > max_regression:
                return (
                    False,
                    f"{guard_metric}@{primary_k} regressed by {regression:.1%} "
                    f"(current={cur_val:.4f}, candidate={cand_val:.4f}); "
                    f"maximum allowed regression is {max_regression:.0%}.",
                )

    return (
        True,
        f"Gate PASSED: {primary_metric}@{primary_k} improved by {improvement:+.4f} "
        f"(current={cur_primary:.4f} → candidate={cand_primary:.4f}). "
        f"No precision/recall regression beyond threshold.",
    )


def log_decision(
    decision: bool,
    reason: str,
    current_metrics: dict,
    candidate_metrics: dict,
    log_dir: str | None = None,
) -> dict:
    """Log a gate decision to the logger and optionally to a JSON file."""
    record = {
        "timestamp": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "activated": decision,
        "reason": reason,
        "current_metrics": current_metrics,
        "candidate_metrics": candidate_metrics,
    }

    if decision:
        log.info("GATE PASSED – %s", reason)
    else:
        log.warning("GATE BLOCKED – %s", reason)

    if log_dir:
        try:
            os.makedirs(log_dir, exist_ok=True)
            path = os.path.join(log_dir, f"gate_{record['timestamp'].replace(':', '-')}.json")
            with open(path, "w", encoding="utf-8") as f:
                json.dump(record, f, indent=2)
            log.info("gate decision written to %s", path)
        except OSError as exc:
            log.warning("could not write gate log: %s", exc)

    return record
