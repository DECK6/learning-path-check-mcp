FROM oven/bun:1 AS build
WORKDIR /app
COPY package.json bun.lock tsconfig.json ./
RUN bun install --frozen-lockfile
COPY src ./src
COPY scripts ./scripts
RUN bun run build

FROM oven/bun:1-slim
WORKDIR /app
ENV NODE_ENV=production PORT=8080
COPY --from=build /app/build ./build
COPY --from=build /app/node_modules ./node_modules
COPY package.json README.md NOTICE.md LICENSE ./
RUN mkdir -p /data && chown bun:bun /data
USER bun
VOLUME ["/data"]
EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=3s CMD bun -e "fetch('http://127.0.0.1:'+(process.env.PORT||8080)+'/health').then(r=>{if(!r.ok)process.exit(1)}).catch(()=>process.exit(1))"
CMD ["bun", "build/server/main.js"]
