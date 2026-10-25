# MeuPetSeguro-Backend
O MeuPet Seguro é um sistema de Smart Home para acompanhar pets à distância. Ele une aplicativo mobile, dispositivos IoT e Inteligência Artificial para monitorar a atividade do animal e o que está acontecendo com os potes de comida e água.


# MeuPet Seguro — Backend

API do projeto **MeuPet Seguro**

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

## Problemas comuns

**Erro `Cannot find module '.prisma/client/default'` ao rodar `npm run dev`**

Acontece quando o Prisma Client ainda não foi gerado (o `migrate dev` só gera automaticamente
quando aplica uma migration nova — se ele disser "Already in sync", essa etapa é pulada). Resolve
rodando:

```
npx prisma generate
```

**Se isso não resolver e o banco parecer fora de sincronia com as migrations**

⚠️ Use com cuidado — este comando **apaga todos os dados** do banco e recria as tabelas do zero a
partir do schema. Só rode se não houver dado importante para preservar (ex: banco local recém
criado, sem cadastros de teste que valham a pena manter):

```
npx prisma migrate reset
```

Se já existir dado importante no banco, **não** rode o `migrate reset` — nesse caso, faça um
backup antes de qualquer alteração de schema (`pg_dump`) e ajuste a migration manualmente em vez
de resetar.
## Qualidade (QA)

- **Testes unitários e de API:** `npm test` (ou `npm run test:coverage` para o relatório de cobertura). Ficam em `tests/` e usam
  Vitest + Supertest com o Prisma simulado, então não precisam de banco.
- **Teste de desempenho:** plano do JMeter em `tests/performance/api.jmx`. Ele cria um tutor, um pet e uma vacina vencendo e depois
  simula usuários simultâneos fazendo login e abrindo pets e alertas. Para rodar localmente, com a API no ar:
  ```
  jmeter -n -t tests/performance/api.jmx -l resultados.jtl -e -o relatorio-jmeter -Jthreads=20 -Jloops=10
  ```
- **CI/CD:** o workflow `.github/workflows/backend.yml` roda os testes a cada push e, em seguida, o JMeter contra um Postgres
  temporário, publicando os relatórios de cobertura e de desempenho como artefatos.
