import assert from "node:assert/strict";
import { createServer, connect } from "node:net";
import { once } from "node:events";
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";
import { setTimeout as delay } from "node:timers/promises";

let phase = "connect";
const deadline = setTimeout(() => {
  console.error(`Disconnect regression timed out: ${phase}`);
  process.exit(2);
}, 8000);

// Only proxy our local test database. Never disconnect a production session.
const target = new URL(process.env.DATABASE_URL);
assert.ok(["localhost", "127.0.0.1", "[::1]"].includes(target.hostname));
const upstreamAddress = {
  host: target.hostname,
  port: Number(target.port || 5432),
};
const require = createRequire(
  new URL("../../packages/db/package.json", import.meta.url),
);
const entry = require.resolve("postgres");
const postgres =
  process.argv[2] === "cjs"
    ? require("postgres")
    : (await import(pathToFileURL(entry.replace("/cjs/src/", "/src/")).href))
        .default;
let peer;
const sockets = new Set();
const proxy = createServer((client) => {
  peer = client;
  const upstream = connect(upstreamAddress);
  sockets.add(client);
  sockets.add(upstream);
  client.on("error", () => {});
  upstream.on("error", () => client.destroy());
  client.on("close", () => upstream.destroy());
  client.pipe(upstream).pipe(client);
});
proxy.listen(0, "127.0.0.1");
await once(proxy, "listening");
target.hostname = "127.0.0.1";
target.port = String(proxy.address().port);
target.searchParams.set("sslmode", "disable");
const sql = postgres(target.href, {
  max: 1,
  prepare: false,
});
try {
  const reserved = await sql.reserve();
  assert.equal((await reserved`SELECT 1 AS value`)[0].value, 1);
  phase = "close";
  peer.end(); // Clean FIN reproduces the driver's deferred write race.
  await delay(200);
  peer.destroy();
  phase = "reject";
  await assert.rejects(reserved`SELECT 2`, { code: "CONNECTION_CLOSED" });
  console.log("Closed reserved connection rejected safely");
} finally {
  for (const socket of sockets) socket.destroy();
  proxy.close();
  phase = "shutdown";
  await sql.end({ timeout: 0.2 });
  clearTimeout(deadline);
}
