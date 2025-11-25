// src/routes/pixelRoutes.js
import { Router } from "express";
import {
  handleTxt2Img,
  handleImg2Img,
} from "../controllers/pixelController.js";

const router = Router();

router.post("/txt2img", handleTxt2Img);
router.post("/img2img", handleImg2Img);

export default router;
