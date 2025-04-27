import mongoose from "mongoose";

const paidSchema = new mongoose.Schema(
  {
    serviceData: {
      type: Object,
      required: true,
    },
    status: {
      type: String, // "tugallangan" yoki "bekor qilindi"
      required: true,
    },
    amount: {
      type: Number, // to'langan summa
      required: true,
    },
    date: {
      type: Date,
      default: Date.now,
    },
  },
  { timestamps: true }
);

const paidModel = mongoose.model("paid", paidSchema);

export default paidModel;
