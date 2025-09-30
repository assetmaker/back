import express from "express";
import { handleGenerateModel } from "../controllers/modelController.js";

const router = express.Router();

router.post("/", handleGenerateModel);

export default router;
