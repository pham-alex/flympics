"""Local-only website showing recorded output from the real Python simulations."""
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
import argparse
import json

from experiments.run_sprint import run as run_sprint
from experiments.run_swim import run as run_swim
from brain.connectome import load_manc_front_leg_circuit


def viewer_payload(seed: int, event: str = "sprint") -> dict:
    circuit = load_manc_front_leg_circuit()
    edges = circuit.weights.tocoo()
    sprint_runs = {name: run_sprint(name, seed, record_activity=True)
                   for name in ('trained', 'fly', 'rule', 'random')}
    swim_runs = {name: run_swim(name, seed, record_activity=True)
                 for name in ('trained', 'fly', 'rule', 'random')}
    return {
        'seed': seed,
        'event': event,
        'circuit': {
            'nodes': [dict(id=node_id, role=role, cell_type=cell_type)
                      for node_id, role, cell_type in zip(circuit.neuron_ids, circuit.roles, circuit.cell_types)],
            'edges': [dict(pre=int(pre), post=int(post), weight=float(weight))
                      for pre, post, weight in zip(edges.col, edges.row, edges.data)],
        },
        'runs': sprint_runs if event == "sprint" else swim_runs,
        'events': {
            'sprint': {'distance': 100.0, 'name': '100 m sprint', 'runs': sprint_runs},
            'swim': {'distance': 50.0, 'name': '50 m swim', 'runs': swim_runs},
        },
    }


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--port', type=int, default=8000)
    parser.add_argument('--seed', type=int, default=7)
    parser.add_argument('--event', choices=('sprint', 'swim'), default='sprint')
    args = parser.parse_args()
    payload = json.dumps(viewer_payload(args.seed, args.event), allow_nan=False).encode('utf-8')

    class Handler(SimpleHTTPRequestHandler):
        def end_headers(self):
            self.send_header('Cache-Control', 'no-cache, no-store, must-revalidate')
            self.send_header('Pragma', 'no-cache')
            self.send_header('Expires', '0')
            super().end_headers()

        def do_GET(self):
            if self.path.startswith('/runs.json'):
                self.send_response(200)
                self.send_header('Content-Type', 'application/json')
                self.send_header('Content-Length', str(len(payload)))
                self.end_headers()
                self.wfile.write(payload)
            else:
                super().do_GET()

    directory = Path(__file__).resolve().parents[1] / 'visualization' / 'web'
    server = ThreadingHTTPServer(('127.0.0.1', args.port), partial(Handler, directory=str(directory)))
    print(f'Flympics website: http://localhost:{args.port} (Ctrl+C to stop)', flush=True)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        server.server_close()


if __name__ == '__main__':
    main()
