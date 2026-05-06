import mongoose from "mongoose";
import { DB_NAME } from "../constants.js";
import { logger } from "../utils/logger.js";

const connectDB = async () => {
  try {
    const connectionInstance = await mongoose.connect(
      `${process.env.MONGODB_URI}/${DB_NAME}`
    );
    logger.info(
      { host: connectionInstance.connection.host },
      "Mongo connected"
    );
  } catch (error) {
    logger.fatal({ err: error }, "Mongo connection failed");
    process.exit(1);
  }
};

export default connectDB;
