# Le studio Alaya dans un conteneur : Node (le programme), Python + Pillow + numpy (les photos
# mises au carre), git (Publier). Construit depuis le dossier 13_STUDIO :
#   docker build -f deploiement/Dockerfile -t alaya-studio .
FROM node:22-bookworm-slim
RUN apt-get update && apt-get install -y --no-install-recommends python3 python3-pil python3-numpy git ca-certificates openssh-client && rm -rf /var/lib/apt/lists/*
WORKDIR /studio
COPY *.js *.mjs ./
COPY node_modules ./node_modules
COPY studio ./studio
COPY deploiement/egaliser_carres.py /studio/egaliser_carres.py
ENV PORT=8776 HOST=0.0.0.0 DATA_DIR=/data SITE_DIR=/site EGALISER=/studio/egaliser_carres.py TRUST_PROXY=1 SECURE=1
EXPOSE 8776
CMD ["node", "server.js"]
