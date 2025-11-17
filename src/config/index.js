import dotenv from "dotenv";

dotenv.config();

export const config = {
  port: process.env.PORT || 5000,
  openaiKey: process.env.OPENAI_API_KEY,
  meshyKey: process.env.MESHY_API_KEY,

  // ComfyUI 서버 주소
  comfyHttpUrl: process.env.COMFY_HTTP_URL || "http://127.0.0.1:8188",
  comfyWsUrl: process.env.COMFY_WS_URL || "ws://127.0.0.1:8188/ws",
};
