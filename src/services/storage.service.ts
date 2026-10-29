import { randomUUID } from "crypto";
import { supabase } from "../config/supabase";
import { AppError } from "../errors";

const BUCKET = process.env.SUPABASE_BUCKET as string;

const EXTENSIONS: Record<string, string> = {
  "image/jpeg": ".jpg",
  "image/png": ".png",
  "image/webp": ".webp",
};

export const uploadImage = async (folder: "pets" | "users", file: Express.Multer.File) => {
  const objectPath = `${folder}/${randomUUID()}${EXTENSIONS[file.mimetype] ?? ""}`;

  const { error } = await supabase.storage
    .from(BUCKET)
    .upload(objectPath, file.buffer, { contentType: file.mimetype });

  if (error) {
    console.error("Falha ao enviar imagem ao Supabase:", error);
    throw new AppError("Não foi possível salvar a imagem", 502);
  }

  return supabase.storage.from(BUCKET).getPublicUrl(objectPath).data.publicUrl;
};

export const deleteImage = async (publicUrl?: string | null) => {
  if (!publicUrl) return;

  const marker = `/object/public/${BUCKET}/`;
  const index = publicUrl.indexOf(marker);
  if (index === -1) return;

  await supabase.storage.from(BUCKET).remove([publicUrl.slice(index + marker.length)]);
};