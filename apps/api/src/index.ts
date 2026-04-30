import http from "node:http";
import jwt from "jsonwebtoken";
import { createApp } from "./app.js";
import { env } from "./config/env.js";
import { Server } from "socket.io";
import { setPaymentWebhookIo } from "./modules/webhooks/paymentWebhook.service.js";
import { setGuardDogEmitter } from "./lib/guardDog.js";

const app = createApp();
if (env.trustProxy) {
  app.set("trust proxy", 1);
}

const httpServer = http.createServer(app);
const io = new Server(httpServer, {
  path: "/socket.io",
  cors: {
    origin:
      env.socketCorsOrigin === "*"
        ? true
        : env.socketCorsOrigin.split(",").map((s) => s.trim()),
    credentials: true,
  },
});

setPaymentWebhookIo(io);
setGuardDogEmitter((payload) => {
  io.to(`org:${payload.organizationId}`).emit("guard_dog_alert", payload);
});

io.use((socket, next) => {
  const orgId = socket.handshake.auth?.organizationId as string | undefined;
  const token = socket.handshake.auth?.token as string | undefined;
  if (!orgId || !token) {
    next(new Error("organizationId and token required in handshake.auth"));
    return;
  }
  try {
    const decoded = jwt.verify(token, env.jwtSecret) as { sub?: string };
    if (!decoded.sub) {
      next(new Error("Invalid token"));
      return;
    }
    (socket.data as { userId: string; organizationId: string }).userId = decoded.sub;
    (socket.data as { userId: string; organizationId: string }).organizationId = orgId;
    next();
  } catch {
    next(new Error("Unauthorized"));
  }
});

io.on("connection", (socket) => {
  const orgId = (socket.data as { organizationId?: string }).organizationId;
  if (orgId) {
    void socket.join(`org:${orgId}`);
  }
});

httpServer.listen(env.port, () => {
  // eslint-disable-next-line no-console
  console.log(`SecurePay API + Socket.IO on http://localhost:${env.port}`);
});
