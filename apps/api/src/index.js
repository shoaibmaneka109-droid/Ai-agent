require("dotenv").config();

const express = require("express");
const cors = require("cors");

const { env, assertEnvironment } = require("./config/env");
const { requestContext } = require("./shared/middleware/requestContext");
const { healthRouter } = require("./modules/health/health.routes");
const { tenantsRouter } = require("./modules/tenants/tenants.routes");
const { secretsRouter } = require("./modules/secrets/secrets.routes");

assertEnvironment();

const app = express();

app.use(
  cors({
    origin: env.appUrl,
  })
);
app.use(express.json());
app.use(requestContext);

app.get("/", (_req, res) => {
  res.json({
    name: "SecurePay API",
    status: "ok",
    architecture: "modular-multi-tenant",
  });
});

app.use("/health", healthRouter);
app.use("/tenants", tenantsRouter);
app.use("/secrets", secretsRouter);

app.listen(env.port, () => {
  console.log(`SecurePay API listening on port ${env.port}`);
});
