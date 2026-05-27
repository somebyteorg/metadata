FROM node:24-alpine3.23 AS builder
WORKDIR /app
COPY /package.json ./
COPY /tsconfig.json ./
COPY /src ./
RUN npm install && npm run build

FROM node:24-alpine3.23
LABEL org.label-schema.name="somebyteorg/metadata" \
      org.label-schema.description="媒体信息抓取" \
      org.label-schema.url="https://github.com/somebyteorg/metadata"

ENV APP_NAME=metadata \
    SERVER_HOST=0.0.0.0 \
    SERVER_PORT=8001 \
    FFPROBE_PATH=/usr/bin/ffprobe

WORKDIR /app
RUN apk add --no-cache ffmpeg
COPY /package.json ./
COPY --from=builder /app/dist ./
RUN npm install --production
CMD [ "node", "/app/main.js" ]
