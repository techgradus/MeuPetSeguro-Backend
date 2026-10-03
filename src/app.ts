import express, { Request, Response } from "express";
import cors from "cors";

import healthRoutes from "./routes/health";
import authRoutes from "./routes/auth.routes";


import { authMiddleware } from "./middlewares/auth.middleware";


const app = express();

app.use(cors());
app.use(express.json());

app.use("/api/health", healthRoutes);
app.use("/api/auth", authRoutes);

// app.get("/api/teste", authMiddleware, (req: Request, res: Response) => {
//   res.json({userId: req.userId })
// });

app.use((req: Request, res: Response) => {
  res.status(404).json({ error: "Rota não encontrada" });
});

export default app;
