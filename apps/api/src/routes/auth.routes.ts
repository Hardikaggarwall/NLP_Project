import { login, logout } from "@/controllers/auth.controller";
import { authorize } from "@/middlewares/auth.middleware";
import { Router } from "express";

const router = Router();

router.post("/login", login);
router.post("/logout", authorize, logout);

export default router;
