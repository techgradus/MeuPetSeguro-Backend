import { Router } from "express";
import { authMiddleware } from "../middlewares/auth.middleware";
import { petPhotoUpload } from "../config/upload";
import { create, list, getById, remove, update} from "../controllers/pet.controller";

const router = Router();

router.use(authMiddleware); 

router.post("/", petPhotoUpload.single("photo"), create);
router.get("/", list);
router.get("/:id", getById);
router.put("/:id", petPhotoUpload.single("photo"), update);
router.delete("/:id", remove);

export default router;