import express, { Request, Response } from "express";
import cors from "cors";
import path from "path";

import routes from "./routes";
import { errorHandler } from "./middlewares/errorHandler.middleware";

const app = express();

app.use(cors());
app.use(express.json());

app.use("/uploads", express.static(path.join(__dirname, "..", "uploads")));

app.use("/api", routes);

app.use((req: Request, res: Response) => {
  res.status(404).json({ error: "Rota não encontrada" });
});

app.use(errorHandler);

export default app;
