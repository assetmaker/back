import express from "express";
import { handleGenerateScript } from "../controllers/scriptController.js";

const router = express.Router();

router.post("/", handleGenerateScript);

export default router;
