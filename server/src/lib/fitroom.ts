import { env } from "../config.js";

// Port of ../../../lib/server/fitroomClient.ts.

const FITROOM_BASE_URL = "https://platform.fitroom.app/api/tryon/v2";
const POLL_INTERVAL_MS = 2000;
const POLL_TIMEOUT_MS = 120_000;

const SUCCESS_STATES = new Set(["succeeded", "completed", "done"]);
const FAILURE_STATES = new Set(["failed", "error"]);

export class FitroomError extends Error {}

function headers(): Record<string, string> {
  if (!env.fitroomApiKey) throw new FitroomError("FITROOM_API_KEY is not configured");
  return { "X-API-KEY": env.fitroomApiKey };
}

async function createTask(options: RunTryOnOptions): Promise<string> {
  const form = new FormData();
  form.set("model_image", options.modelImage, options.modelFilename);
  form.set("cloth_image", options.clothImage, options.clothFilename);
  form.set("cloth_type", options.clothType);

  const response = await fetch(`${FITROOM_BASE_URL}/tasks`, { method: "POST", headers: headers(), body: form });

  let body: unknown;
  try {
    body = await response.json();
  } catch {
    throw new FitroomError(`Invalid Fitroom response (${response.status})`);
  }

  if (!response.ok) {
    const record = body as { message?: string; error?: string } | null;
    const message = record?.message ?? record?.error;
    throw new FitroomError(`Fitroom task creation failed (${response.status}): ${message ?? JSON.stringify(body)}`);
  }

  const taskId = (body as { task_id?: string } | null)?.task_id;
  if (!taskId) throw new FitroomError(`Fitroom response missing task_id: ${JSON.stringify(body)}`);
  return taskId;
}

interface FitroomTaskStatus {
  status?: string;
  download_signed_url?: string;
  result_url?: string;
  image_url?: string;
  error?: string;
  message?: string;
}

async function getTaskStatus(taskId: string): Promise<FitroomTaskStatus> {
  const response = await fetch(`${FITROOM_BASE_URL}/tasks/${taskId}`, { headers: headers() });
  try {
    return (await response.json()) as FitroomTaskStatus;
  } catch {
    throw new FitroomError(`Invalid Fitroom status response (${response.status})`);
  }
}

export interface RunTryOnOptions {
  modelImage: Blob;
  modelFilename: string;
  clothImage: Blob;
  clothFilename: string;
  clothType: string;
}

/** Creates a try-on task and polls until it finishes; resolves to the result image URL. */
export async function runTryOn(options: RunTryOnOptions): Promise<string> {
  const taskId = await createTask(options);
  const deadline = Date.now() + POLL_TIMEOUT_MS;

  while (Date.now() < deadline) {
    const status = await getTaskStatus(taskId);
    const state = String(status.status ?? "").toLowerCase();

    if (SUCCESS_STATES.has(state)) {
      const resultUrl = status.download_signed_url || status.result_url || status.image_url;
      if (!resultUrl) {
        throw new FitroomError(`Fitroom task succeeded but returned no result URL: ${JSON.stringify(status)}`);
      }
      return resultUrl;
    }

    if (FAILURE_STATES.has(state)) {
      throw new FitroomError(`Fitroom task failed: ${status.error ?? status.message ?? "Unknown error"}`);
    }

    await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
  }

  throw new FitroomError("Timed out waiting for Fitroom try-on result");
}
