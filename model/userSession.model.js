import mongoose from "mongoose";

const userSessionSchema = new mongoose.Schema(
  {
    telegramId: {
      type: Number,
      required: true,
      unique: true,
    },
    apparatId: {
      type: String,
      required: true,
    },
    firstName: String,
    username: String,
  },
  { timestamps: true }
);

const UserSession = mongoose.model("UserSession", userSessionSchema);

export default UserSession;
