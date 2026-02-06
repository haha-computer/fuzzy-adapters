import asyncio
import random

import websockets

CONNECTIONS = set()
HEX = "0123456789abcdef"
TICK = 0.02  # 50 digits per second


async def broadcast():
    while True:
        if CONNECTIONS:
            websockets.broadcast(CONNECTIONS, random.choice(HEX))
        await asyncio.sleep(TICK)


async def handler(websocket):
    CONNECTIONS.add(websocket)
    try:
        async for _ in websocket:
            pass
    except websockets.ConnectionClosed:
        pass
    finally:
        CONNECTIONS.discard(websocket)


async def main():
    async with websockets.serve(handler, "0.0.0.0", 8765):
        print("Streaming on ws://0.0.0.0:8765")
        await broadcast()


if __name__ == "__main__":
    asyncio.run(main())
