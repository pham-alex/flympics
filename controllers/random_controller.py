from __future__ import annotations

from typing import Mapping, Sequence
import numpy as np

from events.sprint import LEGAL_ACTIONS as SPRINT_ACTIONS
from events.swim import SWIM_ACTIONS
from .base import Controller


class RandomController(Controller):
    def __init__(self, actions: Sequence[str] | None = None) -> None:
        self.actions = tuple(sorted(actions if actions is not None else SPRINT_ACTIONS))
        self.rng = np.random.default_rng()

    def reset(self, seed: int | None = None) -> None:
        self.rng = np.random.default_rng(seed)

    def act(self, observation: Mapping[str, float]) -> str:
        return str(self.rng.choice(self.actions))


class SwimRandomController(RandomController):
    """Random baseline for swimming, choosing between STROKE and GLIDE."""

    def __init__(self) -> None:
        super().__init__(actions=tuple(SWIM_ACTIONS))
