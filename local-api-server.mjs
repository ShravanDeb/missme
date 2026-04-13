import http from "node:http";
import createRoomHandler from "./api/create-room.js";
import roomStateHandler from "./api/room-state.js";
import saveTokenHandler from "./api/save-token.js";
import tapHandler from "./api/tap.js";

const PORT = Number(process.env.PORT || 3000);
let keepAliveTimer;

const routes = {
  "/api/create-room": createRoomHandler,
  "/api/room-state": roomStateHandler,
  "/api/save-token": saveTokenHandler,
  "/api/tap": tapHandler
};

function sendJson(res, statusCode, payload) {
  if (res.writableEnded) return;
  res.statusCode = statusCode;
  res.setHeader("Content-Type", "application/json");
  res.end(JSON.stringify(payload));
}

function createResponseFacade(nodeRes) {
  const facade = {
    setHeader(name, value) {
      nodeRes.setHeader(name, value);
      return facade;
    },
    status(statusCode) {
      return {
        json(payload) {
          sendJson(nodeRes, statusCode, payload);
        }
      };
    },
    json(payload) {
      sendJson(nodeRes, nodeRes.statusCode || 200, payload);
    }
  };

  return facade;
}

async function parseBody(req) {
  if (req.method === "GET" || req.method === "HEAD") return undefined;

  const chunks = [];
  for await (const chunk of req) {
    chunks.push(chunk);
  }

  if (!chunks.length) return undefined;
  const raw = Buffer.concat(chunks).toString("utf8");
  if (!raw.trim()) return undefined;

  try {
    return JSON.parse(raw);
  } catch {
    return raw;
  }
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url || "/", "http://localhost");
  const handler = routes[url.pathname];

  if (!handler) {
    return sendJson(res, 404, { error: "Route not found" });
  }

  try {
    const body = await parseBody(req);
    const requestFacade = {
      method: req.method,
      headers: req.headers,
      body,
      url: req.url,
      query: Object.fromEntries(url.searchParams.entries())
    };

    await handler(requestFacade, createResponseFacade(res));

    if (!res.writableEnded) {
      sendJson(res, 204, {});
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unexpected local API error";
    sendJson(res, 500, { error: message });
  }
});

server.on("error", (error) => {
  if (error && typeof error === "object" && "code" in error && error.code === "EADDRINUSE") {
    console.log(`Port ${PORT} is already in use. Assuming local API server is already running.`);
    keepAliveTimer = setInterval(() => {}, 1 << 30);
    return;
  }

  console.error(error);
  process.exit(1);
});

server.listen(PORT, () => {
  console.log(`Local API server listening on http://localhost:${PORT}`);
});

process.on("SIGINT", () => {
  if (keepAliveTimer) clearInterval(keepAliveTimer);
  process.exit(0);
});

process.on("SIGTERM", () => {
  if (keepAliveTimer) clearInterval(keepAliveTimer);
  process.exit(0);
});
