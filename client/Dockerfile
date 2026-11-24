# ---- build the static bundle
FROM node:20-alpine AS build
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

# ---- serve over HTTPS with Nginx, which also reverse-proxies the API
FROM nginx:1.27-alpine
RUN apk add --no-cache openssl
COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY docker-entrypoint-tls.sh /docker-entrypoint.d/10-leap-tls.sh
RUN sed -i 's/\r$//' /docker-entrypoint.d/10-leap-tls.sh && chmod +x /docker-entrypoint.d/10-leap-tls.sh
COPY --from=build /app/dist /usr/share/nginx/html
EXPOSE 80 443
HEALTHCHECK --interval=15s --timeout=3s CMD wget --no-check-certificate -qO- https://127.0.0.1/ >/dev/null || exit 1
