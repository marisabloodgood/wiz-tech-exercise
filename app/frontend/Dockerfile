FROM nginx:alpine
COPY dist/ /usr/share/nginx/html
# basic SPA routing
RUN rm /etc/nginx/conf.d/default.conf
COPY nginx.conf /etc/nginx/conf.d/default.conf