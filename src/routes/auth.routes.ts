import { Router } from "express";
import { register, login, me, updateMe, changePassword, forgotPassword, resetPassword, updateMyPhoto, removeMyPhoto } from "../controllers/auth.controller";
import { authMiddleware } from "../middlewares/auth.middleware";

import { userPhotoUpload } from "../config/upload";

const router = Router();

router.post("/register", register);
router.post("/login", login);
router.get("/me", authMiddleware, me);
router.put("/me", authMiddleware, updateMe);
router.put("/change-password", authMiddleware, changePassword);
router.post("/forgot-password", forgotPassword);
router.post("/reset-password", resetPassword);

router.put("/me/photo", authMiddleware, userPhotoUpload.single("photo"), updateMyPhoto);
router.delete("/me/photo", authMiddleware, removeMyPhoto);

export default router;