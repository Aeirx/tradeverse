import dotenv from "dotenv";
import mongoose from "mongoose";
import connectDB from "./db/index.js";
import { app } from "./app.js";
import { logger } from "./utils/logger.js";

dotenv.config({
  path: "./.env",
});

const PORT = process.env.PORT || 8000;
let server = null;

connectDB()
  .then(() => {
    server = app.listen(PORT, () => {
      logger.info({ port: PORT }, "Server listening");
    });
  })
  .catch((err) => {
    logger.fatal({ err }, "Mongo connection failed at startup");
    process.exit(1);
  });

// --- Graceful shutdown (#36) ---------------------------------------------
// Stop accepting new connections, drain in-flight requests, then close the
// Mongo connection. SIGTERM is what Render/Koyeb/Docker send on deploy;
// SIGINT is what Ctrl+C sends in dev.
const SHUTDOWN_TIMEOUT_MS = 10_000;
let shuttingDown = false;

const shutdown = async (signal) => {
  if (shuttingDown) return;
  shuttingDown = true;
  logger.info({ signal }, "Graceful shutdown initiated");

  // Force-exit if shutdown takes too long (e.g. a hung request).
  const forceTimer = setTimeout(() => {
    logger.error({ timeoutMs: SHUTDOWN_TIMEOUT_MS }, "Force-exiting after timeout");
    process.exit(1);
  }, SHUTDOWN_TIMEOUT_MS);
  forceTimer.unref();

  try {
    if (server) {
      await new Promise((resolve, reject) =>
        server.close((err) => (err ? reject(err) : resolve()))
      );
      logger.info("HTTP server closed");
    }
    await mongoose.connection.close(false);
    logger.info("Mongo connection closed");
    clearTimeout(forceTimer);
    process.exit(0);
  } catch (err) {
    logger.error({ err }, "Error during shutdown");
    process.exit(1);
  }
};

process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));

process.on("unhandledRejection", (reason) => {
  logger.error({ reason }, "Unhandled promise rejection");
});
process.on("uncaughtException", (err) => {
  logger.fatal({ err }, "Uncaught exception — shutting down");
  shutdown("uncaughtException");
});
