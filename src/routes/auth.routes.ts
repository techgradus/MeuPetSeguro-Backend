import { Router } from "express";
import { register, login, me, changePassword } from "../controllers/auth.controller";
import { authMiddleware } from "../middlewares/auth.middleware";


const router = Router();

router.post("/register", register);
router.post("/login", login);
router.get("/me", authMiddleware, me);
router.put("/change-password", authMiddleware, changePassword);

export default router;