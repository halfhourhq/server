FROM denoland/deno:2.2.2

# Install curl for healthchecks
RUN apt-get update && apt-get install -y curl && rm -rf /var/lib/apt/lists/*

# Create working directory
WORKDIR /app

# Copy source
COPY . .

# Compile the main app
RUN deno cache main.ts

# Run the app
CMD ["deno", "task", "start"]