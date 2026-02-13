import mongoose from "mongoose";

const settingsSchema = new mongoose.Schema(
  {
    // Chop etish narxlari (so'mda)
    printOneSide: {
      type: Number,
      required: true,
      default: 500,
    },
    printTwoSide: {
      type: Number,
      required: true,
      default: 800,
    },

    // Skanerlash narxlari (so'mda)
    scanOneSide: {
      type: Number,
      required: true,
      default: 500,
    },
    scanTwoSide: {
      type: Number,
      required: true,
      default: 800,
    },

    // Nusxalash narxlari (so'mda)
    copyOneSide: {
      type: Number,
      required: true,
      default: 500,
    },
    copyTwoSide: {
      type: Number,
      required: true,
      default: 800,
    },
  },
  { timestamps: true }
);

const Settings = mongoose.model("Settings", settingsSchema);

export default Settings;
