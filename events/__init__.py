"""Virtual Olympic environments."""
from .base import OlympicEvent
from .sprint import ACCELERATE as SPRINT_ACCELERATE, COAST as SPRINT_COAST, Sprint
from .swim import GLIDE, STROKE, Swim

__all__ = [
    "OlympicEvent",
    "Sprint",
    "SPRINT_ACCELERATE",
    "SPRINT_COAST",
    "Swim",
    "STROKE",
    "GLIDE",
]
