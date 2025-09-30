import fetch from "node-fetch";
import { config } from "../config/index.js";

export const generateModel = async (prompt, mode = "3d") => {
  try {
    const response = await fetch("https://api.meshy.ai/v1/text-to-3d", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${config.meshyKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        prompt,
        mode,
        output_format: "glb",
      }),
    });

    const data = await response.json();
    return data;
  } catch (err) {
    throw new Error("Meshy API 호출 실패: " + err.message);
  }
};
