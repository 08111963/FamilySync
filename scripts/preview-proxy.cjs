/**
 * Ponte anteprima Replit: ascolta su 8081 (porta esterna 80 dell'anteprima)
 * e inoltra TUTTO al backend Express su 5000 (inclusi i WebSocket).
 *
 * Perché: la mappatura ports in .replit viene rigenerata dalla piattaforma
 * (stack EXPO) con 80→8081, quindi non possiamo puntare l'esterna 80 sul
 * backend. Se su 8081 gira Metro, l'anteprima serve un bundle dev (spesso
 * stantio) e le rotte /api (es. OAuth Google) rispondono HTML rompendo il
 * login. Questo proxy rende l'anteprima identica alla produzione.
 */
const http = require("http");
const net = require("net");

const TARGET_HOST = "127.0.0.1";
const TARGET_PORT = Number(process.env.BACKEND_PORT || 5000);
const LISTEN_PORT = Number(process.env.PROXY_PORT || 8081);

const server = http.createServer((req, res) => {
  const upstream = http.request(
    { host: TARGET_HOST, port: TARGET_PORT, path: req.url, method: req.method, headers: req.headers },
    (up) => {
      res.writeHead(up.statusCode || 502, up.headers);
      up.pipe(res);
    }
  );
  upstream.on("error", (err) => {
    if (!res.headersSent) res.writeHead(502, { "content-type": "text/plain; charset=utf-8" });
    res.end("Backend non raggiungibile (porta " + TARGET_PORT + "): " + err.code);
  });
  req.pipe(upstream);
});

// Inoltro WebSocket (invalidazioni realtime dell'app).
server.on("upgrade", (req, clientSocket, head) => {
  const upstreamSocket = net.connect(TARGET_PORT, TARGET_HOST, () => {
    let raw = `${req.method} ${req.url} HTTP/1.1\r\n`;
    for (let i = 0; i < req.rawHeaders.length; i += 2) {
      raw += `${req.rawHeaders[i]}: ${req.rawHeaders[i + 1]}\r\n`;
    }
    raw += "\r\n";
    upstreamSocket.write(raw);
    if (head && head.length) upstreamSocket.write(head);
    clientSocket.pipe(upstreamSocket);
    upstreamSocket.pipe(clientSocket);
  });
  const destroyBoth = () => {
    clientSocket.destroy();
    upstreamSocket.destroy();
  };
  upstreamSocket.on("error", destroyBoth);
  clientSocket.on("error", destroyBoth);
});

server.listen(LISTEN_PORT, "0.0.0.0", () => {
  console.log(`[preview-proxy] 0.0.0.0:${LISTEN_PORT} -> ${TARGET_HOST}:${TARGET_PORT}`);
});
