import { createServer } from "./server.js";

const port = Number.parseInt(process.env.API_PORT ?? "8787", 10);
const host = process.env.API_HOST ?? "0.0.0.0";
const app = await createServer();

try {
  await app.listen({ host, port });
} catch (error) {
  app.log.error(error);
  process.exit(1);
}
