FROM nginx:1.28-alpine
COPY ./nginx.conf /etc/nginx/conf.d/default.conf
COPY ./cert.pem /etc/ssl/certs/
COPY ./key.pem /etc/ssl/private/
RUN rm -rf /usr/share/nginx/html/*d