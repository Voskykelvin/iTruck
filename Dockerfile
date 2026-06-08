FROM node:22-alpine AS app-build
WORKDIR /app
COPY workspace/package*.json ./workspace/
RUN cd workspace && npm ci
COPY workspace ./workspace
RUN cd workspace && npm run build

FROM node:22-alpine AS production
WORKDIR /app
ENV NODE_ENV=production
COPY backend/package*.json ./backend/
RUN cd backend && npm ci --omit=dev && npm cache clean --force
COPY --chown=node:node backend ./backend
COPY --chown=node:node frontend ./frontend
COPY --from=app-build --chown=node:node /app/frontend/app ./frontend/app
WORKDIR /app/backend
EXPOSE 5000
USER node
CMD ["node", "server.js"]
