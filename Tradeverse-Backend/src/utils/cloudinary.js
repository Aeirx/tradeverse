import { v2 as cloudinary } from "cloudinary";
import fs from "fs";
import { logger } from "./logger.js";

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

const safeUnlink = (path) => {
  try {
    if (path) fs.unlinkSync(path);
  } catch (err) {
    logger.warn({ err, path }, "Failed to unlink temp upload file");
  }
};

const uploadOnCloudinary = async (localFilePath) => {
  if (!localFilePath) return null;
  try {
    const response = await cloudinary.uploader.upload(localFilePath, {
      resource_type: "auto",
    });
    safeUnlink(localFilePath);
    return response;
  } catch (error) {
    logger.error({ err: error }, "Cloudinary upload failed");
    safeUnlink(localFilePath);
    return null;
  }
};

export { uploadOnCloudinary };
