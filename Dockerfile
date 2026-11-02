FROM node:22-slim
WORKDIR /app
COPY package*.json ./
RUN npm install --include=dev --legacy-peer-deps --no-audit --no-fund
COPY . .
RUN npm run build
ENV NODE_ENV=production
EXPOSE 10000
CMD ["npm", "start"]
