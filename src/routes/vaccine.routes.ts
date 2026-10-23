import { Router } from "express";
import { authMiddleware } from "../middlewares/auth.middleware";
import * as VaccineController from "../controllers/vaccine.controller";


const router = Router();


router.use(authMiddleware);


router.post("/pets/:petId/vaccines", VaccineController.create);
router.get("/pets/:petId/vaccines", VaccineController.list);
router.get("/vaccines/:id", VaccineController.getById);
router.put("/vaccines/:id", VaccineController.update);
router.delete("/vaccines/:id", VaccineController.remove);


export default router;