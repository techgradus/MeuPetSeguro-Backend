import { Router } from "express";
import { authMiddleware } from "../middlewares/auth.middleware";
import { create, list, getById, remove } from "../controllers/device.controller";

// mergeParams: permite ler o :petId definido em routes/index.ts
const router = Router({ mergeParams: true });

router.use(authMiddleware);

router.post("/", create);
router.get("/", list);
router.get("/:id", getById);
router.delete("/:id", remove);

export default router;
