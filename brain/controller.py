"""The only controller that couples the event loop to the neural model."""
from __future__ import annotations

from typing import Mapping
from pathlib import Path
import json
import math

from controllers.base import Controller
from .connectome import load_manc_front_leg_circuit
from .dynamics import RateNetwork
from .motor import MotorDecoder
from .sensory import SensoryEncoder

SPRINT_POLICY = Path(__file__).resolve().parents[1] / "models" / "sprint.json"
SWIM_POLICY = Path(__file__).resolve().parents[1] / "models" / "swim.json"


class FlyBrainController(Controller):
    """A connectome-derived neural controller, not a simulated complete fly brain."""
    def __init__(
        self,
        motor_threshold: float = 0.015,
        target_distance: float = 100.0,
        velocity_scale: float = 8.0,
        positive_action: str = "ACCELERATE",
        negative_action: str = "COAST",
    ) -> None:
        if not math.isfinite(motor_threshold) or not 0 <= motor_threshold <= 1:
            raise ValueError("Motor threshold must be finite and between 0 and 1.")
        self.circuit = load_manc_front_leg_circuit()
        self.encoder = SensoryEncoder(
            self.circuit,
            sprint_distance=target_distance,
            velocity_scale=velocity_scale,
        )
        self.network = RateNetwork(self.circuit)
        self.decoder = MotorDecoder(
            self.circuit,
            threshold=motor_threshold,
            positive_action=positive_action,
            negative_action=negative_action,
        )
        self.last_summary: dict[str, float] = {}

    @classmethod
    def trained(cls, path: Path = SPRINT_POLICY) -> FlyBrainController:
        if not path.exists():
            raise FileNotFoundError(f"Missing sprint policy: {path}. Run python -m experiments.train_sprint")
        policy = json.loads(path.read_text())
        if policy.get("version") != 1 or policy.get("event") != "sprint":
            raise ValueError("Expected a version 1 sprint policy.")
        return cls(motor_threshold=float(policy["motor_threshold"]))

    @classmethod
    def swim(cls, motor_threshold: float = 0.015) -> FlyBrainController:
        """Untrained fly controller calibrated for the 50 m swim environment."""
        return cls(
            motor_threshold=motor_threshold,
            target_distance=50.0,
            velocity_scale=2.0,
            positive_action="STROKE",
            negative_action="GLIDE",
        )

    @classmethod
    def trained_swim(cls, path: Path = SWIM_POLICY) -> FlyBrainController:
        """Trained fly controller calibrated for the 50 m swim environment."""
        if not path.exists():
            raise FileNotFoundError(f"Missing swim policy: {path}. Run python -m experiments.train_swim")
        policy = json.loads(path.read_text())
        if policy.get("version") != 1 or policy.get("event") != "swim":
            raise ValueError("Expected a version 1 swim policy.")
        return cls(
            motor_threshold=float(policy["motor_threshold"]),
            target_distance=50.0,
            velocity_scale=2.0,
            positive_action="STROKE",
            negative_action="GLIDE",
        )

    def reset(self, seed: int | None = None) -> None:
        self.network.reset()
        self.last_summary = {}

    def act(self, observation: Mapping[str, float]) -> str:
        stimulus = self.encoder.encode(dict(observation))
        activity = self.network.step(stimulus)
        action, motor = self.decoder.decode(activity)
        self.last_summary = {
            "sensory_mean": float(activity[self.encoder.indices].mean()),
            "intrinsic_mean": float(activity[self.circuit.indices("intrinsic")].mean()),
            "motor_extensor": motor["extensor"],
            "motor_flexor": motor["flexor"],
            "motor_difference": motor["difference"],
        }
        return action
