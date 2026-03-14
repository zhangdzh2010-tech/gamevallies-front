FROM nginx:alpine
COPY dist/h5 /usr/share/nginx/html
RUN echo 'server { \
    listen 8080; \
    root /usr/share/nginx/html; \
    index index.html; \
    location / { \
        try_files $uri $uri/ /index.html; \
        add_header Cache-Control "no-cache"; \
    } \
    location ~* \.(js|css)$ { \
        add_header Cache-Control "no-cache, must-revalidate"; \
        etag on; \
    } \
    location ~* \.(png|jpg|jpeg|gif|ico|svg|woff|woff2|ttf|eot)$ { \
        expires 30d; \
        add_header Cache-Control "public, immutable"; \
    } \
    gzip on; \
    gzip_types text/plain text/css application/json application/javascript text/xml; \
}' > /etc/nginx/conf.d/default.conf
RUN mkdir -p /opt/application && echo '#!/bin/sh' > /opt/application/run.sh && \
    echo 'nginx -g "daemon off;"' >> /opt/application/run.sh && \
    chmod +x /opt/application/run.sh
EXPOSE 8080
CMD ["nginx", "-g", "daemon off;"]
