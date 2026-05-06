import { asyncHandler } from "../utils/asyncHandler.js";
import { ApiError } from "../utils/ApiError.js";
import { User } from "../models/user.model.js";
import { uploadOnCloudinary } from "../utils/cloudinary.js";
import { ApiResponse } from "../utils/ApiResponse.js";
import { Transaction } from "../models/transaction.model.js";
import jwt from "jsonwebtoken";

const cookieOptions = {
  httpOnly: true,
  secure: process.env.NODE_ENV === "production",
  sameSite: "lax",
  maxAge: 24 * 60 * 60 * 1000, // 1 day (matches access token expiry)
  path: "/",
};

const registerUser = asyncHandler(async (req, res) => {
  const { fullName, email, username, password } = req.body;

  if (
    [fullName, email, username, password].some((field) => field?.trim() === "")
  ) {
    throw new ApiError(400, "All fields are required");
  }

  const existingUser = await User.findOne({
    $or: [{ username }, { email }],
  });

  if (existingUser) {
    throw new ApiError(409, "User with email or username already exists");
  }

  let avatarUrl = "https://ui-avatars.com/api/?name=" + encodeURIComponent(fullName) + "&background=random";
  const avatarLocalPath = req.files?.avatar?.[0]?.path;

  if (avatarLocalPath) {
    const uploadedAvatar = await uploadOnCloudinary(avatarLocalPath);
    if (!uploadedAvatar) {
      throw new ApiError(400, "Avatar file failed to upload on cloud");
    }
    avatarUrl = uploadedAvatar.url;
  }

  const user = await User.create({
    fullName,
    avatar: avatarUrl,
    email,
    password,
    username: username.toLowerCase(),
  });

  const createdUser = await User.findById(user._id).select(
    "-password -refreshToken"
  );

  if (!createdUser) {
    throw new ApiError(500, "Something went wrong while registering the user");
  }

  return res
    .status(201)
    .json(new ApiResponse(200, createdUser, "User registered successfully"));
});

const generateAccessAndRefreshTokens = async (userId) => {
  try {
    const user = await User.findById(userId);
    const accessToken = user.generateAccessToken();
    const refreshToken = user.generateRefreshToken();

    user.refreshToken = refreshToken;
    await user.save({ validateBeforeSave: false });

    return { accessToken, refreshToken };
  } catch (error) {
    throw new ApiError(
      500,
      "Something went wrong while generating refresh and access token"
    );
  }
};

const loginUser = asyncHandler(async (req, res) => {
  const { email, username, password } = req.body;

  if (!username && !email) {
    throw new ApiError(400, "Username or email is required");
  }

  const user = await User.findOne({
    $or: [{ username }, { email }],
  });

  if (!user) {
    throw new ApiError(404, "User does not exist");
  }

  const isPasswordValid = await user.isPasswordCorrect(password);

  if (!isPasswordValid) {
    throw new ApiError(401, "Invalid user credentials");
  }

  const { accessToken, refreshToken } = await generateAccessAndRefreshTokens(
    user._id
  );

  const loggedInUser = await User.findById(user._id).select(
    "-password -refreshToken"
  );

  return res
    .status(200)
    .cookie("accessToken", accessToken, cookieOptions)
    .cookie("refreshToken", refreshToken, cookieOptions)
    .json(
      new ApiResponse(
        200,
        {
          user: loggedInUser,
        },
        "User logged In Successfully"
      )
    );
});

const logoutUser = asyncHandler(async (req, res) => {
  await User.findByIdAndUpdate(
    req.user._id,
    {
      $unset: {
        refreshToken: 1,
      },
    },
    {
      new: true,
    }
  );

  return res
    .status(200)
    .clearCookie("accessToken", cookieOptions)
    .clearCookie("refreshToken", cookieOptions)
    .json(new ApiResponse(200, {}, "User logged out successfully"));
});

const MAX_SINGLE_DEPOSIT = 1_000_000;   // $1M per deposit
const MAX_WALLET_BALANCE = 10_000_000;  // $10M total balance cap

