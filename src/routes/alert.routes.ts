import { Router } from "express";
import { authMiddleware } from "../middlewares/auth.middleware";
import { list, markAsRead, markAllAsRead } from "../controllers/alert.controller";

const router = Router();

router.use(authMiddleware);

router.get("/", list);
router.patch("/read-all", markAllAsRead);
router.patch("/:id/read", markAsRead);

export default router;
