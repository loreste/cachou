import { WebSocketServer } from "ws";
import os from "os";
import { isDemoMode, assertSafeIdentifier } from "./demo-guard.js";

const MAX_WS_MESSAGE_SIZE = 256 * 1024; // 256 KB
const LOG_LEVEL = process.env.CACHOU_LOG_LEVEL || "info";
const LOG_LEVELS = { debug: 0, info: 1, warn: 2, error: 3 };

function log(level, ...args) {
  if (LOG_LEVELS[level] >= LOG_LEVELS[LOG_LEVEL]) {
    const fn = level === "error" ? console.error : level === "warn" ? console.warn : console.log;
    fn(`[${new Date().toISOString()}] [ws] [${level}]`, ...args);
  }
}

function requestProtocol(request, options = {}) {
  if (options.trustProxy === true) {
    const forwarded = String(request.headers?.["x-forwarded-proto"] || "")
      .split(",")[0]
      .trim()
      .toLowerCase();
    if (forwarded === "http" || forwarded === "https") return `${forwarded}:`;
  }
  return request.socket?.encrypted ? "https:" : "http:";
}

const TRUST_PROXY = process.env.CACHOU_TRUST_PROXY === "1";

/**
 * Reject cross-origin WebSocket upgrades. Missing Origin is rejected by
 * default; non-browser clients must opt in explicitly because this endpoint
 * has no authentication layer of its own.
 */
export function isAllowedWebSocketOrigin(request, options = {}) {
  const origin = request.headers?.origin;
  if (!origin) return options.allowMissingOrigin === true;
  const host = request.headers?.host;
  if (!host) return false;
  try {
    const originUrl = new URL(origin);
    return originUrl.protocol === requestProtocol(request, options) && originUrl.host === host;
  } catch {
    return false;
  }
}

function rejectUpgrade(socket, statusCode, message) {
  try {
    socket.write(
      `HTTP/1.1 ${statusCode} ${message}\r\nConnection: close\r\nContent-Type: text/plain\r\nContent-Length: ${message.length}\r\n\r\n${message}`
    );
  } catch {
    // ignore write failures on half-closed sockets
  }
  try {
    socket.destroy();
  } catch {
    // ignore
  }
}

export function setupWebSocket(httpServer) {
  const wss = new WebSocketServer({ noServer: true, maxPayload: MAX_WS_MESSAGE_SIZE });

  httpServer.on("upgrade", (request, socket, head) => {
    let url;
    try {
      url = new URL(request.url || "/", `http://${request.headers.host || "localhost"}`);
    } catch {
      rejectUpgrade(socket, 400, "Bad Request");
      return;
    }

    if (url.pathname !== "/ws-api") {
      return;
    }

    // Demo WebSocket (chat + db-sync) is privileged — same gate as HTTP demo APIs.
    if (!isDemoMode()) {
      log("warn", "Rejected WebSocket upgrade: demo mode disabled");
      rejectUpgrade(socket, 403, "Forbidden");
      return;
    }

    if (!isAllowedWebSocketOrigin(request, { trustProxy: TRUST_PROXY })) {
      log("warn", "Rejected WebSocket upgrade: origin mismatch", request.headers.origin);
      rejectUpgrade(socket, 403, "Forbidden");
      return;
    }

    wss.handleUpgrade(request, socket, head, ws => {
      wss.emit("connection", ws, request);
    });
  });

  wss.on("connection", ws => {
    log("info", "Client connection opened");

    ws.send(
      JSON.stringify({
        type: "info",
        message: "Connected to CachouJS Real-Time WebSocket Channel",
        timestamp: new Date().toLocaleTimeString()
      })
    );

    const timer = setInterval(() => {
      if (ws.readyState === ws.OPEN) {
        const cpus = os.cpus();
        const cpuUsage =
          cpus.reduce((acc, cpu) => {
            const total = Object.values(cpu.times).reduce((s, t) => s + t, 0);
            return acc + ((total - cpu.times.idle) / total) * 100;
          }, 0) / cpus.length;
        const totalMem = os.totalmem();
        const freeMem = os.freemem();
        const memUsage = ((totalMem - freeMem) / totalMem) * 100;
        ws.send(
          JSON.stringify({
            type: "metric",
            cpu: cpuUsage.toFixed(1),
            mem: memUsage.toFixed(1),
            timestamp: new Date().toLocaleTimeString()
          })
        );
      }
    }, 2000);

    function cleanupTimer() {
      clearInterval(timer);
    }

    ws.on("message", async rawMsg => {
      // Defense in depth: drop privileged messages if demo mode is toggled off mid-process.
      if (!isDemoMode()) {
        log("warn", "Ignoring WebSocket message: demo mode disabled");
        return;
      }

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
          // Table allowlist (throws on unknown / unsafe names)
          let table;
          try {
            table = assertSafeIdentifier(data.table, "table");
          } catch (err) {
            log("warn", "Rejected db-sync table:", data.table, err.message);
            return;
          }
          if (!Array.isArray(data.data)) {
            log("warn", "Rejected db-sync: data must be an array");
            return;
          }
          // Cap payload rows to limit abuse
          if (data.data.length > 500) {
            log("warn", "Rejected db-sync: too many rows");
            return;
          }

          const { syncTable } = await import("./db.js");
          const updatedData = await syncTable(table, data.data);

          const payload = JSON.stringify({
            type: "db-sync",
            table,
            data: updatedData
          });

          wss.clients.forEach(client => {
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

          wss.clients.forEach(client => {
            if (client.readyState === ws.OPEN) {
              client.send(payload);
            }
          });
        }
      } catch (err) {
        log("error", "Message handle error:", err.message);
      }
    });

    ws.on("error", err => {
      log("error", "WebSocket error:", err.message);
      cleanupTimer();
    });

    ws.on("close", () => {
      log("info", "Client connection closed");
      cleanupTimer();
    });
  });
}
