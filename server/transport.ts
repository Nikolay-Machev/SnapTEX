import express from "express";
import { withClient } from "./security.js";

export function createTransportApp(
  proxies: string[] = (process.env.SNAPTEX_TRUSTED_PROXIES ?? "")
    .split(",")
    .map((x) => x.trim())
    .filter(Boolean),
) {
  if (
    proxies.some(
      (value) => ["true", "false"].includes(value) || /^\d+$/.test(value),
    )
  )
    throw new Error(
      "SNAPTEX_TRUSTED_PROXIES must contain proxy IP addresses or CIDR subnets.",
    );
  const app = express();
  app.disable("x-powered-by");
  app.set("trust proxy", proxies.length ? proxies : false);
  app.use((req, res, next) => {
    res.setHeader("Cache-Control", "no-store");
    withClient(req.ip ?? req.socket.remoteAddress ?? "unknown", next);
  });
  return app;
}
