from __future__ import annotations

from typing import Mapping

from events.sprint import ACCELERATE, COAST
from events.swim import GLIDE, STROKE
from .base import Controller


class RuleController(Controller):
    """Transparent non-neural baseline: accelerate until a modest target speed."""

    target_velocity: float = 7.0

    def __init__(
        self,
        target_velocity: float = 7.0,
        positive_action: str = ACCELERATE,
        negative_action: str = COAST,
    ) -> None:
        self.target_velocity = target_velocity
        self.positive_action = positive_action
        self.negative_action = negative_action

    def reset(self, seed: int | None = None) -> None:
        pass

    def act(self, observation: Mapping[str, float]) -> str:
        return self.positive_action if observation["velocity"] < self.target_velocity else self.negative_action


class SwimRuleController(RuleController):
    """Rule baseline calibrated for swimming: stroke up to 1.5 m/s in water, then glide."""

    target_velocity: float = 1.5

    def __init__(self, target_velocity: float = 1.5) -> None:
        super().__init__(
            target_velocity=target_velocity,
            positive_action=STROKE,
            negative_action=GLIDE,
        )
