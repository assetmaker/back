// src/controllers/pixelController.js
import { runTxt2Img, runImg2Img } from "../services/comfyService.js";

export const handleTxt2Img = async (req, res) => {
  try {
    const { prompt, negativePrompt } = req.body;

    if (!prompt || !prompt.trim()) {
      return res
        .status(400)
        .json({ success: false, error: "prompt가 필요합니다." });
    }

    const result = await runTxt2Img({ prompt, negativePrompt });

    return res.json({
      success: true,
      mimeType: result.mimeType,
      imageBase64: result.base64,
      filename: result.filename,
      subfolder: result.subfolder,
      type: result.type,
    });
  } catch (err) {
    console.error("[handleTxt2Img] error:", err);
    return res.status(500).json({ success: false, error: err.message });
  }
};

export const handleImg2Img = async (req, res) => {
  try {
    const { imageBase64, prompt, negativePrompt } = req.body;

    if (!imageBase64) {
      return res
        .status(400)
        .json({ success: false, error: "imageBase64가 필요합니다." });
    }

    const result = await runImg2Img({ imageBase64, prompt, negativePrompt });

    return res.json({
      success: true,
      mimeType: result.mimeType,
      imageBase64: result.base64,
      filename: result.filename,
      subfolder: result.subfolder,
      type: result.type,
    });
  } catch (err) {
    console.error("[handleImg2Img] error:", err);
    return res.status(500).json({ success: false, error: err.message });
  }
};
