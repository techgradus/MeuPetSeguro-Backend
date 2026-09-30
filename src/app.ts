import express, { Request, Response } from "express";
import cors from "cors";

import healthRoutes from "./routes/health";

const app = express();

app.use(cors());
app.use(express.json());

app.use("/api/health", healthRoutes);

app.use((req: Request, res: Response) => {
  res.status(404).json({ error: "Rota não encontrada" });
});

export default app;
