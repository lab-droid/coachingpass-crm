# Use the official Node.js alpine image for an optimized, lightweight container
FROM node:20-alpine AS builder

WORKDIR /app

# Copy package files and install ALL dependencies (including devDependencies)
COPY package*.json ./
RUN npm ci

# Copy the rest of the application files
COPY . .

# Run the build script
# This executes `vite build` (creating statics inside dist/)
# and `esbuild server.ts --bundle ... --outfile=dist/server.cjs` (creating full-stack server)
RUN npm run build

# Stage 2: Clean, minimal runner container
FROM node:20-alpine AS runner

WORKDIR /app

# Ensure correct environment variables
ENV NODE_ENV=production
ENV PORT=3000

# Copy package configuration
COPY package*.json ./

# Install only production dependencies to keep the container lightweight
RUN npm ci --only=production

# Copy static assets and backend server from builder
COPY --from=builder /app/dist ./dist

# Expose the application port
EXPOSE 3000

# Command to boot up the Express server
CMD ["npm", "start"]
