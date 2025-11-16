import express from "express";
import {
  handleCreatePreviewTask,
  handleGetTaskStatus,
  handleCreateRefineTask,
  handleDownloadModel,
} from "../controllers/modelController.js";

const router = express.Router();

router.post("/create-task", handleCreatePreviewTask);
router.get("/task-status/:taskId", handleGetTaskStatus);
router.post("/create-refine", handleCreateRefineTask);
router.get("/download/:encodedUrl", handleDownloadModel);

export default router;
