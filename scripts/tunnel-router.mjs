// Local router behind the single ngrok tunnel, so one public URL reaches both services:
//   /agent/*  -> LangChain agent server (127.0.0.1:3001), prefix stripped
//   anything else (incl. WebSockets) -> SpacetimeDB (127.0.0.1:3000)
// SpacetimeDB can then call the agent through the public URL (AGENT_URL), since the
// database host blocks requests to loopback/private addresses.
import http from "node:http";
import net from "node:net";

const PORT = Number(process.env.ROUTER_PORT || 8080);
const SPACETIME = { host: "127.0.0.1", port: 3000 };
const AGENT = { host: "127.0.0.1", port: Number(process.env.AGENT_PORT || 3001) };

function route(url = "/") {
  if (url === "/agent" || url.startsWith("/agent/")) return { target: AGENT, path: url.slice("/agent".length) || "/" };
  return { target: SPACETIME, path: url };
}

const server = http.createServer((req, res) => {
  const { target, path } = route(req.url);
  const upstream = http.request(
    { ...target, path, method: req.method, headers: { ...req.headers, host: `${target.host}:${target.port}` } },
    response => {
      res.writeHead(response.statusCode ?? 502, response.headers);
      response.pipe(res);
    },
  );
  upstream.on("error", () => {
    if (!res.headersSent) res.writeHead(502, { "Content-Type": "text/plain" });
    res.end(target === AGENT ? "Agent server is not running (pnpm dev:agent)." : "SpacetimeDB is not running (pnpm start:spacetime).");
  });
  req.pipe(upstream);
});

// WebSocket upgrades (SpacetimeDB subscriptions): pass the raw connection through.
server.on("upgrade", (req, socket, head) => {
  const { target, path } = route(req.url);
  const upstream = net.connect(target.port, target.host, () => {
    const headers = Object.entries({ ...req.headers, host: `${target.host}:${target.port}` })
      .flatMap(([name, value]) => (Array.isArray(value) ? value : [value]).map(v => `${name}: ${v}`));
    upstream.write([`${req.method} ${path} HTTP/1.1`, ...headers, "", ""].join("\r\n"));
    if (head.length) upstream.write(head);
    upstream.pipe(socket).pipe(upstream);
  });
  upstream.on("error", () => socket.destroy());
  socket.on("error", () => upstream.destroy());
});

server.listen(PORT, "127.0.0.1", () => {
  console.log(`Tunnel router on http://127.0.0.1:${PORT}  (/agent/* -> :${AGENT.port}, rest -> :${SPACETIME.port})`);
});
