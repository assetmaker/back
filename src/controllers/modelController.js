import fetch from "node-fetch";
import {
  createPreviewTask,
  createRefineTask,
  getTaskStatus,
} from "../services/meshyService.js";

export const handleCreatePreviewTask = async (req, res) => {
  const { prompt } = req.body;
  if (!prompt) return res.status(400).json({ success: false, error: "Prompt is required." });

  try {
    const data = await createPreviewTask(prompt);
    res.json({ success: true, data });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
};

export const handleGetTaskStatus = async (req, res) => {
  const { taskId } = req.params;
  if (!taskId) return res.status(400).json({ success: false, error: "Task ID is required." });

  try {
    const data = await getTaskStatus(taskId);
    res.json({ success: true, data });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
};

export const handleCreateRefineTask = async (req, res) => {
  const { previewTaskId } = req.body;
  if (!previewTaskId) return res.status(400).json({ success: false, error: "Preview Task ID is required." });

  try {
    const data = await createRefineTask(previewTaskId);
    res.json({ success: true, data });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
};

export const handleDownloadModel = async (req, res) => {
  try {
    const { encodedUrl } = req.params;
    const decodedUrl = Buffer.from(encodedUrl, 'base64').toString('ascii');

    const response = await fetch(decodedUrl);
    if (!response.ok) {
      throw new Error(`Failed to fetch model: ${response.statusText}`);
    }

    res.setHeader('Content-Disposition', 'attachment; filename="model.glb"');
    res.setHeader('Content-Type', response.headers.get('content-type'));
    response.body.pipe(res);

  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
};
