import mongoose from "mongoose";

const scanFileSchema = new mongoose.Schema(
  {
    code: {
      type: String,
      required: true,
    },
    file: {
      type: String,
      required: true,
    },
    status: {
      type: String,
      enum: ["paid", "pending"],
    },
  },
  {
    timestamps: true,
  }
);

const scanFileModel = mongoose.model("scan_file", scanFileSchema);

export default scanFileModel;
