FROM node:18-bullseye

# Install Python and required packages
RUN apt-get update && apt-get install -y \
    python3 \
    python3-pip \
    && rm -rf /var/lib/apt/lists/*

# Install Python ESPN API
RUN pip3 install espn-api

# Set working directory
WORKDIR /app

# Copy and install server dependencies
COPY server/package*.json ./server/
WORKDIR /app/server
RUN npm install

# Copy server code
COPY server/ ./

# Expose port
EXPOSE 8081

# Start the application
CMD ["npm", "start"]
