FROM node:22-alpine AS app-build
WORKDIR /app
COPY workspace/package*.json ./workspace/
ENV PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1
RUN cd workspace && npm install --include=dev --include=optional
COPY workspace ./workspace
RUN cd workspace && npm run build

FROM node:22-alpine AS production
WORKDIR /app
ENV NODE_ENV=production
COPY backend/package*.json ./backend/
RUN cd backend && npm install --omit=dev && npm cache clean --force
COPY --chown=node:node backend ./backend
COPY --from=app-build --chown=node:node /app/frontend ./frontend
WORKDIR /app/backend
EXPOSE 5000
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD wget -qO- http://127.0.0.1:5000/api/health/live >/dev/null || exit 1
USER node
CMD ["node", "server.js"]
