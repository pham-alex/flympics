import pytest

from events.sprint import Sprint
from events.swim import ACCELERATE, COAST, GLIDE, LEGAL_ACTIONS, STROKE, SWIM_ACTIONS, Swim


def test_reset_and_observation():
    swim = Swim()
    observation = swim.reset(42)
    assert observation == {"distance_to_finish": 50.0, "velocity": 0.0}
    assert not swim.is_finished()
    assert swim.position == 0.0
    assert swim.steps == 0
    assert swim.time == 0.0


def test_fixed_step_is_deterministic():
    a, b = Swim(), Swim()
    a.reset(1)
    b.reset(999)
    for _ in range(10):
        a.step(STROKE)
        b.step(STROKE)
    assert a.observe() == b.observe()
    assert a.score() == b.score()


def test_legal_actions_and_aliases():
    swim_stroke = Swim()
    swim_stroke.reset()
    obs_stroke = swim_stroke.step(STROKE)

    swim_accel = Swim()
    swim_accel.reset()
    obs_accel = swim_accel.step(ACCELERATE)

    # STROKE and ACCELERATE aliases should behave identically
    assert obs_stroke == obs_accel
    assert obs_stroke["velocity"] > 0.0

    swim_glide = Swim()
    swim_glide.reset()
    obs_glide = swim_glide.step(GLIDE)

    swim_coast = Swim()
    swim_coast.reset()
    obs_coast = swim_coast.step(COAST)

    assert obs_glide == obs_coast
    assert obs_glide["velocity"] == 0.0

    assert SWIM_ACTIONS.issubset(LEGAL_ACTIONS)


def test_illegal_actions_and_finished_step_error():
    swim = Swim()
    swim.reset()
    with pytest.raises(ValueError, match="Illegal swim action"):
        swim.step("FLY")

    short = Swim(distance=0.01)
    short.reset()
    short.step(STROKE)
    assert short.is_finished()
    with pytest.raises(RuntimeError, match="Cannot step a finished swim"):
        short.step(STROKE)


def test_termination_and_scoring():
    # Finishes by reaching 50 m
    swim = Swim(distance=1.0)
    swim.reset()
    while not swim.is_finished():
        swim.step(STROKE)
    assert swim.position >= 1.0
    assert swim.score() == pytest.approx(swim.time)

    # Times out without finishing
    timeout_swim = Swim(distance=50.0, max_time=1.0)
    timeout_swim.reset()
    while not timeout_swim.is_finished():
        timeout_swim.step(GLIDE)
    assert timeout_swim.is_finished()
    assert timeout_swim.position == 0.0
    assert timeout_swim.score() == pytest.approx(1.0 + 50.0)


def test_water_drag_decelerates_faster_than_sprint():
    # Both start at same initial speed and coast/glide
    sprint = Sprint()
    sprint.reset()
    sprint.velocity = 4.0

    swim = Swim()
    swim.reset()
    swim.velocity = 4.0

    sprint.step(COAST)
    swim.step(GLIDE)

    # Water drag (0.60) should reduce velocity more than sprint drag (0.16)
    assert swim.velocity < sprint.velocity


def test_swim_parameters_and_terminal_velocity():
    swim = Swim()
    assert swim.distance == 50.0
    assert swim.stroke_force == 1.05
    assert swim.water_drag == 0.60
    terminal_velocity = swim.stroke_force / swim.water_drag
    assert terminal_velocity == pytest.approx(1.75)

