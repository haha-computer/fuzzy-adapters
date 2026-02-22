const { Engine, Bodies, Body, Composite } = Matter;
const canvas = document.getElementById("c");
const ctx = canvas.getContext("2d");
const MAX_BODIES = 200;
const R = 16;
const FONT = `700 ${R * 1.1}px system-ui, -apple-system, sans-serif`;

const STREAMS = [
  { url: "wss://rand.haha.computer", side: "left" },
  { url: "wss://entropy.haha.computer", side: "right" },
];

const BALL_COLORS = [
  "#e74c3c", "#e55b8c", "#f39c12", "#f1c40f",
  "#2ecc71", "#1abc9c", "#3498db", "#5b6be7",
  "#9b59b6", "#e67e22", "#1dd1a1", "#ff6b6b",
  "#48dbfb", "#feca57", "#ff9ff3", "#54a0ff",
];

let W, H;
let bg;
let digitColor;

const engine = Engine.create({
  gravity: { x: 0, y: 1.2 },
  enableSleeping: true,
});
engine.positionIterations = 4;
engine.velocityIterations = 4;
engine.constraintIterations = 2;
const digitBodies = [];
const digitQueue = { left: [], right: [] };
const MAX_PER_FRAME = 3;

function refreshTheme() {
  const styles = getComputedStyle(document.documentElement);
  bg = styles
    .getPropertyValue("--bg")
    .trim();
  digitColor = styles
    .getPropertyValue("--digit")
    .trim();
}

function resize() {
  W = window.innerWidth;
  H = window.innerHeight;
  canvas.width = W;
  canvas.height = H;
}

window.addEventListener("resize", resize);
window.matchMedia("(prefers-color-scheme: dark)")
  .addEventListener("change", refreshTheme);
refreshTheme();
resize();

function fireDigit(ch, side) {
  while (digitBodies.length >= MAX_BODIES) {
    const old = digitBodies.shift();
    if (old) {
      Composite.remove(engine.world, old);
    }
  }

  const y = H * 0.4 + (Math.random() - 0.5) * 60;
  const fromLeft = side === "left";
  const startX = fromLeft ? -R : W + R;

  const body = Bodies.circle(startX, y, R, {
    restitution: 0.5,
    friction: 0.3,
    frictionAir: 0.008,
    density: 0.003,
    label: ch,
  });

  const speed = 18 + Math.random() * 10;
  const angle = (Math.random() - 0.5) * 0.9;
  const dir = fromLeft ? 1 : -1;
  Body.setVelocity(body, {
    x: dir * speed * Math.cos(angle),
    y: speed * Math.sin(angle) - 2,
  });

  body._color = BALL_COLORS[Math.floor(Math.random() * BALL_COLORS.length)];
  Composite.add(engine.world, body);
  digitBodies.push(body);
}

function cull() {
  for (let i = digitBodies.length - 1; i >= 0; i--) {
    const b = digitBodies[i];
    if (b.position.y > H + R * 2 || b.position.x > W + R * 2 || b.position.x < -R * 2) {
      Composite.remove(engine.world, b);
      digitBodies.splice(i, 1);
    }
  }
}

let lastTime = null;

function draw(now) {
  const delta = lastTime !== null ? Math.min(now - lastTime, 16.6) : 16.6;
  lastTime = now;
  Engine.update(engine, delta);

  for (const side of ["left", "right"]) {
    const q = digitQueue[side];
    const n = Math.min(q.length, MAX_PER_FRAME);
    for (let i = 0; i < n; i++) fireDigit(q.shift(), side);
  }

  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, W, H);

  cull();

  ctx.font = FONT;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";

  for (const b of digitBodies) {
    const x = b.position.x;
    const y = b.position.y;

    // ball
    ctx.beginPath();
    ctx.arc(x, y, R, 0, Math.PI * 2);
    ctx.fillStyle = b._color;
    ctx.fill();

    // digit
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(b.angle);
    ctx.fillStyle = digitColor;
    ctx.fillText(b.label, 0, 1);
    ctx.restore();
  }

  requestAnimationFrame(draw);
}

requestAnimationFrame(draw);

// --- WebSocket connections ---

const streamsEl = document.getElementById("streams");

function createConnection(stream) {
  const dot = document.createElement("div");
  dot.className = "status disconnected";
  dot.setAttribute("aria-label", "disconnected");
  dot.setAttribute("title", "disconnected");
  streamsEl.appendChild(dot);

  const conn = {
    ws: null,
    reconnectTimer: null,
    lastData: 0,
  };

  function setStatus(text, className) {
    dot.setAttribute("aria-label", text);
    dot.setAttribute("title", text);
    dot.className = "status " + className;
  }

  function scheduleReconnect() {
    if (conn.reconnectTimer) return;
    conn.reconnectTimer = setTimeout(() => {
      conn.reconnectTimer = null;
      connect();
    }, 2000);
  }

  function connect() {
    if (conn.ws && (conn.ws.readyState === WebSocket.OPEN || conn.ws.readyState === WebSocket.CONNECTING)) {
      conn.ws.onclose = null;
      conn.ws.onerror = null;
      conn.ws.close();
    }

    const socket = new WebSocket(stream.url);
    conn.ws = socket;

    socket.onopen = () => {
      setStatus(`streaming from ${stream.url}`, "connected");
      conn.lastData = Date.now();
    };

    socket.onmessage = (e) => {
      if (document.hidden) return;
      for (const ch of e.data) {
        digitQueue[stream.side].push(ch);
      }
      conn.lastData = Date.now();
    };

    socket.onclose = () => {
      if (socket !== conn.ws) return;
      setStatus("disconnected \u2014 reconnecting...", "disconnected");
      scheduleReconnect();
    };

    socket.onerror = () => {
      if (socket !== conn.ws) return;
      socket.close();
    };
  }

  setInterval(() => {
    if (conn.lastData && Date.now() - conn.lastData > 5000) {
      conn.lastData = 0;
      connect();
    }
  }, 2000);

  connect();
}

STREAMS.forEach(createConnection);
