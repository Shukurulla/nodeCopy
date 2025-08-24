import mongoose from "mongoose";

const copySchema = new mongoose.Schema(
  {
    code: {
      type: String,
      required: true,
      unique: true,
    },
    apparatId: {
      type: String,
      required: true,
      ref: "VendingApparat",
    },
    status: {
      type: String,
      enum: ["pending", "paid"],
      default: "pending",
    },
  },
  {
    timestamps: true,
  }
);

// Indekslar
copySchema.index({ code: 1 });
copySchema.index({ apparatId: 1 });
copySchema.index({ status: 1 });
copySchema.index({ createdAt: 1 });

const copyModel = mongoose.model("copy", copySchema);

export default copyModel;
