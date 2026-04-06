const http = require("http");
const fs = require("fs");
const path = require("path");
const { URL } = require("url");
const {
  closeAudioWorker,
  getVolumeState,
  setVolumeLevel,
  setMuteState
} = require("./src/audio");
const { authorizeRequest, getLanAddresses } = require("./src/network");

const HOST = process.env.HOST || "0.0.0.0";
const PORT = Number(process.env.PORT || 3000);
const PUBLIC_DIR = path.join(__dirname, "public");

const MIME_TYPES = {
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml; charset=utf-8"
};

function sendJson(response, statusCode, payload) {
  response.writeHead(statusCode, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store"
  });
  response.end(JSON.stringify(payload));
}

function readRequestBody(request) {
  return new Promise((resolve, reject) => {
    let body = "";

    request.on("data", (chunk) => {
      body += chunk;

      if (body.length > 1024 * 64) {
        reject(new Error("Request body too large"));
        request.destroy();
      }
    });

    request.on("end", () => {
      if (!body) {
        resolve({});
        return;
      }

      try {
        resolve(JSON.parse(body));
      } catch (error) {
        reject(new Error("Invalid JSON body"));
      }
    });

    request.on("error", reject);
  });
}

function serveStaticFile(requestPath, response) {
  const normalizedPath = requestPath === "/" ? "/index.html" : requestPath;
  const safePath = path
    .normalize(normalizedPath)
    .replace(/^([/\\])+/, "")
    .replace(/^(\.\.[/\\])+/, "");
  const filePath = path.join(PUBLIC_DIR, safePath);

  if (!filePath.startsWith(PUBLIC_DIR)) {
    sendJson(response, 403, { error: "Forbidden" });
    return;
  }

  fs.readFile(filePath, (error, content) => {
    if (error) {
      if (error.code === "ENOENT") {
        sendJson(response, 404, { error: "Not found" });
        return;
      }

      sendJson(response, 500, { error: "Failed to load file" });
      return;
    }

    const extension = path.extname(filePath).toLowerCase();

    response.writeHead(200, {
      "Content-Type": MIME_TYPES[extension] || "application/octet-stream",
      "Cache-Control": "no-store"
    });
    response.end(content);
  });
}

async function handleApi(request, response, url) {
  if (request.method === "GET" && url.pathname === "/api/volume") {
    try {
      const state = await getVolumeState();
      sendJson(response, 200, state);
    } catch (error) {
      sendJson(response, 500, {
        error: "Failed to read volume state",
        detail: error.message
      });
    }

    return;
  }

  if (request.method === "POST" && url.pathname === "/api/volume") {
    try {
      const body = await readRequestBody(request);
      const level = Number(body.level);

      if (!Number.isFinite(level) || level < 0 || level > 100) {
        sendJson(response, 400, { error: "Volume level must be between 0 and 100" });
        return;
      }

      const state = await setVolumeLevel(level);
      sendJson(response, 200, state);
    } catch (error) {
      sendJson(response, 500, {
        error: "Failed to set volume",
        detail: error.message
      });
    }

    return;
  }

  if (request.method === "POST" && url.pathname === "/api/mute") {
    try {
      const body = await readRequestBody(request);

      if (typeof body.muted !== "boolean") {
        sendJson(response, 400, { error: "muted must be a boolean" });
        return;
      }

      const state = await setMuteState(body.muted);
      sendJson(response, 200, state);
    } catch (error) {
      sendJson(response, 500, {
        error: "Failed to set mute state",
        detail: error.message
      });
    }

    return;
  }

  sendJson(response, 404, { error: "API route not found" });
}

const server = http.createServer(async (request, response) => {
  const url = new URL(request.url, `http://${request.headers.host || "localhost"}`);

  try {
    const authorization = await authorizeRequest(request);

    if (!authorization.allowed) {
      sendJson(response, 403, {
        error: "Access denied",
        detail: authorization.reason,
        ipAddress: authorization.ipAddress,
        macAddress: authorization.macAddress
      });
      return;
    }
  } catch (error) {
    sendJson(response, 500, {
      error: "Failed to validate device access",
      detail: error.message
    });
    return;
  }

  if (url.pathname.startsWith("/api/")) {
    await handleApi(request, response, url);
    return;
  }

  if (request.method !== "GET" && request.method !== "HEAD") {
    sendJson(response, 405, { error: "Method not allowed" });
    return;
  }

  serveStaticFile(url.pathname, response);
});

server.listen(PORT, HOST, () => {
  console.log(`AudioDeck listening on http://${HOST}:${PORT}`);

  const lanAddresses = getLanAddresses(PORT);

  if (lanAddresses.length > 0) {
    console.log("LAN access URLs:");

    for (const address of lanAddresses) {
      console.log(`  ${address}`);
    }
  } else {
    console.log("No LAN IPv4 addresses were detected.");
  }
});

function shutdown() {
  closeAudioWorker();
}

process.on("exit", shutdown);
process.on("SIGINT", () => {
  shutdown();
  process.exit(0);
});
process.on("SIGTERM", () => {
  shutdown();
  process.exit(0);
});
