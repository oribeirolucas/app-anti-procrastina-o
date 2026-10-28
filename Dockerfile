# Imagem única da aplicação (front-end + API). Usada pela instalação por cliente em deploy/.
# Build: docker build -t plataforma .   (contexto = raiz do repositório)

# ── 1. Compilação (o front-end confere os tipos da API do servidor, então os dois são construídos juntos)
FROM node:22-bookworm-slim AS build
WORKDIR /app
COPY server/package*.json server/
COPY client/package*.json client/
# O segredo "ca" é opcional: só serve para redes com proxy TLS (ex.: ambiente de testes).
RUN --mount=type=secret,id=ca,required=false export NODE_EXTRA_CA_CERTS=/run/secrets/ca \
 && npm ci --prefix server --no-audit --no-fund && npm ci --prefix client --no-audit --no-fund
COPY server/ server/
COPY client/ client/
RUN npm run build --prefix client && npm run build --prefix server && npm prune --omit=dev --prefix server

# ── 2. Execução ───────────────────────────────────────────────
FROM node:22-bookworm-slim
ENV NODE_ENV=production PORT=3000 PASTA_CLIENT=/app/client/dist
WORKDIR /app/server
COPY --from=build /app/server/node_modules ./node_modules
COPY --from=build /app/server/dist ./dist
COPY --from=build /app/server/package.json ./
COPY server/drizzle ./drizzle
COPY --from=build /app/client/dist /app/client/dist
COPY deploy/entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh
USER node
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=30s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:3000/saude').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
ENTRYPOINT ["/entrypoint.sh"]
