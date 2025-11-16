import express from "express";
import {
  handleTxt2Img,
  handleImg2ImgPixel,
  handleImg2ImgPose,
} from "../controllers/pixelController.js";

const router = express.Router();

// 2D 에셋 생성용 API
router.post("/txt2img", handleTxt2Img);
router.post("/img2img", handleImg2ImgPixel);
router.post("/img2img/pose", handleImg2ImgPose);

export default router;