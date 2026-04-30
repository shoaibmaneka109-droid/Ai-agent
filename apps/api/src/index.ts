import { createApp } from "./app.js";
import { env } from "./config/env.js";

const app = createApp();
if (env.trustProxy) {
  app.set("trust proxy", 1);
}

app.listen(env.port, () => {
  // eslint-disable-next-line no-console
  console.log(`SecurePay API listening on http://localhost:${env.port}`);
});
