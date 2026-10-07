from __future__ import annotations

from pathlib import Path
from typing import Sequence

import matplotlib.pyplot as plt


def save_swim_plot(records: Sequence[dict], output: str | Path) -> None:
    """Save one simple static chart for the 50 m swim; no GUI required."""
    times = [r["simulation_time"] for r in records]
    positions = [r["position"] for r in records]
    velocities = [r["velocity"] for r in records]
    fig, (pool, speed) = plt.subplots(2, 1, figsize=(8, 5), layout="constrained")
    pool.plot(times, positions, color="#0077b6", label="swimmer position", linewidth=2)
    pool.axhline(50, color="#d9534f", linestyle="--", label="50 m finish wall")
    pool.set(ylabel="metres", title="Flympics — 50 m Swim")
    pool.legend()
    speed.plot(times, velocities, color="#0288d1", linewidth=1.8)
    speed.set(xlabel="simulation time (s)", ylabel="speed in water (m/s)")
    fig.savefig(output, dpi=150)
    plt.close(fig)


def create_swim_activity_view(records: Sequence[dict], controller_name: str):
    """Build a swimming pool viewer from measured logs; drawing never changes physics."""
    import numpy as np
    from matplotlib.offsetbox import AnnotationBbox, DrawingArea
    from matplotlib.patches import Ellipse, Rectangle

    if not records:
        raise ValueError("The activity viewer needs at least one timestep.")
    fig = plt.figure(figsize=(11, 6), facecolor="#f0f7fa", layout="constrained")
    grid = fig.add_gridspec(2, 2, height_ratios=[1.15, 1], width_ratios=[1.1, 1])
    pool = fig.add_subplot(grid[0, :])
    history = fig.add_subplot(grid[1, 0])
    card = fig.add_subplot(grid[1, 1])
    fig.suptitle(f"FLYMPICS / 50 m Swim / {controller_name} controller", fontsize=16)

    # Swimming pool lane
    pool.set(xlim=(-2, 53), ylim=(-0.6, 1), xlabel="Distance (m)", yticks=[])
    pool.spines[["left", "right", "top"]].set_visible(False)
    # Water background
    pool.add_patch(Rectangle((-2, -0.5), 55, 1.4, facecolor="#e1f0fa", edgecolor="none", zorder=0))
    # Lane ropes (buoys)
    pool.axhline(-0.45, color="#0288d1", linewidth=2, linestyle="-.", zorder=1)
    pool.axhline(0.85, color="#0288d1", linewidth=2, linestyle="-.", zorder=1)
    # Start and finish walls
    pool.axvline(0, color="#343d35", linewidth=2.5, zorder=2)
    pool.axvline(50, color="#d9534f", linewidth=3, linestyle="--", zorder=2)
    pool.text(0, 0.72, "START", fontsize=9, fontweight="bold", zorder=3)
    pool.text(50, 0.72, "FINISH WALL", ha="right", fontsize=9, fontweight="bold", color="#d9534f", zorder=3)
    status = pool.text(0.02, 0.04, "", transform=pool.transAxes, fontsize=11, zorder=4)

    # Swimmer fly graphic
    fly = DrawingArea(70, 48, 0, 0)
    # Water ripple behind swimmer
    fly.add_artist(Ellipse((14, 24), 22, 10, facecolor="#b3daf0", edgecolor="#8ecae6", alpha=0.6))
    # Fly legs positioned for breaststroke / kicking in water
    for x in (23, 33, 43):
        for direction in (-1, 1):
            fly.add_artist(plt.Line2D([x, x - 8], [24, 24 + direction * 15],
                                      color="#343d35", linewidth=1.5))
    # Wings folded or wet
    for y, angle in ((32, 16), (16, -16)):
        fly.add_artist(Ellipse((29, y), 32, 12, angle=angle,
                               facecolor="#cbe5f5", edgecolor="#70a4c2", alpha=0.85))
    fly.add_artist(Ellipse((31, 24), 29, 14, facecolor="#655448"))
    fly.add_artist(Ellipse((47, 24), 17, 16, facecolor="#363d34"))
    fly.add_artist(Ellipse((52, 28), 6, 6, facecolor="#c95a47"))
    athlete = AnnotationBbox(fly, (0, 0.18), frameon=False, zorder=5)
    pool.add_artist(athlete)

    times = np.array([r["simulation_time"] for r in records])
    velocities = np.array([r["velocity"] for r in records])
    history.set(xlim=(0, max(times[-1], 1)), ylim=(0, max(0.6, velocities.max() * 1.2)),
                xlabel="Simulation time (s)", ylabel="Speed in water (m/s)", title="Athlete swimming speed")
    history.spines[["right", "top"]].set_visible(False)
    speed_line, = history.plot([], [], color="#0077b6", linewidth=2)

    neural = controller_name in {"fly", "trained"}
    keys = ("sensory_mean", "intrinsic_mean", "motor_extensor", "motor_flexor")
    labels = ("Sensory input", "VNC interneurons", "Extensor output", "Flexor output")
    colors = ("#4089aa", "#8b71b3", "#3d946d", "#d19543")
    card.set(xlim=(0, 1.23), ylim=(-0.7, 3.7), yticks=range(4),
             yticklabels=labels, xticks=[0, 0.5, 1], xlabel="Mean modeled activity (0–1)",
             title="Circuit activity · MANC nerve cord" if neural else "Circuit activity · unavailable")
    card.invert_yaxis()
    card.spines[["right", "top"]].set_visible(False)
    card.barh(range(4), [1] * 4, color="#e7e9e2", height=0.5)
    bars = card.barh(range(4), [0] * 4, color=colors, height=0.5)
    values = [card.text(1.04, i, "", va="center", fontsize=10) for i in range(4)]
    note = fig.supxlabel("Selected VNC populations, not a whole-brain map. Rates and action mapping are modeled.",
                         fontsize=9, color="#60665d")
    if not neural:
        note.set_text("Baseline controller: no neural model. Activity bars are not applicable.")

    def update(index):
        row = records[index]
        athlete.xy = (row["position"], 0.18)
        athlete.xybox = athlete.xy
        speed_line.set_data(times[:index + 1], velocities[:index + 1])
        ending = ""
        if index == len(records) - 1:
            ending = "  |  FINISHED" if row["distance_to_finish"] <= 0 else "  |  TIME LIMIT"
        status.set_text(f"{row['simulation_time']:5.1f} s   |   {row['position']:.2f} / 50 m   |   "
                        f"{row['velocity']:.2f} m/s   |   {row['action']}{ending}")
        for bar, value, key in zip(bars, values, keys):
            activity = row.get(key)
            bar.set_width(float(activity) if neural and activity is not None else 0)
            value.set_text(f"{activity:.3f}" if neural and activity is not None else "N/A")
        return [athlete, speed_line, status, *bars, *values]

    update(0)
    return fig, update


def animate_swim(records: Sequence[dict], controller_name: str, *, show: bool = True,
                 output: str | Path | None = None) -> None:
    """Display a logged swim or export a compact 5x-speed GIF. Physics stays fixed."""
    from matplotlib.animation import FuncAnimation, PillowWriter

    fig, update = create_swim_activity_view(records, controller_name)
    if output is not None:
        frames = sorted(set([0, *range(4, len(records), 5), len(records) - 1]))
        export = FuncAnimation(fig, update, frames=frames, interval=100, repeat=False)
        export.save(str(output), writer=PillowWriter(fps=10), dpi=85)
        fig.savefig(Path(output).with_suffix(".activity.png"), dpi=130)
    if show:
        playback = FuncAnimation(fig, update, frames=len(records), interval=100, repeat=False)
        paused = False

        def on_key(event):
            nonlocal paused
            if event.key == " ":
                paused = not paused
                playback.pause() if paused else playback.resume()

        fig.canvas.mpl_connect("key_press_event", on_key)
        fig.suptitle(f"FLYMPICS / 50 m Swim / {controller_name} / Space to pause or resume", fontsize=16)
        plt.show()
    plt.close(fig)
