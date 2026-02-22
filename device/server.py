from __future__ import annotations

import asyncio
import hashlib
import os
import random
import shutil
import struct
import subprocess
import time
from pathlib import Path

import websockets

CONNECTIONS = set()
HEX = "0123456789abcdef"
TICK = 0.02  # interval between individual digits (20 ms = 50 Hz)
BATCH_SIZE = 4  # chars per WebSocket message; one send every TICK * BATCH_SIZE ms
TEMP_INTERVAL = 1.0  # read temperature every second

_temp_cmd = None  # set once at startup


def detect_device():
    """Figure out which device we're running on and how to read its temperature."""
    global _temp_cmd

    coral_path = Path("/sys/class/thermal/thermal_zone0/temp")
    if coral_path.exists():
        _temp_cmd = "coral"
        print(f"[entropy] Coral Dev Board detected ({coral_path})")
        return

    if shutil.which("vcgencmd"):
        _temp_cmd = "rpi"
        print("[entropy] Raspberry Pi detected (vcgencmd)")
        return

    _temp_cmd = None
    print("[entropy] No thermal sensor found — using time-only entropy")


def read_temp() -> float | None:
    """Return CPU temperature in degrees C, or None if unavailable."""
    try:
        if _temp_cmd == "coral":
            raw = Path("/sys/class/thermal/thermal_zone0/temp").read_text().strip()
            return int(raw) / 1000.0  # e.g. 61000 -> 61.0
        if _temp_cmd == "rpi":
            out = subprocess.check_output(
                ["vcgencmd", "measure_temp"], timeout=2
            ).decode()
            # "temp=42.9'C\n" -> 42.9
            return float(out.split("=")[1].split("'")[0])
    except Exception as e:
        print(f"[entropy] temp read failed: {e}")
    return None


def stir_entropy(temp: float | None):
    """Re-seed the RNG by mixing temperature, high-resolution time, and current RNG state."""
    blob = (
        struct.pack("d", time.time())
        + struct.pack("d", time.perf_counter())
        + struct.pack("Q", random.getrandbits(64))
    )
    if temp is not None:
        blob += struct.pack("d", temp)
    blob += os.urandom(8)
    seed = int.from_bytes(hashlib.sha256(blob).digest()[:8], "little")
    random.seed(seed)


async def entropy_loop():
    """Periodically stir temperature into the RNG."""
    while True:
        temp = read_temp()
        stir_entropy(temp)
        if temp is not None:
            print(f"[entropy] {temp:.1f}°C")
        await asyncio.sleep(TEMP_INTERVAL)


async def broadcast():
    while True:
        if CONNECTIONS:
            batch = "".join(random.choice(HEX) for _ in range(BATCH_SIZE))
            websockets.broadcast(CONNECTIONS, batch)
        await asyncio.sleep(TICK * BATCH_SIZE)


async def handler(websocket):
    CONNECTIONS.add(websocket)
    print(f"[stream] client connected ({len(CONNECTIONS)} total)")
    try:
        async for _ in websocket:
            pass
    except websockets.ConnectionClosed:
        pass
    finally:
        CONNECTIONS.discard(websocket)
        print(f"[stream] client disconnected ({len(CONNECTIONS)} total)")


async def main():
    detect_device()
    stir_entropy(read_temp())  # initial stir before we start
    async with websockets.serve(handler, "0.0.0.0", 8765, compression=None):
        print("Streaming on ws://0.0.0.0:8765")
        asyncio.create_task(entropy_loop())
        await broadcast()


if __name__ == "__main__":
    asyncio.run(main())
