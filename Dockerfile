FROM node:20-alpine AS app-build
WORKDIR /app
COPY workspace/package*.json ./workspace/
RUN cd workspace && npm ci
COPY workspace ./workspace
RUN cd workspace && npm run build

FROM node:20-alpine AS production
WORKDIR /app
ENV NODE_ENV=production
COPY backend/package*.json ./backend/
RUN cd backend && npm ci --omit=dev
COPY backend ./backend
COPY frontend ./frontend
COPY --from=app-build /app/frontend/app ./frontend/app
WORKDIR /app/backend
EXPOSE 5000
CMD ["node", "server.js"]
