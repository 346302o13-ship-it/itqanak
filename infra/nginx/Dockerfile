FROM nginx:1.27.4-alpine

COPY infra/nginx/nginx.conf /etc/nginx/nginx.conf

# The stock image creates these directories as root. Prepare them at build time
# so Nginx can run entirely as its unprivileged image user at runtime.
RUN mkdir -p /var/cache/nginx/client_temp \
    /var/cache/nginx/proxy_temp \
    /var/cache/nginx/fastcgi_temp \
    /var/cache/nginx/uwsgi_temp \
    /var/cache/nginx/scgi_temp \
    /tmp \
    && chown -R nginx:nginx /var/cache/nginx /tmp

USER nginx

EXPOSE 8080
