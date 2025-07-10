import mongoose from "mongoose";

const paidSchema = new mongoose.Schema(
  {
    serviceData: {
      type: Object,
      required: true,
    },
    status: {
      type: String, // "paid", "pending", "cancelled"
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

    // Click uchun maydonlar
    clickTransactionId: {
      type: String,
      sparse: true, // Faqat click to'lovlari uchun
    },

    // Payme uchun maydonlar
    paymeTransactionId: {
      type: String,
      sparse: true, // Faqat payme to'lovlari uchun
    },
    paymeCreateTime: {
      type: Number, // Payme timestamp
    },
    paymePerformTime: {
      type: Number, // Payme timestamp
    },
    paymeCancelTime: {
      type: Number, // Payme timestamp
    },
    paymeReason: {
      type: Number, // Bekor qilish sababi
    },

    // Umumiy maydonlar
    paymentMethod: {
      type: String,
      enum: ["click", "payme"],
      default: "click",
    },
  },
  {
    timestamps: true,
  }
);

// KRITIK: Indekslar - bu muammoning hal qiluvchisi
paidSchema.index({ "serviceData._id": 1 });
paidSchema.index({ status: 1 });
paidSchema.index({ paymeTransactionId: 1 }, { sparse: true, unique: true });
paidSchema.index({ clickTransactionId: 1 }, { sparse: true });
paidSchema.index({ createdAt: 1 });

// YANGI: Order uchun aktiv tranzaksiyalarni topish uchun compound index
paidSchema.index({
  "serviceData._id": 1,
  status: 1,
  paymentMethod: 1,
});

const paidModel = mongoose.model("paid", paidSchema);

export default paidModel;
