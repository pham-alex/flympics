"""Fit an artificial motor threshold for 50 m swim; biological connectivity stays fixed."""
from __future__ import annotations

import argparse
import json
from pathlib import Path

import numpy as np

from brain.controller import FlyBrainController, SWIM_POLICY
from events.swim import Swim
from experiments.run_swim import run


def train(seed: int = 7) -> dict:
    thresholds = [0.015, *np.geomspace(0.1, 1e-8, 32).tolist(), 0.0]
    trials = []
    for threshold in thresholds:
        controller = FlyBrainController.swim(motor_threshold=threshold)
        records = run(seed=seed, controller=controller)
        final = records[-1]
        finished = final["distance_to_finish"] == 0
        score = final["simulation_time"] if finished else Swim().max_time + final["distance_to_finish"]
        trials.append({
            "motor_threshold": threshold,
            "score": round(score, 8),
            "finished": finished,
            "time": final["simulation_time"],
            "distance": final["position"],
        })
    best = min(trials, key=lambda trial: trial["score"])
    return {
        "version": 1,
        "event": "swim",
        "method": "deterministic motor-threshold grid search",
        "seed": seed,
        "motor_threshold": best["motor_threshold"],
        "best": best,
        "untrained": trials[0],
        "trials": trials,
    }


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--seed", type=int, default=7)
    parser.add_argument("--output", type=Path, default=SWIM_POLICY)
    args = parser.parse_args()
    policy = train(args.seed)
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(policy, indent=2, allow_nan=False) + "\n")
    best = policy["best"]
    print(f"Trained: {best['distance']:.1f} m in {best['time']:.1f} s; "
          f"finished={best['finished']}; threshold={best['motor_threshold']:.8g}")
    print(f"Policy and {len(policy['trials'])} trial results: {args.output}")


if __name__ == "__main__":
    main()
