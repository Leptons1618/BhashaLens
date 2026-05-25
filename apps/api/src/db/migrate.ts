import { closeDbContext, createDbContext } from "./client.js";

export function migrate(): void {
  const context = createDbContext();
  closeDbContext(context);
}

migrate();
console.log("Database schema is ready.");
