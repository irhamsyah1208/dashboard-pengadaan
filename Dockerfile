FROM node:20-slim

# Install Python 3 dan pip
RUN apt-get update && \
    apt-get install -y python3 python3-pip sqlite3 && \
    rm -rf /var/lib/apt/lists/*

# Install Python dependencies
RUN pip3 install --break-system-packages pandas openpyxl

# Set workdir
WORKDIR /app

# Copy package files dan install Node dependencies
COPY package*.json ./
RUN npm install

# Copy semua file
COPY . .

# Expose port
EXPOSE 3000

# Start server
CMD ["npm", "start"]