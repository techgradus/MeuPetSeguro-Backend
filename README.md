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

## Inteligência Artificial (pasta `ai-service/`)

O serviço de IA (Python + scikit-learn) analisa as leituras dos sensores e o backend transforma o resultado em alertas.

```
ESP32 / simulador → MQTT → backend (sensor_readings) → IA (/insights) → alertas no app
```

**O que a IA gera:**

| Alerta | Origem |
|---|---|
| `ACTIVITY_ANOMALY` | Comportamento fora do padrão (Isolation Forest), apatia, comer pouco, sede excessiva, muito tempo sem beber água |
| `LOW_FOOD` / `LOW_WATER` | **Previsão** de quando a ração/água vai acabar (Gradient Boosting) — ex.: "a água de Rex deve acabar em cerca de 4 horas" |

Os alertas de pote baixo **agora** e de inatividade continuam vindo das regras do `reading.service` na chegada de cada leitura.
O mesmo alerta da IA não se repete dentro de 6 horas.

**Como funciona:** a cada `AI_ANALYSIS_INTERVAL_MIN` minutos (padrão 10), o backend junta as leituras das últimas 48h de cada pet
(coleira + pote de comida + pote de água) em janelas de 5 minutos e envia para a IA. O app também pode consultar os insights
na hora em `GET /api/pets/:petId/insights`.

### Como rodar

```
# 1. Serviço de IA (uma vez: python -m venv .venv && .venv\Scripts\activate && pip install -r requirements.txt)
cd ai-service
uvicorn app.main:app --host 127.0.0.1 --port 8001 --env-file .env

# 2. Backend com AI_API_URL=http://127.0.0.1:8001 no .env
npm run dev

# 3. Histórico de 14 dias para treinar a IA sem esperar o simulador rodar dias
npm run sim:history

# 4. Treina a IA com as leituras do banco (repetir de tempos em tempos)
npm run ai:train
```

Sem modelo treinado, a IA sobe com um modelo de dados sintéticos (`model_source: "synthetic"` nas respostas).
O pet precisa ter coleira, pote de comida e pote de água cadastrados para ser analisado.

### Ajustes necessários no simulador ao vivo (`simulator/`)

A IA aprende a rotina do pet **por hora do dia** e o consumo **ao longo das horas**, usando o horário real das leituras.
Para os dados do simulador ao vivo baterem com isso:

1. **Coleira (`collar.ts`):** usar a hora real do relógio (`new Date().getHours()`) no `HOURLY_PROFILE`, em vez de um dia
   comprimido em `SIM_MINUTES_PER_DAY` minutos. Hoje um "dia" passa em 10 minutos, mas as leituras são gravadas com o horário real.
2. **Potes (`bowl.ts`):** hoje o consumo é de 2 a 12 g a cada 5 segundos, o que esvazia o pote em ~15 minutos. Em tempo real o
   ideal é o pet comer em refeições (ex.: 7h, 12h30 e 19h) e beber em goles ao longo do dia, como em `simulator/history.ts`.

Até lá, o `npm run sim:history` gera dados no formato e ritmo certos.
