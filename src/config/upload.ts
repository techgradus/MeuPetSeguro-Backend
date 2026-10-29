import multer from "multer";
import { AppError } from "../errors";

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

const imageUpload = multer({
  storage: multer.memoryStorage(),
  fileFilter,
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB
});

export const petPhotoUpload = imageUpload;
export const userPhotoUpload = imageUpload;