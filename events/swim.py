"""A deliberately small, deterministic 50 m swim environment with realistic fluid drag."""
from __future__ import annotations

from dataclasses import dataclass
from typing import Mapping

from .base import OlympicEvent

# Native swim actions
STROKE = "STROKE"
GLIDE = "GLIDE"

# Aliases for backward compatibility
ACCELERATE = "ACCELERATE"
COAST = "COAST"

LEGAL_ACTIONS = frozenset((STROKE, GLIDE, ACCELERATE, COAST))
SWIM_ACTIONS = frozenset((STROKE, GLIDE))


@dataclass
class Swim(OlympicEvent):
    """One-dimensional 50 m swim with fluid drag and propulsive stroke mechanics.

    Water imposes significant fluid drag (0.60 vs sprint air drag 0.16) and each
    stroke delivers forward propulsion (1.05 vs sprint 1.25), resulting in a
    terminal swimming velocity of 1.75 m/s (vs sprint 7.81 m/s).
    """

    distance: float = 50.0
    dt: float = 0.1
    max_time: float = 60.0
    stroke_force: float = 1.05
    water_drag: float = 0.60

    @property
    def acceleration(self) -> float:
        """Alias for stroke_force for polymorphic compatibility."""
        return self.stroke_force

    @property
    def drag(self) -> float:
        """Alias for water_drag for polymorphic compatibility."""
        return self.water_drag

    def reset(self, seed: int | None = None) -> Mapping[str, float]:
        self.position = 0.0
        self.velocity = 0.0
        self.time = 0.0
        self.steps = 0
        self._finished = False
        return self.observe()

    def observe(self) -> Mapping[str, float]:
        return {
            "distance_to_finish": max(0.0, self.distance - self.position),
            "velocity": self.velocity,
        }

    def step(self, action: str) -> Mapping[str, float]:
        if action not in LEGAL_ACTIONS:
            raise ValueError(f"Illegal swim action {action!r}; choose from {sorted(LEGAL_ACTIONS)}")
        if self._finished:
            raise RuntimeError("Cannot step a finished swim; call reset().")
        force = self.stroke_force if action in (STROKE, ACCELERATE) else 0.0
        # Semi-implicit Euler in viscous water:
        self.velocity = max(0.0, self.velocity + self.dt * (force - self.water_drag * self.velocity))
        self.position = min(self.distance, self.position + self.dt * self.velocity)
        self.time += self.dt
        self.steps += 1
        self._finished = self.position >= self.distance or self.time >= self.max_time
        return self.observe()

    def is_finished(self) -> bool:
        return self._finished

    def score(self) -> float:
        """Finished time is better; unfinished trials receive a distance-sensitive penalty."""
        return self.time if self.position >= self.distance else self.max_time + (self.distance - self.position)
