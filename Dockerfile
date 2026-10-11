FROM node:22-alpine

ENV NODE_ENV=production
WORKDIR /app

RUN apk add --no-cache ca-certificates
COPY package.json package-lock.json ./
RUN npm ci --omit=dev --no-audit

COPY . .
RUN npm run check && npm test

EXPOSE 3000
CMD ["npm", "start"]
