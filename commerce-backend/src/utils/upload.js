import multer from "multer";
import { HttpError } from "./http-error.js";

// Shared by both the public support-ticket routes (customer uploads) and
// the staff support routes (staff uploads) — same multer config, same
// error translation, so a file-too-large or wrong-type rejection reads
// identically from either side. memoryStorage (not disk) matches the
// established pattern from WhatsApp media upload: the whole file is held
// as a Buffer for exactly one request, then handed to whatever repo
// function persists it (here, straight into MongoDB — see
// support-attachment.model.js for why there's no cloud bucket involved).
const ALLOWED_MIME = /^(image\/|video\/|application\/pdf$)/;

// 12MB per file — comfortably under MongoDB's 16MB-per-document limit
// (each attachment is its own document, see support-attachment.model.js),
// generous enough for a photo or a short phone-recorded video clip. A
// full-length video would need real object storage (S3/Cloudinary/etc) —
// this app has no such account configured yet.
export const attachmentUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 12 * 1024 * 1024, files: 3 },
  fileFilter: (_req, file, cb) => {
    if (!ALLOWED_MIME.test(file.mimetype)) return cb(new Error("Unsupported file type"));
    cb(null, true);
  },
});

// multer's own errors (MulterError, or the fileFilter's plain Error above)
// don't carry an HttpError-style statusCode, so the global error handler
// (app.js) would otherwise genericize them as a bare 500 — turning a
// clear "your file is too big" into "something went wrong on our end".
// Wraps any multer middleware (e.g. attachmentUpload.array("files", 3)) so
// its errors translate to a real 400 with a message worth showing.
export function handleUploadErrors(multerMiddleware) {
  return (req, res, next) => {
    multerMiddleware(req, res, (err) => {
      if (!err) return next();
      if (err.code === "LIMIT_FILE_SIZE") return next(new HttpError(400, "Each attachment must be 12MB or smaller."));
      if (err.code === "LIMIT_FILE_COUNT" || err.code === "LIMIT_UNEXPECTED_FILE") return next(new HttpError(400, "You can attach up to 3 files."));
      if (err.message === "Unsupported file type") return next(new HttpError(400, "Only images, videos, and PDF files can be attached."));
      return next(err);
    });
  };
}
