FROM node:22-alpine AS build
WORKDIR /app
COPY package.json package-lock.json* ./
RUN npm ci --omit=dev --ignore-scripts

FROM node:22-alpine AS runtime
WORKDIR /app
RUN addgroup -S sonar && adduser -S sonar -G sonar
COPY --from=build /app/node_modules ./node_modules
COPY src/ ./src/
COPY package.json ./
USER sonar
EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://127.0.0.1:8080/health || exit 1
ENV SONARQUBE_HTTP_PORT=8080
ENV SONARQUBE_HTTP_HOST=0.0.0.0
ENV SONARQUBE_TRANSPORT=http
CMD ["node", "src/index.mjs"]
