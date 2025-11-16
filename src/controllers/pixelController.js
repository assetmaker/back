import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { comfyService } from "../services/comfyService.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const workflowDir = path.join(__dirname, "..", "workflows");

// 템플릿 한 번만 읽어두고, 요청 들어올 때마다 deep copy
const txt2imgTemplate = JSON.parse(
  fs.readFileSync(path.join(workflowDir, "Asset_Maker_txt2img.json"), "utf-8")
);
const img2imgTemplate = JSON.parse(
  fs.readFileSync(path.join(workflowDir, "Asset_Maker_img2img.json"), "utf-8")
);

const clone = (obj) => JSON.parse(JSON.stringify(obj));

/**
 * POST /api/pixel/txt2img
 * body: { prompt: string }
 */
export const handleTxt2Img = async (req, res) => {
  const { prompt } = req.body;
  if (!prompt) {
    return res
      .status(400)
      .json({ success: false, error: "prompt is required." });
  }

  try {
    const wf = clone(txt2imgTemplate);

    // ✔ positive CLIPTextEncode 노드(id: 26)에 사용자 프롬프트 주입
    //   (현재 JSON에서 id 26이 positive, 27이 negative임):contentReference[oaicite:2]{index=2}
    const posNode = wf.nodes.find((n) => n.id === 26);
    if (!posNode || !Array.isArray(posNode.widgets_values)) {
      throw new Error("positive CLIPTextEncode node (id=26) not found");
    }

    // 기본 프롬프트 앞에 네가 원하는 템플릿을 유지하고 싶다면 템플릿 + 사용자 프롬프트 합치기
    posNode.widgets_values[0] = `pixelart, ${prompt}`;

    const outputs = await comfyService.runWorkflow(wf, {
      onProgress: (p) => {
        // 필요하면 여기서 진행률 로그 찍기
        // console.log("txt2img progress:", p);
      },
    });

    // SaveImage 노드 id = 9 기준으로 결과 이미지 얻기:contentReference[oaicite:3]{index=3}
    const saveNode = outputs["9"];
    if (!saveNode || !saveNode.images) {
      return res
        .status(500)
        .json({ success: false, error: "No images in ComfyUI output" });
    }

    // images: [{ filename, subfolder, type }, ...]
    res.json({ success: true, images: saveNode.images });
  } catch (err) {
    console.error(err);
    res
      .status(500)
      .json({ success: false, error: "txt2img failed: " + err.message });
  }
};

/**
 * POST /api/pixel/img2img
 * body: { image: string, prompt?: string }
 *  - image: ComfyUI에서 읽을 수 있는 파일 이름(또는 경로)
 *  - prompt: 선택. 있으면 positive CLIP 프롬프트에 추가
 */
export const handleImg2ImgPixel = async (req, res) => {
  const { image, prompt } = req.body;
  if (!image) {
    return res
      .status(400)
      .json({ success: false, error: "image is required." });
  }

  try {
    const wf = clone(img2imgTemplate);

    // 1) LoadImage 노드를 찾아 입력 이미지 파일명 설정
    const loadNode = wf.nodes.find((n) => n.type === "LoadImage");
    if (!loadNode || !Array.isArray(loadNode.widgets_values)) {
      throw new Error("LoadImage node not found in workflow");
    }
    // widgets_values[0] = 파일명 이라고 가정
    loadNode.widgets_values[0] = image;

    // 2) positive CLIPTextEncode 노드(대부분 id 26) 수정 (필요한 경우만)
    if (prompt) {
      const posNode = wf.nodes.find((n) => n.id === 26);
      if (posNode && Array.isArray(posNode.widgets_values)) {
        posNode.widgets_values[0] = `pixelart, ${prompt}`;
      }
    }

    const outputs = await comfyService.runWorkflow(wf, {
      onProgress: (p) => {
        // console.log("img2img progress:", p);
      },
    });

    const saveNode = outputs["9"];
    if (!saveNode || !saveNode.images) {
      return res
        .status(500)
        .json({ success: false, error: "No images in ComfyUI output" });
    }

    res.json({ success: true, images: saveNode.images });
  } catch (err) {
    console.error(err);
    res
      .status(500)
      .json({ success: false, error: "img2img failed: " + err.message });
  }
};

/**
 * 포즈 변경용 img2img (워크플로우 따로 만들면 여기서 처리)
 * 일단 엔드포인트만 만들어 두고, 나중에 pose 워크플로우 JSON 생기면 로직 추가.
 */
export const handleImg2ImgPose = async (_req, res) => {
  return res.status(501).json({
    success: false,
    error: "pose img2img workflow is not implemented yet.",
  });
};
