"""Artificial output-population to game-action adapter."""
from __future__ import annotations

import numpy as np

from events.sprint import ACCELERATE, COAST
from events.swim import GLIDE, STROKE
from .connectome import ConnectomeCircuit


class MotorDecoder:
    """Uses front-leg extensor/flexor MN activity as an artificial game readout."""
    def __init__(
        self,
        circuit: ConnectomeCircuit,
        threshold: float = 0.015,
        positive_action: str = ACCELERATE,
        negative_action: str = COAST,
    ):
        self.extensor = circuit.indices("motor_extensor")
        self.flexor = circuit.indices("motor_flexor")
        if not len(self.extensor) or not len(self.flexor):
            raise ValueError("Circuit needs extensor and flexor motor populations.")
        self.threshold = threshold
        self.positive_action = positive_action
        self.negative_action = negative_action

    def decode(self, activity: np.ndarray) -> tuple[str, dict[str, float]]:
        extensor = float(np.mean(activity[self.extensor]))
        flexor = float(np.mean(activity[self.flexor]))
        action = self.positive_action if extensor - flexor > self.threshold else self.negative_action
        return action, {"extensor": extensor, "flexor": flexor, "difference": extensor - flexor}


class SwimMotorDecoder(MotorDecoder):
    """Decodes motor difference into native STROKE and GLIDE swimming actions."""
    def __init__(self, circuit: ConnectomeCircuit, threshold: float = 0.015):
        super().__init__(circuit, threshold=threshold, positive_action=STROKE, negative_action=GLIDE)
