# ---- Base image ----
FROM oven/bun

# Workdir inside container
WORKDIR /app

# Copy dependency manifests
COPY package.json bun.lockb* ./

# Install dependencies (prod only)
RUN bun install --production

# Copy source code and config
COPY src ./src
COPY config.json ./config.json
# COPY public ./public (There is no pulblic directory rn)

# Create data directory for SQLite
RUN mkdir -p /app/data

# Expose tracker port
EXPOSE 3000

# Environment defaults (can be overridden by compose)
ENV TRACKER_HOST=0.0.0.0
ENV TRACKER_PORT=3000

# Start the server
CMD ["bun", "src/server.ts"]

