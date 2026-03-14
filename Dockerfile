# ---- H5 Build ----
FROM node:20 AS h5-builder
WORKDIR /app
COPY package*.json ./
RUN npm install --legacy-peer-deps
COPY . .
RUN npm run build:h5

# ---- Weapp Build ----
FROM node:20 AS weapp-builder
WORKDIR /app
COPY package*.json ./
RUN npm install --legacy-peer-deps
COPY . .
RUN npm run build:weapp

# ---- Serve H5 ----
FROM nginx:alpine
COPY --from=h5-builder /app/dist/h5 /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf
RUN mkdir -p /opt/application && \
    echo '#!/bin/sh' > /opt/application/run.sh && \
    echo 'nginx -g "daemon off;"' >> /opt/application/run.sh && \
    chmod +x /opt/application/run.sh
EXPOSE 8080
CMD ["nginx", "-g", "daemon off;"]
