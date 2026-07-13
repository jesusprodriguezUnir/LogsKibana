# Imagen de producción del frontend: build estático de Vite servido por nginx.
# (El docker-compose sigue usando el dev server de Vite con HMR para desarrollo;
#  este Dockerfile es para despliegues.)
#
# La API se consume same-origin en /api, que nginx reenvía al backend. Ajustar
# VITE_API_URL con --build-arg si se sirve desde otro origen.
FROM node:20-alpine AS build
WORKDIR /app
ARG VITE_API_URL=/api
ENV VITE_API_URL=$VITE_API_URL
COPY frontend/package.json ./
RUN npm install
COPY frontend/ ./
RUN npm run build

FROM nginx:1.27-alpine
COPY infra/docker/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist /usr/share/nginx/html
EXPOSE 80
