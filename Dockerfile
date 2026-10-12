FROM node:20-bookworm-slim

# Install ffmpeg, python3, ca-certificates, and symlink python3 to python
RUN apt-get update && apt-get install -y --no-install-recommends \
    ffmpeg \
    python3 \
    python-is-python3 \
    ca-certificates \
    curl \
    && ln -sf /usr/bin/python3 /usr/bin/python \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Copy package.json
COPY package.json ./

# Install npm dependencies
RUN npm install --omit=dev --no-audit --no-fund

# Copy all source files
COPY . .

# Ensure temp directory exists with proper permissions
RUN mkdir -p temp && chmod 777 temp

EXPOSE 3000

ENV PORT=3000
CMD ["npm", "start"]
