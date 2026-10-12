FROM node:20-bullseye-slim

# Install system dependencies including ffmpeg and python
RUN apt-get update && apt-get install -y --no-install-recommends \
    ffmpeg \
    python3 \
    ca-certificates \
    curl \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Copy dependency definitions
COPY package*.json ./

# Install npm dependencies
RUN npm install --omit=dev

# Copy application source
COPY . .

# Create temp folder with write permissions
RUN mkdir -p temp && chmod 777 temp

EXPOSE 3000

ENV PORT=3000
CMD ["npm", "start"]
