import json
import pytest

from brain.controller import FlyBrainController, SWIM_POLICY
from events.swim import GLIDE, STROKE, Swim
from experiments.run_swim import run
from experiments.serve_view import viewer_payload
from experiments.train_swim import train


def test_seeded_random_swim_is_reproducible():
    assert run("random", seed=4) == run("random", seed=4)


def test_swim_controller_interface_runs_for_each_baseline_and_fly():
    for name in ("random", "rule", "fly", "trained"):
        records = run(name, seed=2)
        assert records and records[-1]["simulation_time"] <= 60.0
        assert all(row["action"] in {"GLIDE", "STROKE"} for row in records)


def test_swim_training_reproduces_saved_policy_and_improves_finish():
    policy = train(seed=7)
    assert policy == json.loads(SWIM_POLICY.read_text())
    assert policy["best"]["finished"]
    assert not policy["untrained"]["finished"]
    assert policy["best"]["score"] < policy["untrained"]["score"]
    assert policy["best"]["distance"] == 50.0
    assert policy["best"]["time"] == pytest.approx(30.2, abs=0.2)
    assert policy["untrained"]["distance"] == pytest.approx(0.70, abs=0.1)


def test_trained_swim_matches_continuous_stroke_reference():
    reference = Swim()
    reference.reset()
    while not reference.is_finished():
        reference.step(STROKE)
    records = run("trained")
    assert records[-1]["position"] == 50.0
    assert records[-1]["simulation_time"] == pytest.approx(reference.score())
    assert records == run("trained", seed=123)
    assert all("motor_difference" in row for row in records)


def test_swim_policy_errors_are_explicit(tmp_path):
    path = tmp_path / "swim_policy.json"
    with pytest.raises(FileNotFoundError, match="train_swim"):
        FlyBrainController.trained_swim(path)
    path.write_text(json.dumps({"version": 2, "event": "swim"}))
    with pytest.raises(ValueError, match="version 1"):
        FlyBrainController.trained_swim(path)


def test_viewer_payload_includes_swim():
    payload = viewer_payload(7, event="swim")
    assert payload["event"] == "swim"
    assert "events" in payload
    assert "swim" in payload["events"]
    assert "sprint" in payload["events"]
    assert payload["events"]["swim"]["distance"] == 50.0
    assert payload["runs"]["trained"][-1]["position"] == 50.0
    assert payload["runs"]["trained"][-1]["simulation_time"] == pytest.approx(30.2, abs=0.2)
    assert payload["runs"]["trained"][-1]["action"] == "STROKE"
    assert payload["runs"]["fly"][-1]["position"] == pytest.approx(0.70, abs=0.1)
    assert payload["runs"]["fly"][-1]["action"] == "GLIDE"


def test_swim_viewer_neurons_match_recorded_activity_and_manc_circuit():
    import numpy as np
    from brain.connectome import load_manc_front_leg_circuit
    payload = viewer_payload(7, event="swim")
    circuit = load_manc_front_leg_circuit()
    assert [node['id'] for node in payload['circuit']['nodes']] == list(circuit.neuron_ids)
    assert len(payload['circuit']['edges']) == circuit.weights.nnz
    for edge in payload['circuit']['edges']:
        assert edge['weight'] == circuit.weights[edge['post'], edge['pre']]
    for name in ('trained', 'fly'):
        rows = payload['events']['swim']['runs'][name]
        activity = np.asarray([row['neuron_activity'] for row in rows])
        assert activity.shape == (len(rows), circuit.size)
        assert np.isfinite(activity).all()
        assert ((activity >= 0) & (activity <= 1)).all()
        for role, field in [('sensory', 'sensory_mean'), ('intrinsic', 'intrinsic_mean'),
                            ('motor_extensor', 'motor_extensor'), ('motor_flexor', 'motor_flexor')]:
            np.testing.assert_allclose(activity[:, circuit.indices(role)].mean(axis=1),
                                       [row[field] for row in rows])
        assert [row['action'] for row in rows] == [
            'STROKE' if row['motor_difference'] > row['motor_threshold'] else 'GLIDE'
            for row in rows]
    assert 'neuron_activity' not in payload['events']['swim']['runs']['rule'][0]
    assert 'neuron_activity' not in payload['events']['swim']['runs']['random'][0]


def test_swim_activity_recording_preserves_simulation():
    recorded = run('trained', record_activity=True)
    assert [{key: value for key, value in row.items()
             if key not in ('neuron_activity', 'motor_threshold')} for row in recorded] == run('trained')


