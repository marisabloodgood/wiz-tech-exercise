FROM node:20-alpine

WORKDIR /app

COPY package*.json ./
RUN npm install --production

COPY server.js .

ENV PORT=8080
EXPOSE 8080

RUN echo "Marisa Bloodgood" > /wizexercise.txt

CMD ["node", "server.js"]
