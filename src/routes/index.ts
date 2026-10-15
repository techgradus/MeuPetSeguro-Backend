import { Router } from "express";
import healthRoutes from "./health";
import authRoutes from "./auth.routes";
import petRoutes from "./pet.routes";
import alertRoutes from "./alert.routes";

import { authMiddleware } from "../middlewares/auth.middleware";

const router = Router();

router.use("/health", healthRoutes);
router.use("/auth", authRoutes);
router.use("/pets", petRoutes);
router.use("/alerts", alertRoutes);

export default router;