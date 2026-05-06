import { Router } from "express";
import {
  registerUser,
  loginUser,
  logoutUser,
  addMoneyToWallet,
  withdrawFromWallet,
  refreshAccessToken,
  getWalletBalance,
} from "../controllers/user.controller.js";
import { verifyJWT } from "../middlewares/auth.middleware.js";
import { upload } from "../middlewares/multer.middleware.js";

const router = Router();

router.route("/register").post(
  upload.fields([
    {
      name: "avatar",
      maxCount: 1,
    },
  ]),
  registerUser
);

router.route("/login").post(loginUser);
router.route("/refresh-token").post(refreshAccessToken);

// Secured routes
router.route("/logout").post(verifyJWT, logoutUser);
router.route("/wallet/add").post(verifyJWT, addMoneyToWallet);
router.route("/wallet/withdraw").post(verifyJWT, withdrawFromWallet);
router.route("/balance").get(verifyJWT, getWalletBalance);

export default router;
