// src/services/comfyService.js
import fs from "fs";
import path from "path";
import fetch from "node-fetch";
import WebSocket from "ws";
import FormData from "form-data";
import { v4 as uuidv4 } from "uuid";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const COMFY_HTTP_URL = process.env.COMFY_HTTP_URL || "http://127.0.0.1:8188";
const COMFY_WS_URL = process.env.COMFY_WS_URL || "ws://127.0.0.1:8188/ws";

const loadWorkflow = (filename) => {
  const filePath = path.join(__dirname, "..", "workflows", filename);
  const raw = fs.readFileSync(filePath, "utf-8");
  return JSON.parse(raw);
};

const uploadImageToComfy = async (imageBase64) => {
  const pureBase64 = imageBase64.includes(",")
    ? imageBase64.split(",").pop()
    : imageBase64;

  const buffer = Buffer.from(pureBase64, "base64");

  const form = new FormData();
  form.append("image", buffer, {
    filename: `upload_${Date.now()}.png`,
    contentType: "image/png",
  });

  const res = await fetch(`${COMFY_HTTP_URL}/upload/image`, {
    method: "POST",
    body: form,
    headers: form.getHeaders(),
  });

  if (!res.ok) {
    const msg = await res.text();
    throw new Error(`/upload/image 실패: ${msg}`);
  }

  const json = await res.json();
  return json.name || json.filename || json.file || null;
};

const runWorkflow = async (workflow) => {
  const clientId = uuidv4();

  const saveNodeEntry = Object.entries(workflow).find(
    ([_, node]) => node.class_type === "SaveImageWebsocket"
  );
  if (!saveNodeEntry) {
    throw new Error("워크플로우에 SaveImageWebsocket 노드를 찾지 못했습니다.");
  }
  const saveNodeId = saveNodeEntry[0];

  // 2) /prompt 큐잉
  const payload = {
    client_id: clientId,
    prompt: workflow,
  };

  const httpRes = await fetch(`${COMFY_HTTP_URL}/prompt`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });

  if (!httpRes.ok) {
    const msg = await httpRes.text();
    throw new Error(`/prompt 호출 실패: ${msg}`);
  }

  const queueJson = await httpRes.json();
  const promptId = queueJson.prompt_id;

  // 3) WebSocket 연결
  const ws = new WebSocket(`${COMFY_WS_URL}?clientId=${clientId}`);

  return new Promise((resolve, reject) => {
    let resolved = false;
    let currentNode = null;
    const imageBuffers = [];

    ws.on("message", async (data, isBinary) => {
      try {
        if (isBinary) {
          if (currentNode && currentNode.toString() === saveNodeId) {
            const buf = Buffer.isBuffer(data)
              ? data.slice(8)
              : Buffer.from(data).slice(8);
            imageBuffers.push(buf);
          }
          return;
        }

        let text;
        if (typeof data === "string") {
          text = data;
        } else if (Buffer.isBuffer(data)) {
          text = data.toString("utf-8");
        } else {
          return;
        }

        const trimmed = text.trimStart();
        if (!trimmed.startsWith("{") && !trimmed.startsWith("[")) {
          return;
        }

        let msg;
        try {
          msg = JSON.parse(trimmed);
        } catch {
          return;
        }

        // 진행률 로그
        if (msg.type === "progress" && msg.data) {
          const { value, max } = msg.data;
          const percent = Math.round((value / (max || 1)) * 100);
          console.log(`[Comfy] progress: ${percent}%`);
        }

        if (msg.type === "executing" && msg.data) {
          const { node, prompt_id } = msg.data;

          if (prompt_id && prompt_id !== promptId) {
            return;
          }

          if (node === null) {
            if (!resolved) {
              resolved = true;
              ws.close();

              if (!imageBuffers.length) {
                reject(
                  new Error(
                    "작업은 끝났지만 SaveImageWebsocket에서 받은 이미지가 없습니다."
                  )
                );
              } else {
                const first = imageBuffers[0];
                const base64 = first.toString("base64");
                const mimeType = "image/png";

                resolve({
                  filename: null,
                  subfolder: null,
                  type: "websocket",
                  mimeType,
                  base64,
                });
              }
            }
          } else {
            currentNode = node;
          }
        }
      } catch (err) {
        if (!resolved) {
          resolved = true;
          ws.close();
          reject(err);
        }
      }
    });

    ws.on("error", (err) => {
      if (!resolved) {
        resolved = true;
        reject(err);
      }
    });

    setTimeout(() => {
      if (!resolved) {
        resolved = true;
        ws.close();
        reject(new Error("ComfyUI 응답 타임아웃"));
      }
    }, 5 * 60 * 1000);
  });
};

// txt2img: Asset_Maker_txt2img.json 기반
export const runTxt2Img = async ({ prompt, negativePrompt }) => {
  const workflow = loadWorkflow("Asset_Maker_txt2img.json");

  // 26: CLIPTextEncode (positive)
  if (workflow["26"]?.inputs) {
    const base = workflow["26"].inputs.text || "";
    if (prompt && prompt.trim().length > 0) {
      workflow["26"].inputs.text = `${base}, ${prompt}`;
    } else {
      workflow["26"].inputs.text = base;
    }
  }

  // 27: CLIPTextEncode (negative)
  if (workflow["27"]?.inputs) {
    const baseNeg = workflow["27"].inputs.text || "";
    if (negativePrompt && negativePrompt.trim().length > 0) {
      workflow["27"].inputs.text = `${baseNeg}, ${negativePrompt}`;
    } else {
      workflow["27"].inputs.text = baseNeg;
    }
  }

  return await runWorkflow(workflow);
};

// img2img: Asset_Maker_img2img.json 기반
export const runImg2Img = async ({ imageBase64, prompt, negativePrompt }) => {
  if (!imageBase64) {
    throw new Error("imageBase64가 필요합니다.");
  }

  const workflow = loadWorkflow("Asset_Maker_img2img.json");

  // 1) 이미지 업로드 → 파일명
  const uploadedName = await uploadImageToComfy(imageBase64);
  if (!uploadedName) {
    throw new Error("ComfyUI에 이미지 업로드 실패: 파일 이름을 받지 못함");
  }

  // 11: LoadImage → image 필드 세팅
  if (workflow["11"]?.inputs) {
    workflow["11"].inputs.image = uploadedName;
  }

  // 26: positive
  if (workflow["26"]?.inputs) {
    const base = workflow["26"].inputs.text || "pixelart";
    if (prompt && prompt.trim().length > 0) {
      workflow["26"].inputs.text = `${base}, ${prompt}`;
    } else {
      workflow["26"].inputs.text = base;
    }
  }

  // 27: negative
  if (workflow["27"]?.inputs) {
    const baseNeg = workflow["27"].inputs.text || "text, watermark";
    if (negativePrompt && negativePrompt.trim().length > 0) {
      workflow["27"].inputs.text = `${baseNeg}, ${negativePrompt}`;
    } else {
      workflow["27"].inputs.text = baseNeg;
    }
  }

  return await runWorkflow(workflow);
};
