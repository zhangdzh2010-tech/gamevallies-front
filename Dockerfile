FROM nginx:alpine
COPY dist/h5 /usr/share/nginx/html
# 预读所有静态文件，避免 FaaS overlay 文件系统懒加载导致首次 I/O 超时
RUN find /usr/share/nginx/html -type f -exec cat {} + > /dev/null
RUN echo 'server { \
    listen 8080; \
    sendfile off; \
    aio threads; \
    root /usr/share/nginx/html; \
    index index.html; \
    location / { \
        try_files $uri $uri/ /index.html; \
    } \
    location ~* \.(js|css|png|jpg|jpeg|gif|ico|svg|woff|woff2|ttf|eot)$ { \
        expires -1; \
        add_header Cache-Control "no-cache, no-store, must-revalidate"; \
    } \
    gzip on; \
    gzip_types text/plain text/css application/json application/javascript text/xml; \
}' > /etc/nginx/conf.d/default.conf
EXPOSE 8080
CMD ["nginx", "-g", "daemon off;"]
