import { WebSocketServer } from "ws";

export function setupWebSocket(httpServer) {
  const wss = new WebSocketServer({ noServer: true });

  // Handle upgrade of HTTP requests to WebSocket connection on '/ws-api'
  httpServer.on("upgrade", (request, socket, head) => {
    const url = new URL(request.url, `http://${request.headers.host}`);
    if (url.pathname === "/ws-api") {
      wss.handleUpgrade(request, socket, head, (ws) => {
        wss.emit("connection", ws, request);
      });
    }
  });

  wss.on("connection", (ws) => {
    console.log("⚡ [CachouJS WS] Client connection opened");

    // Welcome message
    ws.send(JSON.stringify({
      type: "info",
      message: "Connected to CachouJS Real-Time WebSocket Channel",
      timestamp: new Date().toLocaleTimeString()
    }));

    // Broadcast system logs / metrics to this socket periodically
    const timer = setInterval(() => {
      if (ws.readyState === ws.OPEN) {
        const cpu = (Math.random() * 8 + 2).toFixed(1);
        const mem = (Math.random() * 5 + 32).toFixed(1);
        ws.send(JSON.stringify({
          type: "metric",
          cpu,
          mem,
          timestamp: new Date().toLocaleTimeString()
        }));
      }
    }, 2000);

    ws.on("message", async (rawMsg) => {
      const msgStr = rawMsg.toString();
      if (msgStr === "__ping__") {
        ws.send("__pong__");
        return;
      }

      try {
        const data = JSON.parse(msgStr);
        
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
          // Broadcast to all connected clients
          const payload = JSON.stringify({
            type: "chat",
            user: data.user || "User",
            text: data.text,
            timestamp: new Date().toLocaleTimeString()
          });

          wss.clients.forEach((client) => {
            if (client.readyState === ws.OPEN) {
              client.send(payload);
            }
          });
        }
      } catch (err) {
        console.error("⚡ [CachouJS WS] Message handle error:", err.message);
      }
    });

    ws.on("close", () => {
      console.log("⚡ [CachouJS WS] Client connection closed");
      clearInterval(timer);
    });
  });
}
