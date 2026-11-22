import "server-only";
import { randomUUID } from "node:crypto";
import sharp, { type OutputInfo } from "sharp";
import { SiteApiError, siteWriter } from "./supabase";

const MAX_BYTES = 5 * 1024 * 1024;
const TYPES = new Map([
  ["image/webp", "webp"],
  ["image/avif", "heif"],
  ["image/png", "png"],
  ["image/jpeg", "jpeg"],
]);

/** MEDIA-1: kiểm tra ảnh, chuyển sang WebP rồi lưu vào bucket `media`. Không đổi bản nháp. */
export async function uploadMedia(request: Request, slug: string) {
  // Chặn sớm trước khi đọc cả body; 64 KB dư cho phần đầu multipart.
  if (Number(request.headers.get("content-length")) > MAX_BYTES + 65536) throw tooLarge();
  let file: FormDataEntryValue | null = null;
  try {
    file = (await request.formData()).get("file");
  } catch {
    // Body không phải multipart hợp lệ: coi như thiếu file.
  }
  if (!(file instanceof File) || file.size === 0) throw new SiteApiError(422, "file: Chọn một ảnh để tải lên");
  if (file.size > MAX_BYTES) throw tooLarge();
  const format = TYPES.get(file.type);
  if (!format) throw unsupported();

  let image: { data: Buffer; info: OutputInfo };
  try {
    const input = sharp(Buffer.from(await file.arrayBuffer()), { limitInputPixels: 40_000_000 });
    // Không tin MIME do trình duyệt gửi: nội dung phải đúng định dạng đã khai báo.
    if ((await input.metadata()).format !== format) throw unsupported();
    // Ảnh bio không cần lớn hơn 2048 px; cũng giữ WebP dưới giới hạn 5 MB của bucket.
    image = await input
      .rotate()
      .resize({ width: 2048, height: 2048, fit: "inside", withoutEnlargement: true })
      .webp({ quality: 82 })
      .toBuffer({ resolveWithObject: true });
  } catch (error) {
    if (error instanceof SiteApiError) throw error;
    throw unsupported();
  }

  const path = `sites/${slug}/${randomUUID()}.webp`;
  const bucket = siteWriter().storage.from("media");
  const { error } = await bucket.upload(path, image.data, { contentType: "image/webp", cacheControl: "31536000" });
  if (error) throw error;
  return {
    url: bucket.getPublicUrl(path).data.publicUrl,
    width: image.info.width,
    height: image.info.height,
    bytes: image.info.size,
  };
}

/** Sau khi xóa trang: xóa ảnh theo từng slug trang từng dùng. Lỗi chỉ để lại file thừa nên chỉ ghi log. */
export async function removeMedia(slugs: string[]) {
  const bucket = siteWriter().storage.from("media");
  for (const slug of slugs) {
    try {
      for (;;) {
        const { data: files, error } = await bucket.list(`sites/${slug}`, { limit: 100 });
        if (error) throw error;
        if (!files.length) break;
        const { data: removed, error: removeError } = await bucket.remove(
          files.map((file) => `sites/${slug}/${file.name}`),
        );
        if (removeError) throw removeError;
        if (!removed.length) break;
      }
    } catch (error) {
      console.error("Không xóa được ảnh của trang", slug, error);
    }
  }
}

const tooLarge = () => new SiteApiError(413, "Ảnh tối đa 5 MB");
const unsupported = () => new SiteApiError(415, "Chỉ nhận ảnh WebP, AVIF, PNG hoặc JPEG");
