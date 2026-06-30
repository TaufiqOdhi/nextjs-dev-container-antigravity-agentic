FROM node:20-bookworm

# Install dependencies including inotify-tools for the watcher
RUN apt update && apt install -y \
    git \
    openssh-client \
    curl \
    inotify-tools \
    && rm -rf /var/lib/apt/lists/*

# Install Antigravity CLI as node user
RUN curl -fsSL https://antigravity.google/cli/install.sh | bash

# Set working directory to /app
WORKDIR /app

# Copy package files and install dependencies (cached layer)
COPY package.json package-lock.json* ./
RUN npm install

# Create required directories with proper ownership
RUN mkdir -p /home/node/.gemini /home/node/.ssh \
    /app/tasks/inbox /app/tasks/done /app/tasks/failed /app/tasks/logs && \
    chown -R node:node /home/node /app/tasks

# Copy entrypoint (will be overridden by bind mount at runtime — that's intentional
# so changes to entrypoint.sh don't require a rebuild)
COPY entrypoint.sh /app/entrypoint.sh

# Ensure node user owns the working directory
RUN chown -R node:node /app

# Run container as non-root node user (UID 1000)
USER node

# Expose Next.js default port
EXPOSE 3000

# Entrypoint handles npm install on boot, then runs the CMD
ENTRYPOINT ["bash", "/app/entrypoint.sh"]
CMD ["npm", "run", "dev"]
