import multer from "multer";
import path from "path";
import fs from "fs";
import { randomUUID } from "crypto";
import { AppError } from "../errors";

export const UPLOAD_ROOT = path.join(__dirname, "..", "..", "uploads");

const fileFilter = (
  req: Express.Request,
  file: Express.Multer.File,
  cb: multer.FileFilterCallback
) => {
  const allowedTypes = ["image/jpeg", "image/png", "image/webp"];
  if (allowedTypes.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new AppError("Tipo de arquivo não permitido. Use JPEG, PNG ou WEBP.", 400));
  }
};

const createImageUpload = (folder: string) =>
  multer({
    storage: multer.diskStorage({
      destination: (req, file, cb) => {
        const dir = path.join(UPLOAD_ROOT, folder);
        fs.mkdirSync(dir, { recursive: true });
        cb(null, dir);
      },
      filename: (req, file, cb) => {
        cb(null, `${randomUUID()}${path.extname(file.originalname)}`);
      },
    }),
    fileFilter,
    limits: { fileSize: 5 * 1024 * 1024 }, // 5MB
  });

export const petPhotoUpload = createImageUpload("pets");
export const userPhotoUpload = createImageUpload("users");