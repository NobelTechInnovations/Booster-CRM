import { createApp } from "./app.js";
import { connectDatabase } from "./config/database.js";
import { env } from "./config/env.js";

async function start() {
  await connectDatabase();

  const app = createApp();

  const server = app.listen(env.port, env.host, () => {
    console.log(`Commerce backend listening on http://${env.host}:${env.port}`);
  });
  const keepAlive = setInterval(() => {}, 60 * 60 * 1000);

  function shutdown(signal) {
    console.log(`${signal} received. Closing backend server.`);
    clearInterval(keepAlive);
    server.close(() => process.exit(0));
  }

  process.on("SIGINT", () => shutdown("SIGINT"));
  process.on("SIGTERM", () => shutdown("SIGTERM"));
}

start().catch((error) => {
  console.error("Backend failed to start");
  console.error(error);
  process.exit(1);
});
