# Nova Clipping website, production server (Oracle Cloud VM, ARM64).
FROM node:20-bookworm-slim
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1
COPY package.json package-lock.json ./
RUN npm install --no-audit --no-fund
COPY . .
RUN npm run build
ENV NODE_ENV=production PORT=3000
EXPOSE 3000
# data/ (settings, connections), storage/ (videos) and inbox/ are mounted from the VM.
CMD ["npm", "start"]
