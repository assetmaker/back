// src/services/comfyPixelService.js
import fs from "fs";
import path from "path";
import fetch from "node-fetch";
import WebSocket from "ws";
import FormData from "form-data";
import { v4 as uuidv4 } from "uuid";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ComfyUI 서버 설정
const COMFY_HTTP_URL = process.env.COMFY_HTTP_URL || "http://127.0.0.1:8188";
const COMFY_WS_URL = process.env.COMFY_WS_URL || "ws://127.0.0.1:8188/ws";

// 워크플로우 로드 유틸
const loadWorkflow = (filename) => {
  const filePath = path.join(__dirname, "..", "workflows", filename);
  const raw = fs.readFileSync(filePath, "utf-8");
  return JSON.parse(raw);
};

// base64 → 파일 업로드 → Comfy에 저장된 파일 이름 리턴
const uploadImageToComfy = async (imageBase64) => {
  // data:image/png;base64,.... 이런 형식도 들어올 수 있으니까 뒤만 사용
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
  // Comfy 기본 응답은 { name: "파일명.png" } 형태
  return json.name || json.filename || json.file || null;
};

// 공통 실행 로직
const runWorkflow = async (workflow, clientId) => {
  // 1) /prompt 호출
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

  // 2) WebSocket 열어서 진행상황 + 결과 대기
  const ws = new WebSocket(`${COMFY_WS_URL}?clientId=${clientId}`);

  return new Promise((resolve, reject) => {
    let resolved = false;

    ws.on("message", async (data) => {
      try {
        const msg = JSON.parse(data.toString());

        // progress 로그 (원하면 여기서 프론트로 중계 가능)
        if (msg.type === "progress" && msg.data) {
          const { value, max } = msg.data;
          const percent = Math.round((value / (max || 1)) * 100);
          console.log(`[Comfy] progress: ${percent}%`);
        }

        // SaveImage 노드가 실행되면 images 정보가 같이 온다.
        if (msg.type === "executed" && msg.data?.images?.length) {
          const { images } = msg.data;
          const { filename, subfolder, type } = images[0];

          const viewUrl =
            `${COMFY_HTTP_URL}/view` +
            `?filename=${encodeURIComponent(filename)}` +
            `&subfolder=${encodeURIComponent(subfolder || "")}` +
            `&type=${encodeURIComponent(type || "output")}`;

          const imgRes = await fetch(viewUrl);
          if (!imgRes.ok) {
            throw new Error(`/view 호출 실패`);
          }

          const buffer = await imgRes.arrayBuffer();
          const base64 = Buffer.from(buffer).toString("base64");
          const mimeType = imgRes.headers.get("content-type") || "image/png";

          if (!resolved) {
            resolved = true;
            ws.close();
            resolve({
              filename,
              subfolder,
              type,
              mimeType,
              base64,
            });
          }
        }

        // 작업 종료인데 이미지가 안 온 경우
        if (msg.type === "executing" && msg.data?.node === null) {
          if (!resolved) {
            resolved = true;
            ws.close();
            reject(
              new Error("작업은 끝났지만 SaveImage 결과를 찾지 못했습니다.")
            );
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

    // 안전 타임아웃
    setTimeout(() => {
      if (!resolved) {
        resolved = true;
        ws.close();
        reject(new Error("ComfyUI 응답 타임아웃"));
      }
    }, 5 * 60 * 1000);
  });
};

// === txt2img: Asset_Maker_txt2img.json 기반 ===
export const runTxt2Img = async ({ prompt, negativePrompt }) => {
  const clientId = uuidv4();
  const workflow = loadWorkflow("Asset_Maker_txt2img.json");

  // 26: CLIPTextEncode (positive)
  if (workflow["26"]?.inputs) {
    const base = workflow["26"].inputs.text || "";
    if (prompt && prompt.trim().length > 0) {
      // 기본 스타일 + 유저 프롬프트 합치기
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

  const result = await runWorkflow(workflow, clientId);
  return result;
};

// === img2img: Asset_Maker_img2img.json 기반 ===
export const runImg2Img = async ({
  imageBase64,
  prompt,
  negativePrompt,
}) => {
  if (!imageBase64) {
    throw new Error("imageBase64가 필요합니다.");
  }

  const clientId = uuidv4();
  const workflow = loadWorkflow("Asset_Maker_img2img.json");

  // 1) 이미지 업로드 → 파일 이름 획득
  const uploadedName = await uploadImageToComfy(imageBase64);
  if (!uploadedName) {
    throw new Error("ComfyUI에 이미지 업로드 실패: 파일 이름을 받지 못함");
  }

  // 11: LoadImage → image 필드에 파일명 세팅
  if (workflow["11"]?.inputs) {
    workflow["11"].inputs.image = uploadedName;
  }

  // 26: CLIPTextEncode (positive, 기본은 "pixelart")
  if (workflow["26"]?.inputs) {
    const base = workflow["26"].inputs.text || "pixelart";
    if (prompt && prompt.trim().length > 0) {
      workflow["26"].inputs.text = `${base}, ${prompt}`;
    } else {
      workflow["26"].inputs.text = base;
    }
  }

  // 27: CLIPTextEncode (negative)
  if (workflow["27"]?.inputs) {
    const baseNeg = workflow["27"].inputs.text || "text, watermark";
    if (negativePrompt && negativePrompt.trim().length > 0) {
      workflow["27"].inputs.text = `${baseNeg}, ${negativePrompt}`;
    } else {
      workflow["27"].inputs.text = baseNeg;
    }
  }

  const result = await runWorkflow(workflow, clientId);
  return result;
};
