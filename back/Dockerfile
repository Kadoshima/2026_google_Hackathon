FROM node:20-slim AS build

WORKDIR /workspace/back

# local dependency "file:../shared" is required at install time
COPY shared /workspace/shared
COPY back/package.json back/package-lock.json ./
RUN npm ci

COPY back ./
RUN npm run build && npm prune --omit=dev

FROM node:20-slim AS runtime

WORKDIR /app
ENV NODE_ENV=production

COPY --from=build /workspace/back/package.json /workspace/back/package-lock.json ./
COPY --from=build /workspace/back/node_modules ./node_modules
COPY --from=build /workspace/back/dist ./dist

EXPOSE 8080
CMD ["node", "dist/index.js"]
