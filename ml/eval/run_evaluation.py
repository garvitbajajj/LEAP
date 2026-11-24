#!/usr/bin/env python3
"""
CLI entry-point for the LEAP offline evaluation harness.

    cd ml/
    python -m eval.run_evaluation --help
    python -m eval.run_evaluation --k 5 10 20 --output results.json
"""
from __future__ import annotations

import argparse
import json
import logging
import sys
import urllib.request

from app import config
from app.model import Model

from eval.gate import log_decision, should_activate
from eval.harness import OfflineEvaluator

logging.basicConfig(
    level=logging.INFO,
    format='{"level":"%(levelname)s","time":"%(asctime)s","msg":"%(message)s"}',
)
log = logging.getLogger("leap.eval.cli")


def _api_get(path: str) -> dict:
    url = f"{config.LEAP_API_URL}{path}"
    req = urllib.request.Request(url, headers={"X-API-Key": config.LEAP_API_KEY})
    with urllib.request.urlopen(req, timeout=10) as resp:  # noqa: S310
        return json.loads(resp.read())


def _print_table(results: dict) -> None:
    """Pretty-print a comparison table to stdout."""
    models = {}
    if "hybrid_model" in results:
        models["hybrid_model"] = results["hybrid_model"]
    for name, baseline in results.get("baselines", {}).items():
        models[name] = baseline

    if not models:
        print("No results to display.")
        return

    # Collect all k-keys
    k_keys = sorted(
        {k for m in models.values() for k in m if k.startswith("@")},
        key=lambda x: int(x[1:]),
    )
    metrics = ["precision", "recall", "ndcg", "map", "hit_rate"]

    header = f"{'Model':<20}"
    for k_key in k_keys:
        for metric in metrics:
            header += f" {metric}{k_key}:>10"
    header += f" {'coverage':>10} {'diversity':>10}"

    print("\n" + "=" * 120)
    print("LEAP Offline Evaluation Results")
    print("=" * 120)

    # Print per-model rows
    for model_name, m in models.items():
        row = f"{model_name:<20}"
        for k_key in k_keys:
            k_metrics = m.get(k_key, {})
            for metric in metrics:
                row += f" {k_metrics.get(metric, 0.0):>10.4f}"
        row += f" {m.get('coverage', 0.0):>10.4f}"
        row += f" {m.get('diversity', 0.0):>10.4f}"
        print(row)

    print("=" * 120 + "\n")


def main(argv: list[str] | None = None) -> None:
    parser = argparse.ArgumentParser(description="LEAP offline evaluation harness")
    parser.add_argument("--k", nargs="+", type=int, default=[5, 10, 20], help="Cut-off depths for metrics")
    parser.add_argument("--output", "-o", type=str, default=None, help="Path to write JSON results")
    parser.add_argument("--test-ratio", type=float, default=0.2, help="Fraction of interactions to hold out")
    parser.add_argument("--seed", type=int, default=42, help="Random seed for reproducibility")
    parser.add_argument(
        "--primary-metric", type=str, default="ndcg", help="Primary metric for the retraining gate"
    )
    parser.add_argument("--primary-k", type=int, default=10, help="k value for the primary metric")
    parser.add_argument(
        "--min-improvement", type=float, default=0.01, help="Minimum improvement to pass the gate"
    )
    parser.add_argument("--gate-log-dir", type=str, default=None, help="Directory to write gate decision logs")
    args = parser.parse_args(argv)

    # ---- fetch data
    log.info("Fetching catalogue and interactions from LEAP API…")
    try:
        catalogue = _api_get("/internal/catalogue")["items"]
        interactions = _api_get("/internal/interactions")["rows"]
    except Exception as exc:
        log.error("Could not fetch data from LEAP API: %s", exc)
        sys.exit(1)

    log.info("Catalogue: %d items, Interactions: %d rows", len(catalogue), len(interactions))

    # ---- fit current model on full data
    log.info("Fitting current model on full data…")
    current_model = Model()
    current_model.fit(catalogue, interactions, source="eval-current")

    # ---- fit candidate model on training split (the evaluator does the split)
    evaluator = OfflineEvaluator(
        catalogue=catalogue,
        interactions=interactions,
        test_ratio=args.test_ratio,
        seed=args.seed,
    )

    log.info("Fitting candidate model on training split…")
    candidate_model = Model()
    candidate_model.fit(catalogue, evaluator.train_interactions, source="eval-candidate")

    # ---- run evaluation
    log.info("Running model comparison…")
    results = evaluator.compare(candidate_model, k_values=args.k)

    _print_table(results)

    # ---- retraining gate
    hybrid_metrics = results.get("hybrid_model", {})

    # Also evaluate the current (full-data) model for gate comparison
    log.info("Evaluating current model for gate comparison…")
    current_metrics = evaluator.evaluate_model(current_model, k_values=args.k)

    activate, reason = should_activate(
        current_metrics=current_metrics,
        candidate_metrics=hybrid_metrics,
        primary_metric=args.primary_metric,
        primary_k=args.primary_k,
        min_improvement=args.min_improvement,
    )

    gate_record = log_decision(
        decision=activate,
        reason=reason,
        current_metrics=current_metrics,
        candidate_metrics=hybrid_metrics,
        log_dir=args.gate_log_dir,
    )

    print(f"Gate decision: {'ACTIVATE' if activate else 'BLOCK'}")
    print(f"Reason: {reason}\n")

    # ---- write output
    full_output = {
        "comparison": results,
        "current_model_metrics": current_metrics,
        "gate": gate_record,
    }

    if args.output:
        with open(args.output, "w", encoding="utf-8") as f:
            json.dump(full_output, f, indent=2)
        log.info("Results written to %s", args.output)

    # Exit code reflects gate decision
    sys.exit(0 if activate else 1)


if __name__ == "__main__":
    main()
