import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { comfyService } from "../services/comfyService.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const workflowDir = path.join(__dirname, "..", "workflows");

// 공통: JSON 로더 + 딥카피
const loadWorkflow = (filename) => {
  const fullPath = path.join(workflowDir, filename);
  const raw = fs.readFileSync(fullPath, "utf-8");
  return JSON.parse(raw);
};

const clone = (obj) => JSON.parse(JSON.stringify(obj));

// ★ ComfyUI에서 Save (API Format)으로 저장한 파일이어야 함
const txt2imgTemplate = loadWorkflow("Asset_Maker_txt2img.json");

let img2imgTemplate = null;
try {
  img2imgTemplate = loadWorkflow("Asset_Maker_img2img.json");
} catch {
  img2imgTemplate = null; // 아직 안 만들었으면 img2img는 501 응답
}

/**
 * 워크플로우에서 특정 class_type을 가진 노드들 찾기
 */
const findNodesByClassType = (wf, classType) => {
  return Object.entries(wf).filter(
    ([, node]) => node.class_type === classType
  );
};

/**
 * 워크플로우 안에서 "프롬프트를 넣을 CLIP 계열 노드"를 찾는다.
 * - class_type에 "CLIPText" 가 들어가는 노드를 우선 후보로 삼고
 * - _meta.title 에 positive 같은 단어가 있으면 그걸 쓰고
 * - 그래도 못 찾으면 text 입력이 있는 CLIP 계열 중 첫 번째를 사용
 */
const findPositiveClipNode = (wf) => {
  const candidates = [];

  for (const [id, node] of Object.entries(wf)) {
    if (!node || typeof node !== "object") continue;
    const ct = String(node.class_type || "");

    // CLIP 계열 노드 후보 (이름이 정확히 CLIPTextEncode가 아니어도 잡기)
    const isClip =
      ct.includes("CLIPText") ||
      ct.includes("CLIP") ||
      ct.includes("clip");

    if (!isClip) continue;

    const hasTextInput =
      node.inputs &&
      (Object.prototype.hasOwnProperty.call(node.inputs, "text") ||
        Object.prototype.hasOwnProperty.call(node.inputs, "text_g") ||
        Object.prototype.hasOwnProperty.call(node.inputs, "text_l"));

    if (hasTextInput) {
      candidates.push([id, node]);
    }
  }

  if (candidates.length === 0) {
    return [null, null];
  }

  // _meta.title 에 positive 들어가면 우선 사용
  const positive = candidates.find(([id, node]) => {
    const title = node._meta?.title;
    return (
      typeof title === "string" &&
      title.toLowerCase().includes("positive")
    );
  });

  if (positive) return positive;

  // 그 외엔 첫 번째 후보 사용
  return candidates[0];
};

/**
 * history.outputs 안에서 images 배열이 들어있는 첫 노드를 찾는다.
 * (SaveImage 노드 id를 하드코딩하지 않기 위해)
 */
const findFirstImageOutput = (outputs) => {
  for (const [id, node] of Object.entries(outputs)) {
    if (Array.isArray(node.images) && node.images.length > 0) {
      return [id, node];
    }
  }
  return [null, null];
};

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

    // 1) positive 프롬프트 CLIP 노드 찾기
    const [posNodeId, posNode] = findPositiveClipNode(wf);

    if (!posNodeId || !posNode) {
      // 디버깅용으로 워크플로우 안의 class_type들을 한번 찍어보자
      const classTypes = [
        ...new Set(
          Object.values(wf).map((n) => String(n.class_type || ""))
        ),
      ];
      console.error("[txt2img] Available class_types:", classTypes);

      throw new Error("No CLIPTextEncode node found in txt2img workflow");
    }

    if (!posNode.inputs) posNode.inputs = {};

    // text / text_g / text_l 중 뭐가 있는지에 따라 설정
    if (Object.prototype.hasOwnProperty.call(posNode.inputs, "text")) {
      posNode.inputs.text = `pixel art, ${prompt}`;
    } else if (Object.prototype.hasOwnProperty.call(posNode.inputs, "text_g")) {
      posNode.inputs.text_g = `pixel art, ${prompt}`;
    } else if (Object.prototype.hasOwnProperty.call(posNode.inputs, "text_l")) {
      posNode.inputs.text_l = `pixel art, ${prompt}`;
    } else {
      // 이상하면 그냥 text 필드 하나 새로 만들어버림
      posNode.inputs.text = `pixel art, ${prompt}`;
    }

    // 2) ComfyUI 실행
    const outputs = await comfyService.runWorkflow(wf);

    // 3) 이미지 출력 노드 찾기
    const [saveNodeId, saveNode] = findFirstImageOutput(outputs);

    if (!saveNodeId || !saveNode) {
      return res.status(500).json({
        success: false,
        error: "No image outputs found in ComfyUI txt2img workflow",
      });
    }

    const images = saveNode.images; // [{ filename, subfolder, type }, ...]

    res.json({ success: true, images });
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
 *  - image: ComfyUI input 폴더 기준 파일명 (예: "knight.png")
 */
export const handleImg2ImgPixel = async (req, res) => {
  const { image, prompt } = req.body;

  if (!img2imgTemplate) {
    return res.status(501).json({
      success: false,
      error: "img2img workflow not configured yet.",
    });
  }

  if (!image) {
    return res
      .status(400)
      .json({ success: false, error: "image is required." });
  }

  try {
    const wf = clone(img2imgTemplate);

    // 1) LoadImage 노드 찾기
    const loadNodes = findNodesByClassType(wf, "LoadImage");
    if (loadNodes.length === 0) {
      throw new Error("LoadImage node not found in img2img workflow");
    }
    const [loadNodeId, loadNode] = loadNodes[0];
    if (!loadNode.inputs) loadNode.inputs = {};

    // API 포맷에서 LoadImage 입력 이름은 보통 "image"
    loadNode.inputs.image = image;

    // 2) 프롬프트가 있다면 CLIP 계열 노드에 주입
    if (prompt) {
      const [posNodeId, posNode] = findPositiveClipNode(wf);
      if (posNodeId && posNode) {
        if (!posNode.inputs) posNode.inputs = {};
        if (Object.prototype.hasOwnProperty.call(posNode.inputs, "text")) {
          posNode.inputs.text = `pixel art, ${prompt}`;
        } else if (Object.prototype.hasOwnProperty.call(posNode.inputs, "text_g")) {
          posNode.inputs.text_g = `pixel art, ${prompt}`;
        } else if (Object.prototype.hasOwnProperty.call(posNode.inputs, "text_l")) {
          posNode.inputs.text_l = `pixel art, ${prompt}`;
        } else {
          posNode.inputs.text = `pixel art, ${prompt}`;
        }
      }
    }

    // 3) ComfyUI 실행
    const outputs = await comfyService.runWorkflow(wf);

    // 4) 이미지 출력 노드 찾기
    const [saveNodeId, saveNode] = findFirstImageOutput(outputs);

    if (!saveNodeId || !saveNode) {
      return res.status(500).json({
        success: false,
        error: "No image outputs found in ComfyUI img2img workflow",
      });
    }

    const images = saveNode.images;

    res.json({ success: true, images });
  } catch (err) {
    console.error(err);
    res
      .status(500)
      .json({ success: false, error: "img2img failed: " + err.message });
  }
};

export const handleImg2ImgPose = async (_req, res) => {
  return res.status(501).json({
    success: false,
    error: "pose img2img workflow is not implemented yet.",
  });
};