const addMoneyToWallet = asyncHandler(async (req, res) => {
  const { amount } = req.body;
  const depositAmount = Number(amount);

  if (!amount || isNaN(depositAmount) || depositAmount <= 0) {
    throw new ApiError(400, "Please provide a valid positive amount.");
  }

  if (depositAmount > MAX_SINGLE_DEPOSIT) {
    throw new ApiError(400, `Maximum single deposit is $${MAX_SINGLE_DEPOSIT.toLocaleString()}.`);
  }

  // Check balance cap before depositing
  const currentUser = await User.findById(req.user._id).select("walletBalance");
  if (currentUser.walletBalance + depositAmount > MAX_WALLET_BALANCE) {
    throw new ApiError(400, `Deposit would exceed maximum wallet balance of $${MAX_WALLET_BALANCE.toLocaleString()}.`);
  }

  const updatedUser = await User.findByIdAndUpdate(
    req.user._id,
    {
      $inc: { walletBalance: depositAmount },
    },
    { new: true }
  ).select("-password -refreshToken");

  await Transaction.create({
    user: req.user._id,
    type: "DEPOSIT",
    totalAmount: depositAmount,
  });

  return res
    .status(200)
    .json(
      new ApiResponse(
        200,
        { walletBalance: updatedUser.walletBalance },
        `Successfully added $${depositAmount.toLocaleString()} to wallet.`
      )
    );
});

const MAX_SINGLE_WITHDRAW = 1_000_000; // $1M per withdraw

const withdrawFromWallet = asyncHandler(async (req, res) => {
  const { amount } = req.body;
  const withdrawAmount = Number(amount);

  if (!amount || isNaN(withdrawAmount) || withdrawAmount <= 0) {
    throw new ApiError(400, "Please provide a valid positive amount.");
  }

  if (withdrawAmount > MAX_SINGLE_WITHDRAW) {
    throw new ApiError(
      400,
      `Maximum single withdraw is $${MAX_SINGLE_WITHDRAW.toLocaleString()}.`
    );
  }

  const currentUser = await User.findById(req.user._id).select("walletBalance");
  if (currentUser.walletBalance < withdrawAmount) {
    throw new ApiError(400, "Insufficient wallet balance.");
  }

  const updatedUser = await User.findByIdAndUpdate(
    req.user._id,
    { $inc: { walletBalance: -withdrawAmount } },
    { new: true }
  ).select("-password -refreshToken");

  await Transaction.create({
    user: req.user._id,
    type: "WITHDRAW",
    totalAmount: withdrawAmount,
  });

  return res
    .status(200)
    .json(
      new ApiResponse(
        200,
        { walletBalance: updatedUser.walletBalance },
        `Successfully withdrew $${withdrawAmount.toLocaleString()} from wallet.`
      )
    );
});

const refreshAccessToken = asyncHandler(async (req, res) => {
  const incomingRefreshToken = req.cookies.refreshToken;

  if (!incomingRefreshToken) {
    throw new ApiError(401, "Unauthorized request");
  }

  try {
    const decodedToken = jwt.verify(
      incomingRefreshToken,
      process.env.REFRESH_TOKEN_SECRET
    );

    const user = await User.findById(decodedToken?._id);

    if (!user) {
      throw new ApiError(401, "Invalid refresh token");
    }

    if (incomingRefreshToken !== user?.refreshToken) {
      throw new ApiError(401, "Refresh token is expired or used");
    }

    const { accessToken, refreshToken: newRefreshToken } = await generateAccessAndRefreshTokens(user._id);

    return res
      .status(200)
      .cookie("accessToken", accessToken, cookieOptions)
      .cookie("refreshToken", newRefreshToken, cookieOptions)
      .json(
        new ApiResponse(
          200,
          { accessToken, refreshToken: newRefreshToken },
          "Access token refreshed"
        )
      );
  } catch (error) {
    throw new ApiError(401, error?.message || "Invalid refresh token");
  }
});

const getWalletBalance = asyncHandler(async (req, res) => {
  return res.status(200).json(
    new ApiResponse(
      200,
      {
        walletBalance: req.user.walletBalance,
        portfolio: req.user.portfolio || [],
      },
      "Balance fetched"
    )
  );
});

export {
  registerUser,
  loginUser,
  logoutUser,
  addMoneyToWallet,
  withdrawFromWallet,
  refreshAccessToken,
  getWalletBalance,
};
