"""Artificial task-observation to biological-population stimulation adapter."""
from __future__ import annotations

import numpy as np

from .connectome import ConnectomeCircuit


class SensoryEncoder:
    """Artificially stimulates selected front-leg proprioceptor nodes.

    Distance and velocity are virtual task variables, not measurements known to a
    fly neuron. This component is intentionally replaceable.
    """
    def __init__(
        self,
        circuit: ConnectomeCircuit,
        sprint_distance: float = 100.0,
        velocity_scale: float = 8.0,
    ):
        self.size = circuit.size
        self.indices = circuit.indices("sensory")
        self.sprint_distance = sprint_distance
        self.velocity_scale = velocity_scale

    def encode(self, observation: dict[str, float]) -> np.ndarray:
        distance_fraction = np.clip(observation["distance_to_finish"] / self.sprint_distance, 0.0, 1.0)
        velocity_fraction = np.clip(observation["velocity"] / self.velocity_scale, 0.0, 1.0)
        # Artificial tonic/proprioceptive-like drive, deliberately not a biological claim.
        level = 0.45 + 0.90 * distance_fraction + 0.25 * velocity_fraction
        vector = np.zeros(self.size, dtype=float)
        vector[self.indices] = level
        return vector


class SwimSensoryEncoder(SensoryEncoder):
    """Sensory stimulation adapter calibrated for 50 m swim scales."""
    def __init__(self, circuit: ConnectomeCircuit, target_distance: float = 50.0, max_velocity: float = 2.0):
        super().__init__(circuit, sprint_distance=target_distance, velocity_scale=max_velocity)
