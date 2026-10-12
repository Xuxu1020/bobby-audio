FROM node:20-bookworm-slim

# Install system dependencies: ffmpeg, python3, and certificates
RUN apt-get update && apt-get install -y --no-install-recommends \
    ffmpeg \
    python3 \
    ca-certificates \
    curl \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Copy only package.json to avoid Windows lockfile platform conflicts
COPY package.json ./

# Fresh installation for Linux environment
RUN npm install --omit=dev --no-audit --no-fund

# Copy all application files
COPY . .

# Ensure temp directory exists with proper permissions
RUN mkdir -p temp && chmod 777 temp

EXPOSE 3000

ENV PORT=3000
CMD ["npm", "start"]
