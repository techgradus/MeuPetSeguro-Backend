import { Router } from "express";
import { authMiddleware } from "../middlewares/auth.middleware";
import * as VaccineController from "../controllers/vaccine.controller";


const router = Router();


// Este router é montado na raiz de /api, então o authMiddleware vai em cada rota
// (com router.use ele exigiria login em qualquer URL, e rotas inexistentes dariam 401 em vez de 404)
router.post("/pets/:petId/vaccines", authMiddleware, VaccineController.create);
router.get("/pets/:petId/vaccines", authMiddleware, VaccineController.list);
router.get("/vaccines/:id", authMiddleware, VaccineController.getById);
router.put("/vaccines/:id", authMiddleware, VaccineController.update);
router.delete("/vaccines/:id", authMiddleware, VaccineController.remove);


export default router;