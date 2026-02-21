# Fuzzy Adapters

Physical-world entropy streamed from two single-board computers to browser-based visualisers.

## Architecture

```
[Coral Dev Board] ──rand tunnel──► wss://rand.haha.computer ──►
                                                                 browser consumers
[Pi Zero 2 W] ──entropy tunnel──► wss://entropy.haha.computer ►
```

- `device/server.py` — WebSocket server (same file runs on both boards). Binds `0.0.0.0:8765`, broadcasts one random hex digit at 50/sec, stirs CPU temperature into the RNG every second.
- `consumers/marquee/` — Ball-pit visualiser (Matter.js). Coral fires from the left, Pi fires from the right. Hosted on Cloudflare Pages (auto-deploys on push to `main`).
- `consumers/pond/` — Experimental second consumer.

## Devices

| Board | Hostname | SSH | Tunnel | server.py |
|-------|----------|-----|--------|-----------|
| Google Coral Dev Board | `indigo-goose` | `ssh -i ~/.config/mdt/keys/mdt.key mendel@192.168.0.61` | `rand` → `wss://rand.haha.computer` | `/home/mendel/server.py` |
| Raspberry Pi Zero 2 W | `rpi.local` | `ssh -i ~/.ssh/id_ed25519_rpi matt@rpi.local` | `entropy` → `wss://entropy.haha.computer` | `/home/matt/server.py` |

Both boards run Python 3 at `/usr/bin/python3`. The Coral is on **Python 3.7** (Mendel Linux), so `device/server.py` must stay compatible — no `X | Y` union syntax, no walrus operator, etc. The `from __future__ import annotations` import at the top handles type hint compatibility.

## Services (systemd, both boards)

- `fuzzy-stream.service` — runs `server.py`, restarts on failure
- `fuzzy-tunnel.service` — runs `cloudflared tunnel run <name>`, depends on `fuzzy-stream`

Both services are enabled and start automatically on boot. To deploy a new `server.py`:

```bash
# Coral
scp -i ~/.config/mdt/keys/mdt.key device/server.py mendel@192.168.0.61:/home/mendel/server.py
ssh -i ~/.config/mdt/keys/mdt.key mendel@192.168.0.61 "sudo systemctl restart fuzzy-stream"

# Pi
scp -i ~/.ssh/id_ed25519_rpi device/server.py matt@rpi.local:/home/matt/server.py
ssh -i ~/.ssh/id_ed25519_rpi matt@rpi.local "sudo systemctl restart fuzzy-stream"
```

## CI

Every PR gets two checks:

- **lint** — ruff, runs on GitHub-hosted Ubuntu
- **hardware-test** — runs on the Pi itself (`rpi-zero2w` self-hosted runner, labels: `self-hosted linux ARM64 rpi`)

`tests/test_hardware.py` covers: temp sensor returns a plausible float, entropy stir functions don't crash, and the WebSocket server streams valid hex digits. Tests use port 8766 so they never touch the live service on 8765.

Don't merge a PR with a failing hardware-test — that check is the ground truth.

## Dev setup

```bash
python3 -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt -r requirements-test.txt
python device/server.py        # runs locally on ws://localhost:8765
pytest tests/ -v               # run hardware tests locally
```
