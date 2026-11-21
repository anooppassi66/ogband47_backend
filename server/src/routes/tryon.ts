import { Router } from "express";
import multer from "multer";
import { z } from "zod";
import { CLOTH_TYPES, clothTypeForCategory } from "../lib/constants.js";
import { FitroomError, runTryOn } from "../lib/fitroom.js";
import { HttpError } from "../lib/http-error.js";
import { unsplash } from "../lib/images.js";
import { parse } from "../lib/validate.js";
import { getProductById, listProducts } from "../services/products.js";

// Port of app/api/tryon/route.ts and getTryOnOutfits in app/actions/products.ts.
//
// Unlike the website route, image URLs are restricted to Unsplash (where every
// product and model photo lives) so the server can't be used to fetch
// arbitrary URLs, e.g. internal network addresses.

const ALLOWED_IMAGE_HOSTS = new Set(["images.unsplash.com"]);
const MAX_PHOTO_BYTES = 10 * 1024 * 1024;

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_PHOTO_BYTES, files: 1 },
  fileFilter: (_req, file, cb) => {
    if (file.mimetype.startsWith("image/")) cb(null, true);
    else cb(new HttpError(400, "Photo must be an image."));
  },
});

const tryOnSchema = z.object({
  productId: z.string().trim().min(1).optional(),
  clothImageUrl: z.string().trim().min(1).optional(),
  clothType: z.enum(CLOTH_TYPES).optional(),
  personImageUrl: z.string().trim().min(1).optional(),
});

function allowedImageUrl(value: string, field: string): string {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new HttpError(400, `${field} is not a valid URL.`);
  }
  if (url.protocol !== "https:" || !ALLOWED_IMAGE_HOSTS.has(url.hostname)) {
    throw new HttpError(400, `${field} must be an https://images.unsplash.com URL.`);
  }
  return url.toString();
}

async function fetchAsBlob(url: string): Promise<Blob> {
  const response = await fetch(url);
  if (!response.ok) throw new FitroomError(`Could not fetch image: ${url}`);
  return response.blob();
}

export const tryOnRouter = Router();

tryOnRouter.get("/outfits", async (_req, res) => {
  const [men, women] = await Promise.all([listProducts({ section: "men" }), listProducts({ section: "women" })]);
  res.json({ men, women });
});

/**
 * multipart/form-data (or JSON when not uploading a photo):
 *   cloth:  productId            — preferred; image + clothType come from the product
 *        or clothImageUrl [+ clothType]
 *   person: person (file field)  — the shopper's photo
 *        or personImageUrl        — e.g. one of the preset model photos
 */
tryOnRouter.post("/", upload.single("person"), async (req, res) => {
  const input = parse(tryOnSchema, req.body ?? {});

  let clothImageUrl: string;
  let clothType = input.clothType;
  if (input.productId) {
    const product = await getProductById(input.productId);
    if (!product) throw new HttpError(404, "Product not found.");
    clothImageUrl = unsplash(product.imageId, 1000, 1250);
    clothType ??= clothTypeForCategory(product.category);
  } else if (input.clothImageUrl) {
    clothImageUrl = allowedImageUrl(input.clothImageUrl, "clothImageUrl");
  } else {
    throw new HttpError(400, "productId or clothImageUrl is required.");
  }

  const photo = req.file;
  if (!photo && !input.personImageUrl) {
    throw new HttpError(400, "Upload a `person` photo or send personImageUrl.");
  }
  const personImageUrl = photo ? undefined : allowedImageUrl(input.personImageUrl!, "personImageUrl");

  try {
    const [modelImage, clothImage] = await Promise.all([
      photo ? new Blob([new Uint8Array(photo.buffer)], { type: photo.mimetype }) : fetchAsBlob(personImageUrl!),
      fetchAsBlob(clothImageUrl),
    ]);

    const imageUrl = await runTryOn({
      modelImage,
      modelFilename: photo?.originalname || "model.jpg",
      clothImage,
      clothFilename: "cloth.jpg",
      clothType: clothType ?? "upper",
    });

    res.json({ imageUrl });
  } catch (err) {
    if (err instanceof FitroomError) throw new HttpError(502, err.message);
    throw err;
  }
});
