import { Router, Request, Response } from "express";
import { prisma } from "../config/prisma";

const router = Router();

router.get("/", async (req: Request, res: Response) => {
  try {
    await prisma.$queryRaw`SELECT 1`;
    res.json({
      status: "ok",
      service: "meupet-seguro-backend",
      database: "connected",
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    res.status(503).json({
      status: "error",
      service: "meupet-seguro-backend",
      database: "disconnected",
      timestamp: new Date().toISOString(),
    });
  }
});

export default router;
