import mongoose, { Schema } from "mongoose";

const transactionSchema = new Schema(
  {
    user: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true, // We need to know whose receipt this is
    },
    type: {
      type: String,
      enum: ["BUY", "SELL", "DEPOSIT", "WITHDRAW"],
      required: true,
    },
    stockSymbol: {
      type: String,
      // Not required because a "DEPOSIT" doesn't have a stock symbol
    },
    quantity: {
      type: Number,
    },
    price: {
      type: Number,
    },
    totalAmount: {
      type: Number,
      required: true, // The total cash moved in the transaction
    },
  },
  {
    timestamps: true, // This is the magic! It automatically records the exact date and time of the trade
  }
);

// History queries always look like find({user}).sort({createdAt:-1}) — index it.
transactionSchema.index({ user: 1, createdAt: -1 });

export const Transaction = mongoose.model("Transaction", transactionSchema);
