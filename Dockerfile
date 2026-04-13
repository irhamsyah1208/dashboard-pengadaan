FROM node:20-slim

# Install Python dan build tools (better-sqlite3 perlu compile)
RUN apt-get update && \
    apt-get install -y python3 python3-pip sqlite3 build-essential && \
    rm -rf /var/lib/apt/lists/*

# Install Python dependencies
RUN pip3 install --break-system-packages pandas openpyxl

WORKDIR /app
COPY package*.json ./
RUN npm install

COPY . .

EXPOSE 3000
CMD ["npm", "start"]