FROM node:20-alpine

WORKDIR /app

# 開発用：package.jsonなどをコピーして依存関係をインストール
COPY package*.json ./
RUN npm install

# ポート公開
EXPOSE 3000

# 開発サーバー起動
CMD ["npm", "run", "dev"]
