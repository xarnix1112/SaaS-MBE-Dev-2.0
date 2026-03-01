# Dockerfile optimisé pour Railway - évite le timeout Nixpacks (10 min)
# Utilise l'image Node officielle, build beaucoup plus rapide que nix-env
FROM node:20-bookworm-slim

WORKDIR /app

# Python + poppler pour fallback OCR PDF (quand pdfjs+canvas échoue sur Linux)
RUN apt-get update -qq && apt-get install -y --no-install-recommends \
    python3 python3-pip poppler-utils \
    && rm -rf /var/lib/apt/lists/*

# Copier les fichiers de dépendances
COPY package.json package-lock.json* ./

# Installer les dépendances
RUN npm ci

# Installer les dépendances Python pour OCR (pdf2image)
COPY requirements-ocr.txt ./
RUN pip3 install --no-cache-dir -r requirements-ocr.txt

# Copier le reste du code
COPY . .

# Build du frontend Vite
RUN npm run build

# Port exposé (Railway injecte PORT)
ENV PORT=3000
EXPOSE ${PORT}

CMD ["node", "server/ai-proxy.js"]
