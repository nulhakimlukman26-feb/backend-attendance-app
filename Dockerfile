FROM node:20-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --omit=dev && npm install -g sequelize-cli@6 && npm cache clean --force
COPY . .
ENV NODE_ENV=production
EXPOSE 4017
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:4017/health || exit 1
CMD ["node", "src/index.js"]
