// model/statistika.model.js
import mongoose from "mongoose";

const statistikaSchema = new mongoose.Schema(
  {
    apparatId: {
      type: String,
      required: true,
      ref: "VendingApparat",
    },
    sana: {
      type: Date,
      default: Date.now,
    },
    foydalanishSoni: {
      type: Number,
      default: 0,
    },
    daromad: {
      type: Number,
      default: 0,
    },
    ishlatilganQogoz: {
      type: Number,
      default: 0,
    },
  },
  { timestamps: true }
);

// Samarali so'rovlar uchun murakkab indeks yaratish
statistikaSchema.index({ apparatId: 1, sana: 1 });

const Statistika = mongoose.model("Statistika", statistikaSchema);

export default Statistika;
