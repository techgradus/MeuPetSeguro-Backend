import express, { Request, Response } from "express";
import cors from "cors";

import routes from "./routes";
import { errorHandler } from "./middlewares/errorHandler.middleware";

const app = express();

app.use(cors());
app.use(express.json());

app.use("/api", routes);

app.use((req: Request, res: Response) => {
  res.status(404).json({ error: "Rota não encontrada" });
});

app.use(errorHandler);

export default app;
