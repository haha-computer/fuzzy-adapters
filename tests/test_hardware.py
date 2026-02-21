"""
Hardware integration tests — run on self-hosted Pi runner.
Tests start an isolated server instance on port 8766 so they never
interfere with the live fuzzy-stream.service on port 8765.
"""

import asyncio
import sys
import os

import pytest
import websockets

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
import device.server as srv


# ── Sensor tests ─────────────────────────────────────────────────────────────

def test_detect_device_runs():
    srv.detect_device()


def test_read_temp_type():
    srv.detect_device()
    temp = srv.read_temp()
    assert temp is None or isinstance(temp, float)


def test_read_temp_plausible():
    """Temperature should be in a sane range if the sensor is readable."""
    srv.detect_device()
    temp = srv.read_temp()
    if temp is not None:
        assert 0.0 < temp < 100.0, f"Temperature {temp}°C looks wrong"


def test_stir_entropy_with_temp():
    srv.stir_entropy(55.0)


def test_stir_entropy_without_temp():
    srv.stir_entropy(None)


# ── WebSocket integration test ────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_server_streams_hex_digits():
    """
    Start the handler + broadcast loop on port 8766 and verify we
    receive a stream of valid hex digits with some variety.
    """
    async with websockets.serve(srv.handler, "127.0.0.1", 8766):
        async with websockets.connect("ws://127.0.0.1:8766") as ws:
            broadcast_task = asyncio.create_task(srv.broadcast())
            try:
                received = set()
                for _ in range(20):
                    msg = await asyncio.wait_for(ws.recv(), timeout=2.0)
                    assert msg in srv.HEX, f"Got unexpected message: {msg!r}"
                    received.add(msg)
                # With 20 samples at random we expect more than one unique digit
                assert len(received) > 1, "Stream shows no variety — RNG may be broken"
            finally:
                broadcast_task.cancel()
