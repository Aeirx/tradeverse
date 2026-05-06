import { ApiError } from "../utils/ApiError.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import jwt from "jsonwebtoken";
import { User } from "../models/user.model.js";

/**
 * Extract a JWT from either an HttpOnly cookie (browser SPA) or an
 * `Authorization: Bearer <token>` header (mobile / curl / server-to-server).
 */
const extractToken = (req) => {
  if (req.cookies?.accessToken) return req.cookies.accessToken;

  const authHeader = req.headers?.authorization || req.headers?.Authorization;
  if (typeof authHeader === "string" && authHeader.startsWith("Bearer ")) {
    const token = authHeader.slice(7).trim();
    if (token) return token;
  }
  return null;
};

export const verifyJWT = asyncHandler(async (req, _, next) => {
  try {
    const token = extractToken(req);

    if (!token) {
      throw new ApiError(401, "Unauthorized request: No token found");
    }

    const decodedToken = jwt.verify(token, process.env.ACCESS_TOKEN_SECRET);

    const user = await User.findById(decodedToken?._id).select(
      "-password -refreshToken"
    );

    if (!user) {
      throw new ApiError(401, "Invalid Access Token");
    }

    req.user = user;
    next();
  } catch (error) {
    throw new ApiError(401, error?.message || "Invalid access token");
  }
});
