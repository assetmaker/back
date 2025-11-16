import fetch from "node-fetch";
import { config } from "../config/index.js";

const API_URL = "https://api.meshy.ai/openapi/v2/text-to-3d";

export const createPreviewTask = async (prompt) => {
  const response = await fetch(API_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${config.meshyKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      prompt,
      mode: "preview",
    }),
  });
  return response.json();
};

export const createRefineTask = async (previewTaskId) => {
  const response = await fetch(API_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${config.meshyKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      mode: "refine",
      preview_task_id: previewTaskId,
    }),
  });
  return response.json();
};

export const getTaskStatus = async (taskId) => {
  const response = await fetch(`${API_URL}/${taskId}`, {
    method: "GET",
    headers: {
      Authorization: `Bearer ${config.meshyKey}`,
    },
  });
  return response.json();
};
