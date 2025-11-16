import fetch from "node-fetch";
import WebSocket from "ws";
import { v4 as uuidv4 } from "uuid";
import { config } from "../config/index.js";

class ComfyService {
  constructor() {
    this.ws = null;
    this.connected = false;
    // prompt_id -> { resolve, reject, onProgress, timeout }
    this.pending = new Map();

    this._connect();
  }

  _connect() {
    this.ws = new WebSocket(config.comfyWsUrl);

    this.ws.on("open", () => {
      console.log("[ComfyUI] WebSocket connected");
      this.connected = true;
    });

    this.ws.on("close", () => {
      console.warn("[ComfyUI] WebSocket closed. Reconnecting in 2s...");
      this.connected = false;
      setTimeout(() => this._connect(), 2000);
    });

    this.ws.on("error", (err) => {
      console.error("[ComfyUI] WebSocket error:", err.message);
    });

    this.ws.on("message", (data) => {
      this._handleMessage(data.toString());
    });
  }

  _handleMessage(raw) {
    let msg;
    try {
      msg = JSON.parse(raw);
    } catch {
      return;
    }

    const { type, data } = msg;
    if (!data) return;

    // 진행률 / 상태
    if (type === "progress" || type === "status") {
      const promptId = data.prompt_id;
      const pending = this.pending.get(promptId);
      if (pending?.onProgress) pending.onProgress(data);
      return;
    }

    // 실행 완료
    if (type === "execution_complete") {
      const promptId = data.prompt_id;
      const pending = this.pending.get(promptId);
      if (!pending) return;
      this._fetchHistory(promptId, pending);
    }
  }

  async _fetchHistory(promptId, pending) {
    try {
      const res = await fetch(`${config.comfyHttpUrl}/history/${promptId}`);
      const json = await res.json();
      const entry = json[promptId];

      if (!entry || !entry.outputs) {
        throw new Error("No outputs in ComfyUI history");
      }

      clearTimeout(pending.timeout);
      this.pending.delete(promptId);
      pending.resolve(entry.outputs);
    } catch (err) {
      clearTimeout(pending.timeout);
      this.pending.delete(promptId);
      pending.reject(err);
    }
  }

  /**
   * ComfyUI 워크플로우 실행
   * @param {object} workflow  ComfyUI JSON (nodes/links 포함)
   * @param {object} options   { onProgress?: fn }
   * @returns Promise<outputs> history[prompt_id].outputs
   */
  async runWorkflow(workflow, { onProgress } = {}) {
    const clientId = uuidv4();

    const res = await fetch(`${config.comfyHttpUrl}/prompt`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        client_id: clientId,
        prompt: workflow,
      }),
    });

    if (!res.ok) {
      const text = await res.text();
      throw new Error("ComfyUI /prompt failed: " + text);
    }

    const { prompt_id } = await res.json();

    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.pending.delete(prompt_id);
        reject(new Error("ComfyUI execution timeout"));
      }, 60_000); // 필요하면 늘려도 됨

      this.pending.set(prompt_id, { resolve, reject, onProgress, timeout });
    });
  }
}

export const comfyService = new ComfyService();
