import { Router } from "express";
import { authMiddleware } from "../middlewares/auth.middleware";
import { register, remove, test } from "../controllers/push.controller";

const router = Router();

router.use(authMiddleware);

router.post("/", register);
router.delete("/", remove);
router.post("/test", test);

export default router;
