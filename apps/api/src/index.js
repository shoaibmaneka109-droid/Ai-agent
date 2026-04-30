require("dotenv").config();

const express = require("express");
const cors = require("cors");

const { env, assertEnvironment } = require("./config/env");
const { HttpError, isHttpError } = require("./shared/http/errors");
const { requestContext } = require("./shared/middleware/requestContext");
const { authRouter } = require("./modules/auth/auth.routes");
const { healthRouter } = require("./modules/health/health.routes");
const { tenantsRouter } = require("./modules/tenants/tenants.routes");
const { secretsRouter } = require("./modules/secrets/secrets.routes");
const { autofillRouter } = require("./modules/autofill/autofill.routes");

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

app.use("/auth", authRouter);
app.use("/health", healthRouter);
app.use("/tenants", tenantsRouter);
app.use("/secrets", secretsRouter);
app.use("/autofill", autofillRouter);

app.use((req, _res, next) => {
  next(new HttpError(404, `Route not found: ${req.method} ${req.originalUrl}`));
});

app.use((error, _req, res, _next) => {
  if (isHttpError(error)) {
    return res.status(error.statusCode).json({
      error: error.message,
      details: error.details,
    });
  }

  console.error(error);
  return res.status(500).json({
    error: "Internal server error.",
  });
});

app.listen(env.port, () => {
  console.log(`SecurePay API listening on port ${env.port}`);
});
