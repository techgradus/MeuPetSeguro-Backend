import { Router } from "express";
import healthRoutes from "./health";
import authRoutes from "./auth.routes";
import petRoutes from "./pet.routes";
import alertRoutes from "./alert.routes";
import deviceRoutes from "./device.routes";
import insightRoutes from "./insight.routes";
import vaccineRoutes from "./vaccine.routes";
import pushRoutes from "./push.routes";
import readingReportRoutes from "./reading-report.routes";

import { authMiddleware } from "../middlewares/auth.middleware";

const router = Router();

router.use("/health", healthRoutes);
router.use("/auth", authRoutes);
router.use("/pets/:petId/devices", deviceRoutes);
router.use("/pets/:petId/insights", insightRoutes);
router.use("/pets", petRoutes);
router.use("/pets/:petId/readings", readingReportRoutes);
router.use("/alerts", alertRoutes);
router.use("/push-tokens", pushRoutes);
router.use(vaccineRoutes);

export default router;