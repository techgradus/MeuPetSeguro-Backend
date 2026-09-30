# MeuPetSeguro-Backend
O MeuPet Seguro é um sistema de Smart Home para acompanhar pets à distância. Ele une aplicativo mobile, dispositivos IoT e Inteligência Artificial para monitorar a atividade do animal e o que está acontecendo com os potes de comida e água.


# MeuPet Seguro — Backend

API do projeto **MeuPet Seguro**, desenvolvido para a Missão INTERFACE (Mobile + IoT + IA) da
ExpoTech 2026.2 — Missão 2050: Smart Home & Tecnologias do Futuro.

## Stack

- Node.js + Express
- TypeScript
- Prisma ORM + PostgreSQL
- MQTT (comunicação com os dispositivos ESP32)

## Como rodar localmente

1. Instale as dependências:
   ```
   npm install
   ```
2. Copie o arquivo de variáveis de ambiente e preencha com seus dados:
   ```
   cp .env.example .env
   ```
3. Ajuste `DATABASE_URL` no `.env`.

4. Gere o client do Prisma e rode a primeira migration:
   ```
   npx prisma migrate dev --name init
   ```

5. Rode em modo desenvolvimento:
   ```
   npm run dev
   ```
6. Teste se subiu corretamente:
   ```
   GET http://localhost:3000/api/health
   ```

## Comandos úteis do Prisma

- `npm run prisma:generate` — regenera o Prisma Client após mudar o schema
- `npm run prisma:migrate` — cria uma nova migration a partir de mudanças no schema
- `npm run prisma:studio` — abre uma interface visual pra ver/editar os dados do banco