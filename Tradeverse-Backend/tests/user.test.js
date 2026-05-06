/**
 * User-controller tests: registration, login, wallet add/withdraw.
 *
 * Strategy: mock the Mongoose User model + Transaction.create + cloudinary so
 * the controllers can be exercised without a real DB or external services.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

// Set the JWT secrets BEFORE importing the controller, since the user model
// reads them lazily via `process.env.*` inside generateAccessToken.
process.env.ACCESS_TOKEN_SECRET = "test-access-secret";
process.env.REFRESH_TOKEN_SECRET = "test-refresh-secret";
process.env.ACCESS_TOKEN_EXPIRY = "1d";
process.env.REFRESH_TOKEN_EXPIRY = "10d";

const mocks = vi.hoisted(() => ({
  findOne: vi.fn(),
  findById: vi.fn(),
  findByIdAndUpdate: vi.fn(),
  create: vi.fn(),
  transactionCreate: vi.fn(),
  cloudinaryUpload: vi.fn(),
}));

vi.mock("../src/models/user.model.js", () => ({
  User: {
    findOne: (...args) => mocks.findOne(...args),
    findById: (...args) => mocks.findById(...args),
    findByIdAndUpdate: (...args) => mocks.findByIdAndUpdate(...args),
    create: (...args) => mocks.create(...args),
  },
}));

vi.mock("../src/models/transaction.model.js", () => ({
  Transaction: {
    create: (...args) => mocks.transactionCreate(...args),
  },
}));

vi.mock("../src/utils/cloudinary.js", () => ({
  uploadOnCloudinary: (...args) => mocks.cloudinaryUpload(...args),
}));

const { registerUser, loginUser, addMoneyToWallet, withdrawFromWallet } = await import(
  "../src/controllers/user.controller.js"
);

const createResponse = () => {
  const cookies = {};
  const res = {
    statusCode: null,
    body: null,
    cookies,
    status: vi.fn(function (code) {
      this.statusCode = code;
      return this;
    }),
    json: vi.fn(function (body) {
      this.body = body;
      return this;
    }),
    cookie: vi.fn(function (name, value, opts) {
      this.cookies[name] = { value, opts };
      return this;
    }),
  };
  return res;
};

const runController = async (controller, body = {}, user = null, files = undefined) => {
  const req = { body, user, files };
  const res = createResponse();
  const next = vi.fn();
  await controller(req, res, next);
  return { res, next };
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe("registerUser", () => {
  it("rejects when a required field is empty", async () => {
    const { next } = await runController(registerUser, {
      fullName: "Ada Lovelace",
      email: "ada@example.com",
      username: "ada",
      password: "  ",
    });
    expect(next).toHaveBeenCalledWith(
      expect.objectContaining({ statusCode: 400, message: "All fields are required" })
    );
  });

  it("rejects when the user already exists", async () => {
    mocks.findOne.mockResolvedValueOnce({ _id: "existing", username: "ada" });
    const { next } = await runController(registerUser, {
      fullName: "Ada",
      email: "ada@example.com",
      username: "ada",
      password: "secret",
    });
    expect(next).toHaveBeenCalledWith(
      expect.objectContaining({ statusCode: 409 })
    );
  });

  it("creates a user with a generated avatar when no file is uploaded", async () => {
    mocks.findOne.mockResolvedValueOnce(null);
    mocks.create.mockResolvedValueOnce({ _id: "new-user-id" });
    mocks.findById.mockReturnValueOnce({
      select: vi.fn(() => Promise.resolve({ _id: "new-user-id", username: "ada" })),
    });

    const { res, next } = await runController(registerUser, {
      fullName: "Ada Lovelace",
      email: "ada@example.com",
      username: "ada",
      password: "secret",
    });

    expect(next).not.toHaveBeenCalled();
    expect(res.statusCode).toBe(201);
    // Falls back to ui-avatars.com when no file is provided
    const callArg = mocks.create.mock.calls[0][0];
    expect(callArg.avatar).toContain("ui-avatars.com");
    expect(callArg.username).toBe("ada");
    expect(mocks.cloudinaryUpload).not.toHaveBeenCalled();
  });
});

describe("loginUser", () => {
  it("rejects when neither email nor username is provided", async () => {
    const { next } = await runController(loginUser, { password: "secret" });
    expect(next).toHaveBeenCalledWith(
      expect.objectContaining({ statusCode: 400, message: "Username or email is required" })
    );
  });

  it("rejects unknown users", async () => {
    mocks.findOne.mockResolvedValueOnce(null);
    const { next } = await runController(loginUser, {
      email: "nobody@example.com",
      password: "secret",
    });
    expect(next).toHaveBeenCalledWith(
      expect.objectContaining({ statusCode: 404, message: "User does not exist" })
    );
  });

  it("rejects bad passwords", async () => {
    mocks.findOne.mockResolvedValueOnce({
      _id: "u1",
      isPasswordCorrect: vi.fn().mockResolvedValue(false),
    });
    const { next } = await runController(loginUser, {
      email: "ada@example.com",
      password: "wrong",
    });
    expect(next).toHaveBeenCalledWith(
      expect.objectContaining({ statusCode: 401, message: "Invalid user credentials" })
    );
  });

  it("issues access + refresh cookies on success", async () => {
    const userDoc = {
      _id: "u1",
      isPasswordCorrect: vi.fn().mockResolvedValue(true),
      generateAccessToken: vi.fn(() => "access-token-stub"),
      generateRefreshToken: vi.fn(() => "refresh-token-stub"),
      save: vi.fn(),
    };
    mocks.findOne.mockResolvedValueOnce(userDoc);
    // generateAccessAndRefreshTokens internally calls findById(userId).
    mocks.findById
      .mockReturnValueOnce(userDoc)
      .mockReturnValueOnce({
        select: vi.fn(() => Promise.resolve({ _id: "u1", username: "ada" })),
      });

    const { res, next } = await runController(loginUser, {
      email: "ada@example.com",
      password: "secret",
    });

    expect(next).not.toHaveBeenCalled();
    expect(res.statusCode).toBe(200);
    expect(res.cookies.accessToken).toEqual({
      value: "access-token-stub",
      opts: expect.objectContaining({ httpOnly: true, sameSite: "lax" }),
    });
    expect(res.cookies.refreshToken.value).toBe("refresh-token-stub");
  });
});

describe("addMoneyToWallet", () => {
  it("rejects non-positive amounts", async () => {
    const { next } = await runController(
      addMoneyToWallet,
      { amount: 0 },
      { _id: "u1" }
    );
    expect(next).toHaveBeenCalledWith(
      expect.objectContaining({ statusCode: 400 })
    );
  });

  it("rejects amounts above the per-deposit cap", async () => {
    const { next } = await runController(
      addMoneyToWallet,
      { amount: 5_000_000 },
      { _id: "u1" }
    );
    expect(next).toHaveBeenCalledWith(
      expect.objectContaining({
        statusCode: 400,
        message: expect.stringContaining("Maximum single deposit"),
      })
    );
  });

  it("rejects when the deposit would breach the wallet cap", async () => {
    mocks.findById.mockReturnValueOnce({
      select: vi.fn(() => Promise.resolve({ walletBalance: 9_999_999 })),
    });
    const { next } = await runController(
      addMoneyToWallet,
      { amount: 100 },
      { _id: "u1" }
    );
    expect(next).toHaveBeenCalledWith(
      expect.objectContaining({
        statusCode: 400,
        message: expect.stringContaining("maximum wallet balance"),
      })
    );
  });

  it("credits the wallet and writes a DEPOSIT transaction on success", async () => {
    mocks.findById.mockReturnValueOnce({
      select: vi.fn(() => Promise.resolve({ walletBalance: 1000 })),
    });
    mocks.findByIdAndUpdate.mockReturnValueOnce({
      select: vi.fn(() => Promise.resolve({ walletBalance: 1500 })),
    });
    mocks.transactionCreate.mockResolvedValueOnce({});

    const { res, next } = await runController(
      addMoneyToWallet,
      { amount: 500 },
      { _id: "u1" }
    );

    expect(next).not.toHaveBeenCalled();
    expect(res.statusCode).toBe(200);
    expect(res.body.data.walletBalance).toBe(1500);
    expect(mocks.transactionCreate).toHaveBeenCalledWith(
      expect.objectContaining({ type: "DEPOSIT", totalAmount: 500 })
    );
  });
});

describe("withdrawFromWallet", () => {
  it("rejects non-positive amounts", async () => {
    const { next } = await runController(
      withdrawFromWallet,
      { amount: -10 },
      { _id: "u1" }
    );
    expect(next).toHaveBeenCalledWith(
      expect.objectContaining({ statusCode: 400 })
    );
  });

  it("rejects when the user can't afford it", async () => {
    mocks.findById.mockReturnValueOnce({
      select: vi.fn(() => Promise.resolve({ walletBalance: 50 })),
    });
    const { next } = await runController(
      withdrawFromWallet,
      { amount: 100 },
      { _id: "u1" }
    );
    expect(next).toHaveBeenCalledWith(
      expect.objectContaining({ statusCode: 400, message: "Insufficient wallet balance." })
    );
  });

  it("debits the wallet and writes a WITHDRAW transaction on success", async () => {
    mocks.findById.mockReturnValueOnce({
      select: vi.fn(() => Promise.resolve({ walletBalance: 1000 })),
    });
    mocks.findByIdAndUpdate.mockReturnValueOnce({
      select: vi.fn(() => Promise.resolve({ walletBalance: 750 })),
    });
    mocks.transactionCreate.mockResolvedValueOnce({});

    const { res, next } = await runController(
      withdrawFromWallet,
      { amount: 250 },
      { _id: "u1" }
    );

    expect(next).not.toHaveBeenCalled();
    expect(res.statusCode).toBe(200);
    expect(res.body.data.walletBalance).toBe(750);
    expect(mocks.transactionCreate).toHaveBeenCalledWith(
      expect.objectContaining({ type: "WITHDRAW", totalAmount: 250 })
    );
  });
});
