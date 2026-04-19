# Build: docker build -t cardiology-fleet ./services/fleet-api
FROM node:20-bookworm-slim
RUN apt-get update && apt-get install -y --no-install-recommends ffmpeg ca-certificates && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY package.json ./
RUN npm install
COPY tsconfig.json ./
COPY src ./src
RUN npx tsc -p tsconfig.json
ENV NODE_ENV=production
ENV DATA_DIR=/data
ENV HIPAA_MINIMAL_LOGGING=1
EXPOSE 3001
VOLUME ["/data"]
CMD ["node", "dist/index.js"]
