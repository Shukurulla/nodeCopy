import mongoose from "mongoose";

const vendingApparatSchema = new mongoose.Schema(
  {
    apparatId: {
      type: String,
      required: true,
      unique: true,
    },
    nomi: {
      type: String,
      required: true,
    },
    manzil: String,
    holati: {
      type: String,
      enum: ["faol", "tamirlashda", "ishlamayapti"],
      default: "faol",
    },
    adminId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Admin",
      default: null,
    },
    narxlar: {
      printOneSide: { type: Number, default: 500 },
      printTwoSide: { type: Number, default: 800 },
      scanOneSide: { type: Number, default: 500 },
      scanTwoSide: { type: Number, default: 800 },
      copyOneSide: { type: Number, default: 500 },
      copyTwoSide: { type: Number, default: 800 },
    },
    qogozSigimi: {
      type: Number,
      default: 1000,
    },
    joriyQogozSoni: {
      type: Number,
      default: 1000,
    },
    kamQogozChegarasi: {
      type: Number,
      default: 200,
    },
    oxirgiToladirishVaqti: {
      type: Date,
      default: Date.now,
    },
    yaratilganVaqt: {
      type: Date,
      default: Date.now,
    },
  },
  { timestamps: true }
);

const VendingApparat = mongoose.model("VendingApparat", vendingApparatSchema);

export default VendingApparat;
