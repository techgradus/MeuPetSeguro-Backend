import { Router } from "express";
import { authMiddleware } from "../middlewares/auth.middleware";
import { latest, activity, consumption } from "../controllers/reading-report.controller";

// mergeParams: permite ler o :petId definido em routes/index.ts
const router = Router({ mergeParams: true });

router.use(authMiddleware);

router.get("/latest", latest);
router.get("/activity", activity);
router.get("/consumption", consumption);

export default router;