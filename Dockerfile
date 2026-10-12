FROM node:20-bookworm-slim

# Install ca-certificates and python3 (Debian 12 Bookworm)
RUN apt-get update && apt-get install -y --no-install-recommends \
    python3 \
    ca-certificates \
    curl \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Copy dependency definitions
COPY package*.json ./

# Install npm dependencies (ffmpeg-static bundles the linux ffmpeg binary)
RUN npm install --omit=dev

# Copy application source
COPY . .

# Create temp folder with write permissions
RUN mkdir -p temp && chmod 777 temp

EXPOSE 3000

ENV PORT=3000
CMD ["npm", "start"]
