# MeuPet Seguro: Serviço de IA

Microserviço em Python (FastAPI + scikit-learn) que recebe as leituras dos sensores (comedouro e coleira)
e devolve **insights** para o app: comportamento anômalo do pet, consumo fora do normal e previsão de
quando os potes de ração/água vão esvaziar.

O backend Node consome esta API via HTTP, conforme pede o requisito *"modelo de ML consumido via API"*.

> **Ainda sem dados reais:** enquanto o ESP32 não envia leituras, o modelo é treinado com **dados
> sintéticos** que imitam a rotina de um cão e de um gato, incluindo dias "doente" e de "sede excessiva".
> Toda resposta traz `model_source` (`synthetic` ou `real`), para ninguém confundir as duas coisas.
> Quando os dados reais chegarem, basta re-treinar (veja a seção [Quando os dados reais chegarem](#quando-os-dados-reais-chegarem)).

## Contrato de dados (o que o IoT/backend precisa enviar)

Cada leitura, idealmente a cada **5 minutos**:

| Campo       | Tipo     | Descrição                                                       |
|-------------|----------|-----------------------------------------------------------------|
| `pet_id`    | string   | ID do pet (mesmo ID do banco do backend)                        |
| `timestamp` | ISO 8601 | Data/hora da leitura. Com fuso (`-03:00`) ou já no horário local |
| `food_g`    | número ≥ 0 | Peso de ração no pote, em gramas (célula de carga/HX711)      |
| `water_ml`  | número ≥ 0 | Volume de água no pote, em ml (balança ou sensor de nível)    |
| `activity`  | 0 a 1    | Nível de atividade normalizado (acelerômetro na coleira ou PIR) |

O serviço calcula sozinho o **consumo** (queda no nível do pote) e ignora os reabastecimentos.

## Modelos

| Modelo | Algoritmo | O que faz |
|---|---|---|
| Anomalia de comportamento | Isolation Forest (não supervisionado) | Aprende a rotina normal e marca horas fora do padrão: apatia, sede excessiva, pet sem comer. Usa features relativas à rotina **de cada pet**, então cão e gato são comparáveis. |
| Previsão de consumo | HistGradientBoosting (regressão), um modelo para ração e outro para água | Prevê o consumo hora a hora e simula quando o pote fica baixo (15% da capacidade) ou vazio. |
| Baseline por pet | Estatística (mediana diária) | Consumo e atividade normais de cada pet, usados para comparar as últimas 24h. |

O Isolation Forest foi escolhido porque **não precisa de dados rotulados**: ninguém precisa marcar
"aqui o pet estava doente" para ele aprender.

## Endpoints

| Método | Rota | Descrição |
|---|---|---|
| GET  | `/health` | Status e versão do modelo |
| GET  | `/model/info` | Quando/como o modelo foi treinado |
| POST | `/insights` | **Principal.** Recebe leituras e devolve mensagens prontas para o app |
| POST | `/predict/anomaly` | Score de anomalia hora a hora (para gráficos) |
| POST | `/predict/bowls` | Horas até os potes ficarem baixos/vazios |
| POST | `/train` | Re-treina com leituras reais (header `X-Admin-Token` se `AI_ADMIN_TOKEN` estiver definido) |

A documentação interativa (Swagger) fica em `http://127.0.0.1:8001/docs`.

Envie as leituras das **últimas 24–48h** de **um pet** por requisição:

```json
POST /insights
{
  "readings": [
    { "pet_id": "rex", "timestamp": "2026-11-20T08:00:00-03:00", "food_g": 280, "water_ml": 900, "activity": 0.42 },
    { "pet_id": "rex", "timestamp": "2026-11-20T08:05:00-03:00", "food_g": 262, "water_ml": 900, "activity": 0.61 }
  ]
}
```

Resposta:

```json
{
  "pet_id": "rex",
  "model_version": "20261005223321",
  "model_source": "synthetic",
  "insights": [
    {
      "type": "water_forecast",
      "severity": "info",
      "message": "Previsão: o pote de água deve ficar baixo em cerca de 5 horas.",
      "data": { "current": 223.1, "hours_until_low": 5.0, "hours_until_empty": 9.0 }
    }
  ]
}
```

Tipos de insight: `food_empty`, `water_empty` (critical); `food_low`, `water_low`, `behavior_anomaly`,
`water_drunk_ml_vs_baseline`, `food_eaten_g_vs_baseline`, `activity_vs_baseline`, `no_water` (warning);
`food_forecast`, `water_forecast`, `all_good` (info).

## Como rodar

```bash
cd ai-service
python -m venv .venv
.venv\Scripts\activate          # Windows  (Linux/Mac: source .venv/bin/activate)
pip install -r requirements.txt

python -m scripts.train --synthetic           # treina e salva em models/pet_model.joblib
uvicorn app.main:app --host 127.0.0.1 --port 8001 --reload   # sobe a API
```

Se não existir modelo salvo, a API treina um com dados sintéticos ao subir (`AUTO_TRAIN_SYNTHETIC=true`).
As variáveis de ambiente estão em [.env.example](.env.example).

Outros comandos:

```bash
python -m scripts.generate_synthetic_data --days 30 --out data/synthetic.csv   # gera CSV de exemplo
python -m scripts.evaluate                                                     # mede a qualidade do modelo
pytest                                                                         # testes
```

## Qualidade (QA)

### Testes unitários e de API

```bash
pytest
```

Cobrem os endpoints, alertas de pote vazio, detecção de sede excessiva, validação de dados e re-treino.

### CI/CD (GitHub Actions)

O workflow [`.github/workflows/ai-service.yml`](../.github/workflows/ai-service.yml) roda a cada push ou
pull request que mexa em `ai-service/`. Ele instala as dependências, roda os testes, treina e avalia o
modelo e publica o modelo treinado (`pet-model`) como artefato da execução.

### Teste de desempenho (JMeter)

O plano [tests/performance/insights.jmx](tests/performance/insights.jmx) simula usuários simultâneos
chamando `GET /health` e `POST /insights` com 24h de leituras ([payload.json](tests/performance/payload.json)).
Ele verifica se cada resposta tem status 200, contém `insights` e chega em até 1,5s.

```bash
# 1. Suba a API (2 processos aguentam melhor carga simultânea)
uvicorn app.main:app --host 127.0.0.1 --port 8001 --workers 2

# 2. Em outro terminal, dentro de tests/performance:
jmeter -n -t insights.jmx -l resultados.jtl -e -o relatorio
```

O relatório em HTML fica em `tests/performance/relatorio/index.html`. Para mudar a carga, use
`-Jthreads=50 -Jloops=10 -Jmax_ms=2000` (também aceita `-Jhost` e `-Jport`). Para gerar outro payload,
rode `python -m scripts.generate_load_payload`.

Medição de referência (Windows, 2 workers, 25 requisições por usuário):

| Usuários simultâneos | Tempo médio | p95 | Requisições/s |
|---|---|---|---|
| 1  | 77 ms  | 112 ms | 13 |
| 10 | 339 ms | 522 ms | 29 |
| 20 | 658 ms | 934 ms | 30 |

> Use `127.0.0.1` em vez de `localhost` no Windows: o `localhost` tenta IPv6 primeiro e adiciona ~2s a
> cada requisição.

## Quando os dados reais chegarem

1. Garanta que o backend salve as leituras com os campos do contrato acima.
2. Junte **no mínimo 2 dias** de leituras (o ideal é 1–2 semanas) e re-treine de uma destas formas:
   - **CSV:** exporte a tabela (`pet_id,timestamp,food_g,water_ml,activity`) e rode
     `python -m scripts.train --csv data/leituras.csv`
   - **API:** o backend envia as leituras para `POST /train`
3. Confira `GET /health`: `model_source` deve passar a ser `real`.
4. Ajuste, se precisar, as capacidades dos potes e os limites de ruído em [app/config.py](app/config.py)
   conforme o hardware real.

Re-treinar periodicamente (ex.: toda semana) mantém o modelo atualizado com a rotina dos pets.

## Integração com o backend Node (sugestão)

```ts
// src/services/ai.service.ts
const AI_URL = process.env.AI_SERVICE_URL ?? "http://localhost:8001";

export async function getInsights(readings: SensorReading[]) {
  const res = await fetch(`${AI_URL}/insights`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ readings }),
  });
  if (!res.ok) throw new Error(`IA indisponível: ${res.status}`);
  return res.json();
}
```

## Estrutura

```
ai-service/
├── app/
│   ├── main.py        # API FastAPI
│   ├── schemas.py     # contrato de dados (entrada/saída)
│   ├── features.py    # leituras brutas -> features horárias
│   ├── training.py    # treino e persistência dos modelos
│   ├── inference.py   # anomalias, previsão dos potes e geração dos insights
│   ├── synthetic.py   # gerador de dados sintéticos
│   └── config.py
├── scripts/           # train, evaluate, generate_synthetic_data, generate_load_payload
├── tests/
│   └── performance/   # plano JMeter + payload
└── models/            # modelo treinado (.joblib, fora do git)
```
