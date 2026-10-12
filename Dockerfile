FROM node:20-bookworm

WORKDIR /app

# Copy dependency files
COPY package.json ./

# Install dependencies (unsafe-perm ensures npm allows scripts as root in container)
RUN npm install --omit=dev --unsafe-perm=true --no-audit

# Copy app code
COPY . .

# Ensure temp directory exists
RUN mkdir -p temp && chmod 777 temp

EXPOSE 3000

ENV PORT=3000
CMD ["npm", "start"]
