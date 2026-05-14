FROM node:22-slim

WORKDIR /app

# Install dependencies first (layer cache)
COPY package*.json ./
RUN npm ci --omit=dev

# Copy app source
COPY . .

# Create data directory for SQLite volume mount
RUN mkdir -p /data

EXPOSE 3000

CMD ["node", "server.js"]
