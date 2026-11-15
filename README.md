# MeuPet Seguro: Backend

API do **MeuPet Seguro**, um sistema de Smart Home para acompanhar pets à distância. Ele une aplicativo mobile, dispositivos IoT (ESP32) e Inteligência Artificial para monitorar a atividade do animal e o que acontece com os potes de comida e de água.

Projeto da ExpoTech 2026.2.

> Repositórios do projeto: **backend** (este), **frontend** (`meu-pet-seguro`, app Expo), **firmware** (`Arduino/`) e **IA** (`ai-service/`, Python).

---

## Sumário

1. [Visão geral](#1-visão-geral)
2. [Stack](#2-stack)
3. [Estrutura de pastas](#3-estrutura-de-pastas)
4. [Como rodar localmente](#4-como-rodar-localmente)
5. [Variáveis de ambiente](#5-variáveis-de-ambiente)
6. [Scripts](#6-scripts)
7. [API REST](#7-api-rest)
8. [Dispositivos: real ou simulado](#8-dispositivos-real-ou-simulado)
9. [MQTT](#9-mqtt)
10. [Alertas e notificações push](#10-alertas-e-notificações-push)
11. [Inteligência Artificial](#11-inteligência-artificial)
12. [Tarefas automáticas (jobs)](#12-tarefas-automáticas-jobs)
13. [Banco de dados](#13-banco-de-dados)
14. [Autenticação e segurança](#14-autenticação-e-segurança)
15. [Qualidade (testes, desempenho, CI)](#15-qualidade-testes-desempenho-ci)
16. [Problemas comuns](#16-problemas-comuns)

---

## 1. Visão geral

```
ESP32 (coleira / estação) --MQTT sobre TLS--> broker EMQX Cloud --MQTT--> Backend (Node/Express)
                                                                            |-- PostgreSQL (Prisma): leituras, alertas
                                                                            |-- Firebase FCM: notificação no celular
                                                                            |-- Serviço de IA (Python): insights
App Expo (React Native) <---- HTTP + JSON (REST) com token JWT ----> Backend
```

- Os dispositivos publicam leituras no **broker MQTT**. Só o backend assina o broker; o app **não fala MQTT**.
- O backend grava as leituras, aplica regras, gera **alertas** e avisa o tutor por **push** (Firebase).
- Uma **IA** analisa o histórico e prevê quando a comida ou a água vão acabar e detecta comportamento fora do padrão.
- O app consome a API REST. O "tempo real" do app é feito por consulta periódica (polling).

## 2. Stack

| Camada | Tecnologia |
|---|---|
| Servidor | Node.js 18+, Express 4, TypeScript |
| Banco | PostgreSQL com Prisma 7 (`@prisma/adapter-pg`) |
| Validação | zod |
| Autenticação | JWT (`jsonwebtoken`) e `bcryptjs` |
| IoT | MQTT (biblioteca `mqtt`), broker EMQX Cloud |
| Notificações | Firebase Cloud Messaging (`firebase-admin`) |
| Fotos | Supabase Storage (upload com `multer`) |
| E-mail | Nodemailer (SMTP) |
| Testes | Vitest, Supertest, JMeter |

## 3. Estrutura de pastas

A arquitetura é em camadas: **rota → controller → service → Prisma**.

```
MeuPetSeguro-Backend/
├── prisma/
│   ├── schema.prisma        modelo do banco
│   └── migrations/          histórico versionado do banco (uma pasta por mudança)
├── src/
│   ├── server.ts            ponto de entrada: sobe o Express, o MQTT e os jobs
│   ├── app.ts               monta o Express (cors, json, /api, 404, tratador de erros)
│   ├── routes/              URL → controller (com authMiddleware nas rotas privadas)
│   ├── controllers/         lê a requisição, valida com zod, chama o service, responde
│   ├── services/            regras de negócio e acesso ao banco
│   ├── validators/          schemas zod (o que cada rota aceita)
│   ├── middlewares/         auth (JWT) e errorHandler
│   ├── errors/              AppError e erros específicos (status HTTP + mensagem)
│   ├── config/              clientes externos: prisma, mqtt, firebase, supabase, mailer, upload
│   ├── mqtt/subscriber.ts   assina os tópicos dos dispositivos
│   ├── jobs/                tarefas periódicas (IA, status dos dispositivos, vacinas)
│   ├── utils/               jwt, password, time (fuso), reading-analysis (cálculos puros)
│   └── types/express.d.ts   acrescenta req.userId ao tipo Request
├── simulator/               simulador de dispositivos e gerador de histórico
├── scripts/ai-train.ts      re-treina a IA com as leituras do banco
└── tests/                   Vitest + Supertest (unit e api) e plano do JMeter
```

Caminho de uma requisição: a **rota** recebe a URL, o `authMiddleware` confere o token, o **controller** valida o corpo com zod, o **service** aplica a regra e fala com o Prisma. Qualquer erro vira `AppError` e cai no `errorHandler`, que devolve o status certo.

## 4. Como rodar localmente

**Pré-requisitos**

- Node.js 18 ou superior
- PostgreSQL
- Para o fluxo completo (opcionais para só subir a API): broker MQTT, bucket do Supabase, servidor SMTP, credencial do Firebase e o serviço de IA

**Passo a passo**

1. Instale as dependências:
   ```
   npm install
   ```
2. Copie o arquivo de variáveis e preencha (veja a [seção 5](#5-variáveis-de-ambiente)):
   ```
   cp .env.example .env
   ```
3. Gere o cliente do Prisma e aplique as migrations:
   ```
   npx prisma generate
   npx prisma migrate dev
   ```
4. Rode em modo desenvolvimento:
   ```
   npm run dev
   ```
5. Teste se subiu:
   ```
   GET http://localhost:3000/api/health
   ```
   A resposta confirma que a API está de pé e conectada ao banco.

Sem `MQTT_BROKER_URL` a ingestão de sensores fica desligada; sem `AI_API_URL` a análise de IA fica desligada; sem credencial do Firebase o push fica desligado. **O resto da API continua funcionando** nesses casos.

## 5. Variáveis de ambiente

Arquivo `.env` (modelo em `.env.example`).

**Essenciais**

| Variável | Para que serve |
|---|---|
| `DATABASE_URL` | Conexão com o PostgreSQL |
| `JWT_SECRET` | Segredo para assinar os tokens |
| `PORT` | Porta da API (padrão `3000`) |
| `JWT_EXPIRES_IN` | Validade do token (padrão `7d`) |

**Integrações**

| Variável | Para que serve |
|---|---|
| `SUPABASE_URL`, `SUPABASE_SECRET_KEY`, `SUPABASE_BUCKET` | Armazenamento das fotos de pets e usuários |
| `MQTT_BROKER_URL`, `MQTT_USERNAME`, `MQTT_PASSWORD` | Broker MQTT (ex.: `mqtts://host:8883`) |
| `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `MAIL_FROM` | E-mail do código de redefinição de senha |
| `FIREBASE_SERVICE_ACCOUNT_BASE64` (ou `_JSON`, ou `_PATH`) | Credencial do Firebase Admin para o push |
| `AI_API_URL`, `AI_API_KEY` | Endereço e chave do serviço de IA (ex.: `http://127.0.0.1:8001`) |

**Ajustes opcionais**

| Variável | Padrão | O que muda |
|---|---|---|
| `VACCINE_PUSH_HOUR` | `9` | Hora (fuso de São Paulo) da checagem diária de vacinas |
| `DEVICE_STATUS_CHECK_INTERVAL_MIN` | `1` | De quanto em quanto tempo checa dispositivos sem sinal |
| `DEVICE_OFFLINE_AFTER_MIN` | `5` | Minutos sem sinal para marcar OFFLINE |
| `AI_ANALYSIS_INTERVAL_MIN` | `10` | Intervalo da análise automática da IA |
| `FOOD_BOWL_CAPACITY_G` | `900` | Capacidade do pote de comida (para calcular o percentual) |
| `WATER_BOWL_CAPACITY_ML` | `1000` | Capacidade do pote de água |
| `APP_UTC_OFFSET_H` | `-3` | Diferença do fuso local para o UTC |

**Simulador** (veja a [seção 8](#8-dispositivos-real-ou-simulado)): `SIM_INTERVAL_S` (padrão 30), `SIM_SYNC_S` (padrão 10), `SIM_SCENARIO`, `SIM_ONLY_PET`, `SIM_EXCLUDE_CODES`.

> Nunca publique o `.env` nem o arquivo de credencial do Firebase em repositório público. Ambos já estão no `.gitignore`.

## 6. Scripts

| Comando | O que faz |
|---|---|
| `npm run dev` | API em modo desenvolvimento, com recarga automática (`tsx watch`) |
| `npm run build` | Compila o TypeScript para `dist/` |
| `npm start` | Roda a versão compilada |
| `npm run prisma:generate` | Regenera o Prisma Client |
| `npm run prisma:migrate` | Cria e aplica uma migration (`migrate dev`) |
| `npm run prisma:studio` | Interface visual do banco |
| `npm run mqtt:simulate` | Simulador dos dispositivos **simulados** |
| `npm run sim:history` | Gera histórico de leituras no banco (padrão: 14 dias) |
| `npm run ai:train` | Re-treina a IA com as leituras do banco (padrão: 30 dias) |
| `npm test` | Testes (Vitest) |
| `npm run test:coverage` | Testes com relatório de cobertura |

## 7. API REST

Todas as rotas ficam sob `/api`. As marcadas com 🔒 exigem `Authorization: Bearer <token>`.

| Grupo | Rotas |
|---|---|
| Saúde | `GET /health` |
| Auth | `POST /auth/register`, `POST /auth/login`, 🔒 `GET /auth/me`, 🔒 `PUT /auth/me`, 🔒 `PUT /auth/change-password`, `POST /auth/forgot-password`, `POST /auth/reset-password`, 🔒 `PUT /auth/me/photo`, 🔒 `DELETE /auth/me/photo` |
| Pets | 🔒 `POST /pets`, `GET /pets`, `GET /pets/:id`, `PUT /pets/:id`, `DELETE /pets/:id` (foto em `multipart/form-data`, campo `photo`) |
| Dispositivos | 🔒 `POST /pets/:petId/devices`, `POST /pets/:petId/devices/station`, `GET /pets/:petId/devices`, `GET /pets/:petId/devices/:id`, `DELETE /pets/:petId/devices/:id` |
| Vacinas | 🔒 `POST` e `GET /pets/:petId/vaccines`, `GET`, `PUT` e `DELETE /vaccines/:id` |
| Leituras | 🔒 `GET /pets/:petId/readings/latest`, `/activity?period=today\|week`, `/consumption?kind=food\|water` |
| Alertas | 🔒 `GET /alerts` (filtro `?petId=`), `PATCH /alerts/read-all`, `PATCH /alerts/:id/read` |
| IA | 🔒 `GET /pets/:petId/insights` |
| Push | 🔒 `POST /push-tokens`, `DELETE /push-tokens`, `POST /push-tokens/test` |

**Erros** seguem o formato `{ "error": "mensagem" }`:

| Status | Quando |
|---|---|
| 400 | Dados inválidos (zod) ou foto inválida (JPEG, PNG ou WEBP, até 5 MB) |
| 401 | Token ausente, inválido ou expirado; credenciais erradas |
| 403 | O recurso é de outro tutor |
| 404 | Recurso ou rota não encontrado |
| 409 | Conflito (e-mail já usado, dispositivo já vinculado) |
| 422 | Regra de negócio (ex.: o pet não tem os 3 dispositivos para a IA) |
| 502 / 503 | Falha ao salvar imagem / IA indisponível |

**Exemplo: login e listagem de pets**

```
curl -X POST http://localhost:3000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"tutor@email.com","password":"123456"}'

curl http://localhost:3000/api/pets -H "Authorization: Bearer <token>"
```

## 8. Dispositivos: real ou simulado

Todo dispositivo vinculado a um pet tem uma **origem** (`source`), gravada na tabela `devices`:

| Valor | Significado |
|---|---|
| `REAL` | Placa ESP32 de verdade. É a origem padrão. |
| `SIMULATED` | Não existe placa. Quem manda os dados é o **simulador** do backend. |

A escolha é feita **na hora de cadastrar** o dispositivo no app (tela *Novo dispositivo*) e vai para a API no campo `source`.

### 8.1 Diferenças

| | Dispositivo real | Dispositivo simulado |
|---|---|---|
| Quem publica os dados | A placa ESP32 | O simulador (`npm run mqtt:simulate`) |
| Código do dispositivo | O da etiqueta da placa (ex.: `COLAR-1A2B3C`) | Gerado pelo app (ex.: `COLAR-SIM4F9K`) |
| Wi-Fi | A pessoa configura pelo portal `MEUPET-<ID>` | Não precisa |
| Etapas no app | 5 (escolha, preparar, Wi-Fi, conectando, concluído) | 3 (escolha, conectando, concluído) |
| Coluna `source` | `REAL` | `SIMULATED` |
| O simulador publica por ele? | **Nunca** | Sim, enquanto estiver rodando |
| Tópicos MQTT e formato das mensagens | Os mesmos | Os mesmos |
| Para que serve | Uso de verdade e demonstração com hardware | Desenvolvimento, testes, demonstração sem hardware e dados para a IA |

O backend **não distingue** os dois na hora de receber os dados: ambos publicam nos mesmos tópicos e passam pelo mesmo código de ingestão. A coluna `source` existe para o simulador saber **o que ele pode simular**.

### 8.2 Como cada um é cadastrado

**Real**

1. O app chama `POST /pets/:petId/devices` (ou `/devices/station`) com o código da etiqueta e `source: "REAL"` (ou sem `source`, que também vale `REAL`).
2. O backend cria o dispositivo com status `OFFLINE`. Nesse momento ele já "conhece" a placa: esse código pertence a esse pet.
3. A placa liga, entra no Wi-Fi e publica em `meupet/<código>/status`. O backend casa o código do tópico com o banco e marca o dispositivo como `ONLINE`.

**Simulado**

1. O app gera o código sozinho e chama a mesma rota com `source: "SIMULATED"`.
2. O backend cria o dispositivo com status `OFFLINE`.
3. O simulador, que consulta o banco a cada 10 s, encontra o novo dispositivo, liga ele (publica `ONLINE`) e passa a publicar telemetria. Não é preciso reiniciar nada.

**Exemplos de requisição**

```
# Coleira simulada
POST /api/pets/:petId/devices
{ "type": "COLLAR", "deviceCode": "COLAR-SIM4F9K", "source": "SIMULATED" }

# Estação real (cria os potes COMIDA-1A2B3C e AGUA-1A2B3C)
POST /api/pets/:petId/devices/station
{ "stationCode": "ESTACAO-1A2B3C", "source": "REAL" }
```

Tipos aceitos em `type`: `COLLAR`, `FOOD_BOWL` e `WATER_BOWL`. A estação (`ESTACAO-<ID>`) cria **dois** dispositivos de uma vez, `COMIDA-<ID>` e `AGUA-<ID>`, com a mesma origem.

### 8.3 Regras

- `deviceCode` é **único**: o mesmo código não pode estar em dois pets (erro 409).
- Cada pet tem no máximo **um dispositivo de cada tipo** (um colar, um pote de comida, um pote de água).
- Não há rota para trocar a origem de um dispositivo. Para mudar de simulado para real (ou o contrário), **remova** o dispositivo e cadastre de novo.
- Na migration que criou a coluna, os dispositivos que já existiam entraram como `SIMULATED` (até então o simulador atendia todos). Se algum for uma placa real, corrija:
  ```sql
  UPDATE devices SET source = 'REAL' WHERE "deviceCode" = 'COLAR-1A2B3C';
  ```

### 8.4 Rodando o simulador

```
npm run mqtt:simulate
npm run mqtt:simulate -- --scenario doente      # normal | doente | sede
npm run mqtt:simulate -- --pet <petId>          # só um pet
npm run mqtt:simulate -- --exclude CODIGO1,CODIGO2   # pausa alguns simulados
```

- Usa a mesma conexão MQTT do `.env`. O processo precisa ficar **ligado** para os dispositivos simulados ficarem online.
- A cada 10 s (`SIM_SYNC_S`) ele alinha a lista com o banco: liga os dispositivos novos e coloca em `OFFLINE` os que foram removidos.
- A cada 30 s (`SIM_INTERVAL_S`) publica a telemetria: a coleira segue um perfil de atividade por hora do dia, e os potes consomem e são reabastecidos em horários de refeição.
- **Cenários:** `normal` (dia comum), `doente` (pouca atividade e pouca comida) e `sede` (bebe água em excesso). Úteis para demonstrar os alertas e a IA.
- Se o simulador parar, os dispositivos simulados ficam `OFFLINE` depois de 5 minutos sem sinal, e o backend gera o alerta de dispositivo desconectado, como faria com uma placa real.

**Histórico para a IA:** `npm run sim:history` grava direto no banco 14 dias de leituras (com refeições, goles de água e alguns dias anômalos), para treinar a IA sem esperar dias de simulação.
Opções: `-- --days 30 --pet <petId> --reset`.

## 9. MQTT

### Tópicos

| Tópico | Conteúdo |
|---|---|
| `meupet/{deviceCode}/telemetry` | Leitura de sensor (atividade da coleira ou peso do pote) |
| `meupet/{deviceCode}/status` | Heartbeat e estado `ONLINE` / `OFFLINE` |

O backend assina `meupet/+/telemetry` e `meupet/+/status` (o `+` atende qualquer código).

### Mensagens (JSON)

Telemetria:

| Campo | Regra |
|---|---|
| `activityLevel` | `REPOUSO`, `LEVE`, `MODERADA` ou `INTENSA` (coleira) |
| `intensity` | Número de 0 a 1 (coleira) |
| `weightGrams` | Número maior ou igual a 0 (potes) |
| `recordedAt` | Data ISO, opcional |
| `batteryLevel` | Inteiro de 0 a 100, opcional |

Status: `{ "status": "ONLINE" | "OFFLINE", "batteryLevel"?: 0-100 }`.

### Como o backend sabe de qual dispositivo é a mensagem

O **código do dispositivo** é a chave. Ele é o mesmo na etiqueta da placa, na linha da tabela `devices` e no nome do tópico. O backend tira o código do tópico, põe em maiúsculas e procura em `devices`. Achou: grava a leitura ligada ao pet daquele dispositivo. Não achou: registra um aviso e descarta a mensagem.

### O que acontece na chegada de uma leitura

| Evento | Resultado |
|---|---|
| Telemetria válida | Grava em `sensor_readings`, marca o dispositivo `ONLINE`, atualiza último sinal e bateria |
| Pote de comida abaixo de 80 g | Alerta `LOW_FOOD` |
| Pote de água abaixo de 100 g | Alerta `LOW_WATER` |
| Coleira em repouso há 60 min em horário em que o pet costuma estar ativo | Alerta `INACTIVITY` |
| Status `OFFLINE` | Atualiza o dispositivo e cria `DEVICE_OFFLINE` |

O horário "em que o pet costuma estar ativo" vem da rotina dos últimos 7 dias; sem histórico suficiente, o backend considera que das 22h às 6h o pet dorme.

### Firmware

O código dos dispositivos está na pasta `Arduino/`: `colar/` (ESP32-C3 com sensor MPU-6500) e `estacao/` (ESP32-C3 com 2 HX711 e células de carga). O código do dispositivo vem dos 3 últimos bytes do MAC do Wi-Fi (`COLAR-1A2B3C`, `ESTACAO-1A2B3C`). Cada placa publica a cada 30 s, envia heartbeat `ONLINE` a cada 30 s e registra uma mensagem de `OFFLINE` no broker (LWT) para o caso de cair sem avisar.

## 10. Alertas e notificações push

### Tipos de alerta

| Tipo | Quando é gerado |
|---|---|
| `LOW_FOOD` | Pote de comida abaixo de 80 g, ou a IA prevê que a ração vai acabar |
| `LOW_WATER` | Pote de água abaixo de 100 g, ou a IA prevê que a água vai acabar |
| `INACTIVITY` | Pouca atividade num horário em que o pet costuma estar ativo |
| `ACTIVITY_ANOMALY` | A IA detecta comportamento fora do padrão |
| `DEVICE_OFFLINE` | Dispositivo informou OFFLINE ou ficou 5 min sem sinal |
| `VACCINE_DUE` | Próxima dose em até 7 dias, ou vacina atrasada |

**Sem repetição:** o mesmo tipo de alerta para o mesmo pet não é criado de novo dentro de uma janela (1 h por padrão; 6 h para a IA e para o job de offline). Alerta de vacina é no máximo um por vacina.

### Push (Firebase Cloud Messaging)

- A cada alerta criado, o backend avisa o tutor no celular (`push.service.ts`). Falha de push **nunca** derruba a ingestão de sensores nem a IA.
- O app registra o aparelho em `POST /push-tokens`. Um usuário pode ter vários aparelhos. Tokens que o FCM informa como inexistentes são apagados do banco.
- Canal do Android: `alerts`. O app deve criar um canal com o mesmo nome.
- `POST /push-tokens/test` envia uma notificação de teste para os aparelhos do usuário logado (útil em demonstrações).
- Sem credencial do Firebase no `.env`, o push fica desligado e o resto funciona.

### E-mail

Hoje só o código de redefinição de senha é enviado por e-mail.

## 11. Inteligência Artificial

A IA é um **serviço separado** em Python (pasta `ai-service/`, scikit-learn). O backend faz a ponte: monta os dados, chama a IA e transforma a resposta em alertas. O app nunca chama a IA diretamente.

```
ESP32 / simulador → MQTT → backend (sensor_readings) → IA (/insights) → alertas no app
```

**O que a IA gera**

| Resultado | Modelo |
|---|---|
| `ACTIVITY_ANOMALY`: comportamento fora do padrão, apatia, comeu pouco, sede excessiva, muito tempo sem beber | Isolation Forest |
| `LOW_FOOD` / `LOW_WATER`: **previsão** de quando a ração ou a água acaba | Gradient Boosting |

**Rotas envolvidas**

| De → Para | Rota |
|---|---|
| App → Backend | `GET /api/pets/:petId/insights` |
| Backend → IA | `POST {AI_API_URL}/insights` (cabeçalho `X-Admin-Token` com `AI_API_KEY`, timeout de 15 s) |
| Backend → IA | `POST {AI_API_URL}/train` |

**Dados enviados:** as leituras das últimas 48 h, juntando coleira e os dois potes em janelas de 5 minutos (`pet_id`, `timestamp`, `food_g`, `water_ml`, `activity`). O pet precisa ter coleira, pote de comida e pote de água para ser analisado.

**Quando roda:** automaticamente a cada 10 minutos (`AI_ANALYSIS_INTERVAL_MIN`) para todos os pets que têm coleira, e sob demanda quando o app consulta `/insights` (essa rota só consulta, não cria alertas). O mesmo insight não vira alerta de novo em 6 horas.

**Erros de `/insights`:** `503` se a IA estiver fora do ar ou sem `AI_API_URL`; `422` se faltarem dispositivos ou leituras.

**Como rodar**

```
# 1. Serviço de IA (uma vez: python -m venv .venv, ativar, pip install -r requirements.txt)
cd ai-service
uvicorn app.main:app --host 127.0.0.1 --port 8001 --env-file .env

# 2. Backend com AI_API_URL=http://127.0.0.1:8001 no .env
npm run dev

# 3. Histórico de 14 dias para treinar sem esperar o simulador
npm run sim:history

# 4. Treina a IA com as leituras do banco (repetir de tempos em tempos)
npm run ai:train
```

Sem treino, a IA sobe com um modelo de dados sintéticos (`modelSource: "synthetic"` nas respostas). Depois do treino com o banco, passa a `"real"`.

## 12. Tarefas automáticas (jobs)

São `setInterval` dentro do próprio backend, ligados no `server.ts`. Cada job tem uma trava para duas execuções não se sobreporem.

| Job | Frequência | O que faz |
|---|---|---|
| `vaccine-alerts` | Confere a cada 10 min se é a hora configurada e roda **uma vez por dia** (padrão 9h, fuso de São Paulo) | Cria alertas de vacina e manda o push |
| `device-status` | A cada 1 min | Dispositivo `ONLINE` sem sinal há mais de 5 min vira `OFFLINE` e gera alerta |
| `ai-analysis` | A cada 10 min (primeira rodada 30 s após subir) | Analisa os pets com a IA e cria alertas |

> Como rodam dentro da API, em ambiente com mais de uma instância os jobs rodariam em todas elas.

## 13. Banco de dados

| Tabela | Conteúdo |
|---|---|
| `users` | Tutores: nome, e-mail único, senha (hash), telefone, foto |
| `pets` | Nome, espécie, raça, nascimento, peso, observações, foto, tutor |
| `devices` | Tipo, `deviceCode` único, **origem (`REAL` / `SIMULATED`)**, status, bateria, último sinal, pet |
| `sensor_readings` | Nível de atividade, intensidade, peso, hora da leitura, dispositivo |
| `alerts` | Tipo, mensagem, lido, pet, vacina (opcional) |
| `vaccines` | Nome, data de aplicação, próxima dose, observações, pet |
| `push_tokens` | Token do aparelho (único), plataforma, usuário |
| `password_resets` | Hash do código de redefinição, validade, tentativas, usuário |

Pontos importantes:

- `onDelete: Cascade`: apagar um pet apaga seus dispositivos, leituras, vacinas e alertas; apagar o usuário apaga tudo dele.
- `@@unique([petId, type])`: um pet não tem dois dispositivos do mesmo tipo.
- Índice em `sensor_readings(deviceId, recordedAt)` para consultas por período.
- As datas ficam em UTC. `utils/time.ts` converte para o horário local (`APP_UTC_OFFSET_H`, padrão -3) ao agrupar por dia e hora.

## 14. Autenticação e segurança

- **Login:** compara a senha com `bcrypt` e devolve `{ user, token }`. O erro é o mesmo para e-mail ou senha errados.
- **Senha:** `bcryptjs` com 10 rounds. O hash nunca volta nas respostas.
- **Token:** JWT com o `userId`, validade padrão de 7 dias, enviado em `Authorization: Bearer`. Não há refresh token: ao expirar, o usuário entra de novo.
- **Dono do recurso:** toda rota de pet, dispositivo, vacina, leitura, alerta e insight confere se o pet é do usuário logado (404 se não existe, 403 se é de outro tutor).
- **Redefinição de senha:** código de 6 dígitos (`crypto.randomInt`), guardado só como hash, válido por 15 min, com no máximo 5 tentativas e 1 min entre pedidos. A resposta é sempre a mesma, exista o e-mail ou não.
- **Uploads:** só JPEG, PNG e WEBP, até 5 MB.

**Pontos de atenção para produção**

- Usar HTTPS e restringir o `cors()` às origens do app.
- Adicionar limite de tentativas (rate limiting) no login.
- No MQTT, usar credencial por dispositivo e validar o certificado do broker no firmware.
- Nunca versionar `.env`, credenciais do Firebase nem senhas do broker.

## 15. Qualidade (testes, desempenho, CI)

- **Testes unitários e de API:** `npm test` (ou `npm run test:coverage`). Ficam em `tests/` e usam Vitest + Supertest com o Prisma simulado, então **não precisam de banco**.
- **Teste de desempenho:** plano do JMeter em `tests/performance/api.jmx`. Cria um tutor, um pet e uma vacina vencendo e simula usuários simultâneos fazendo login e abrindo pets e alertas. Com a API no ar:
  ```
  jmeter -n -t tests/performance/api.jmx -l resultados.jtl -e -o relatorio-jmeter -Jthreads=20 -Jloops=10
  ```
- **CI/CD:** o workflow `.github/workflows/backend.yml` roda os testes a cada push e, em seguida, o JMeter contra um Postgres temporário, publicando os relatórios de cobertura e de desempenho como artefatos.

## 16. Problemas comuns

**`Cannot find module '.prisma/client/default'` ao rodar `npm run dev`**

O Prisma Client ainda não foi gerado. Rode:

```
npx prisma generate
```

**O banco parece fora de sincronia com as migrations**

⚠️ O comando abaixo **apaga todos os dados** e recria as tabelas. Só use em banco local sem dados importantes:

```
npx prisma migrate reset
```

Se já existir dado importante, faça backup antes (`pg_dump`) e ajuste a migration manualmente.

**O dispositivo simulado não fica online**

- Confira se o `npm run mqtt:simulate` está rodando e conectado ao broker.
- Confira se o dispositivo foi cadastrado como **Simulado**. Um dispositivo `REAL` nunca é simulado.
- Confira se `MQTT_BROKER_URL`, `MQTT_USERNAME` e `MQTT_PASSWORD` são os mesmos do backend.

**O dispositivo real não aparece online**

- Confira se o código digitado no app é exatamente o da etiqueta da placa (Serial Monitor ou página do portal Wi-Fi).
- Confira se a placa conectou no Wi-Fi e no broker (o Serial Monitor mostra a conexão).
- Mensagens de códigos não cadastrados são descartadas, com um aviso no log do backend (`dispositivo não cadastrado`).

**O push não chega**

- Confira se a credencial do Firebase está no `.env` (o log mostra `[Push] Firebase Admin inicializado`).
- Use `POST /push-tokens/test` para testar o aparelho.
- O app precisa ter registrado o token (`POST /push-tokens`) depois do login.