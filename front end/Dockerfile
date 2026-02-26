# Dockerfile optimisé pour Railway - évite le timeout Nixpacks (10 min)
# Utilise l'image Node officielle, build beaucoup plus rapide que nix-env
FROM node:20-bookworm-slim

WORKDIR /app

# Copier les fichiers de dépendances
COPY package.json package-lock.json* ./

# Installer les dépendances
RUN npm ci

# Copier le reste du code
COPY . .

# Build du frontend Vite
RUN npm run build

# Port exposé (Railway injecte PORT)
ENV PORT=3000
EXPOSE ${PORT}

CMD ["node", "server/ai-proxy.js"]
