FROM node:22-slim

# Install build dependencies for better-sqlite3
RUN apt-get update && apt-get install -y python3 make g++ && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY package*.json ./
RUN npm install

COPY . .

# Use tsx to run the TypeScript server directly without a separate build step
# This ensures it always matches the source mcp_server.ts
CMD ["npx", "tsx", "mcp_server.ts"]
