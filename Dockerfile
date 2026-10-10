FROM node:20-alpine AS client-build
WORKDIR /build/client
COPY client/package*.json ./
RUN npm ci
COPY client/ ./
RUN npm run build

FROM node:20-alpine AS server-build
RUN apk add --no-cache openssl ttf-dejavu
WORKDIR /build/server
COPY server/package*.json ./
RUN npm ci
COPY server/ ./
RUN npx prisma generate
RUN npm run build
RUN cp -R node_modules/.prisma /tmp/generated-prisma-client \
    && npm ci --omit=dev --ignore-scripts --legacy-peer-deps \
    && mkdir -p node_modules/.prisma \
    && cp -R /tmp/generated-prisma-client/. node_modules/.prisma/

FROM node:20-alpine
RUN apk add --no-cache openssl ttf-dejavu
ENV NODE_ENV=production
ENV PORT=5000
ENV DATABASE_URL=file:/data/autocare.db
WORKDIR /app
COPY --from=server-build /build/server/package.json ./server/package.json
COPY --from=server-build /build/server/node_modules ./server/node_modules
COPY --from=server-build /build/server/dist ./server/dist
COPY --from=server-build /build/server/prisma/schema.prisma ./server/prisma/schema.prisma
COPY --from=server-build /build/server/prisma/autocare.db ./seed/autocare.db
COPY --from=client-build /build/client/dist ./client/dist
COPY server/start.sh ./start.sh
RUN chmod +x ./start.sh && mkdir -p /data
EXPOSE 5000
CMD ["./start.sh"]
