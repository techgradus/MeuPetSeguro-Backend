import { Router } from "express";
import { authMiddleware } from "../middlewares/auth.middleware";
import { list } from "../controllers/insight.controller";

// mergeParams: permite ler o :petId definido em routes/index.ts
const router = Router({ mergeParams: true });

router.use(authMiddleware);

router.get("/", list);

export default router;
