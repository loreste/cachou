import { WebSocketServer } from "ws";
import os from "os";

const MAX_WS_MESSAGE_SIZE = 256 * 1024; // 256 KB
const LOG_LEVEL = process.env.CACHOU_LOG_LEVEL || "info";
const LOG_LEVELS = { debug: 0, info: 1, warn: 2, error: 3 };

function log(level, ...args) {
  if (LOG_LEVELS[level] >= LOG_LEVELS[LOG_LEVEL]) {
    const fn = level === "error" ? console.error : level === "warn" ? console.warn : console.log;
    fn(`[${new Date().toISOString()}] [ws] [${level}]`, ...args);
  }
}

export function setupWebSocket(httpServer) {
  const wss = new WebSocketServer({ noServer: true, maxPayload: MAX_WS_MESSAGE_SIZE });

  httpServer.on("upgrade", (request, socket, head) => {
    const url = new URL(request.url, `http://${request.headers.host}`);
    if (url.pathname === "/ws-api") {
      wss.handleUpgrade(request, socket, head, (ws) => {
        wss.emit("connection", ws, request);
      });
    }
  });

  wss.on("connection", (ws) => {
    log("info", "Client connection opened");

    ws.send(JSON.stringify({
      type: "info",
      message: "Connected to CachouJS Real-Time WebSocket Channel",
      timestamp: new Date().toLocaleTimeString()
    }));

    const timer = setInterval(() => {
      if (ws.readyState === ws.OPEN) {
        const cpus = os.cpus();
        const cpuUsage = cpus.reduce((acc, cpu) => {
          const total = Object.values(cpu.times).reduce((s, t) => s + t, 0);
          return acc + ((total - cpu.times.idle) / total) * 100;
        }, 0) / cpus.length;
        const totalMem = os.totalmem();
        const freeMem = os.freemem();
        const memUsage = ((totalMem - freeMem) / totalMem) * 100;
        ws.send(JSON.stringify({
          type: "metric",
          cpu: cpuUsage.toFixed(1),
          mem: memUsage.toFixed(1),
          timestamp: new Date().toLocaleTimeString()
        }));
      }
    }, 2000);

    function cleanupTimer() {
      clearInterval(timer);
    }

    ws.on("message", async (rawMsg) => {
      const msgStr = rawMsg.toString();
      if (msgStr === "__ping__") {
        ws.send("__pong__");
        return;
      }

      let data;
      try {
        data = JSON.parse(msgStr);
      } catch {
        log("warn", "Received non-JSON message, ignoring");
        return;
      }

      try {
        if (data.type === "db-sync" && data.table) {
          const { syncTable } = await import("./db.js");
          const updatedData = await syncTable(data.table, data.data);

          const payload = JSON.stringify({
            type: "db-sync",
            table: data.table,
            data: updatedData
          });

          wss.clients.forEach((client) => {
            if (client !== ws && client.readyState === ws.OPEN) {
              client.send(payload);
            }
          });
          return;
        }

        if (data.type === "chat") {
          const text = typeof data.text === "string" ? data.text.slice(0, 2000) : "";
          const user = typeof data.user === "string" ? data.user.slice(0, 100) : "User";
          const payload = JSON.stringify({
            type: "chat",
            user,
            text,
            timestamp: new Date().toLocaleTimeString()
          });

          wss.clients.forEach((client) => {
            if (client.readyState === ws.OPEN) {
              client.send(payload);
            }
          });
        }
      } catch (err) {
        log("error", "Message handle error:", err.message);
      }
    });

    ws.on("error", (err) => {
      log("error", "WebSocket error:", err.message);
      cleanupTimer();
    });

    ws.on("close", () => {
      log("info", "Client connection closed");
      cleanupTimer();
    });
  });
}
