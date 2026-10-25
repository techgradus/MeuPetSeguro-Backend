import "dotenv/config";
import app from "./app";
import { startMqttSubscriber } from "./mqtt/subscriber";

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log(`Servidor rodando em http://localhost:${PORT}`);
});

startMqttSubscriber();
