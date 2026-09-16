FROM node:20-alpine

# pg_dump/psql dentro del contenedor del backend: permite generar respaldos
# sin depender de que PostgreSQL esté instalado en la máquina anfitriona.
RUN apk add --no-cache postgresql-client

WORKDIR /app

# Se copian primero los manifiestos para que la capa de dependencias quede
# cacheada: cambiar código de la app no obliga a reinstalar node_modules.
COPY package*.json ./
RUN npm ci

COPY . .

EXPOSE 3001

CMD ["npm", "start"]
