import "dotenv/config";
import http from "node:http";
import { createHTTPServer } from "@trpc/server/adapters/standalone";
import { appRouter } from "./router/index.js";

const server = createHTTPServer({
  router: appRouter,
});

const port = Number(process.env.PORT) || 3000;
server.listen(port);
console.log(`tRPC server rodando em http://localhost:${port}`);
