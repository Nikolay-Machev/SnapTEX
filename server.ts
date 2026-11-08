import express from "express";
import type { ServerBuild } from "react-router";
import { pathToFileURL } from "node:url";
import { resolve } from "node:path";
import { createRequestHandler } from "@react-router/express";
import { createTransportApp } from "./server/transport.js";

const app = createTransportApp();
const development = process.argv.includes("--dev");
if (development) {
  const vite = await import("vite").then(({ createServer }) =>
    createServer({ server: { middlewareMode: true } }),
  );
  app.use(vite.middlewares);
  app.use(
    createRequestHandler({
      build: async () =>
        (await vite.ssrLoadModule(
          "virtual:react-router/server-build",
        )) as ServerBuild,
      mode: "development",
    }),
  );
} else {
  app.use(
    "/assets",
    express.static("build/client/assets", { immutable: true, maxAge: "1y" }),
  );
  app.use(express.static("build/client", { maxAge: "1h" }));
  app.use(
    createRequestHandler({
      build: await import(pathToFileURL(resolve("build/server/index.js")).href),
      mode: "production",
    }),
  );
}
const server = app.listen(Number(process.env.PORT ?? 3000), "0.0.0.0", () =>
  console.log(
    "SnapTEX listening on port",
    (server.address() as import("node:net").AddressInfo).port,
  ),
);
server.requestTimeout = 120000;
server.headersTimeout = 30000;
