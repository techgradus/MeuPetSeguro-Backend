import "dotenv/config";
import app from "./app";
import { startMqttSubscriber } from "./mqtt/subscriber";
import { startAiAnalysisJob } from "./jobs/ai-analysis.job";
import { startDeviceStatusJob } from "./jobs/device-status.job";
import { startVaccineAlertsJob } from "./jobs/vaccine-alerts.job";

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log(`Servidor rodando em http://localhost:${PORT}`);
});

startMqttSubscriber();
startAiAnalysisJob();
startDeviceStatusJob();
startVaccineAlertsJob();