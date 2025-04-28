import express from "express";
import paidModel from "../model/paid.model.js"; // To'langan fayllar
import File from "../model/file.model.js";
import scanFileModel from "../model/scanFile.model.js";

const router = express.Router();

// CLICK PREPARE URL
router.post("/prepare", async (req, res) => {
  try {
    const { merchant_trans_id, amount, action, sign_time, sign_string } =
      req.body;
    console.log("Prepare kelgan data:", req.body);

    const uploadedFile = await File.findById(merchant_trans_id);
    const scannedFile = await scanFileModel.findById(merchant_trans_id);

    if (!uploadedFile && !scannedFile) {
      return res.status(200).json({
        error: -5,
        error_note: "Fayl topilmadi",
      });
    }

    // Faylni va miqdorni tekshirish
    if (uploadedFile && uploadedFile.amount !== amount) {
      return res.status(200).json({
        error: -2,
        error_note: "Miqdor xato",
      });
    }

    // Agar to'lov allaqachon amalga oshirilgan bo'lsa, xatolik qaytarish
    const existingPayment = await paidModel.findOne({ _id: merchant_trans_id });
    if (existingPayment) {
      return res.status(200).json({
        error: -4,
        error_note: "Transaction already paid",
      });
    }

    // Transactionni tayyorlash
    await paidModel.create({
      _id: merchant_trans_id,
      status: "pending", // To'lovni tayyorlash
      amount,
      date: new Date(),
    });

    return res.status(200).json({
      error: 0,
      error_note: "OK",
    });
  } catch (error) {
    console.error("Prepare error:", error);
    return res.status(200).json({
      error: -1,
      error_note: "Server xatosi",
    });
  }
});

// CLICK COMPLETE URL
router.post("/complete", async (req, res) => {
  try {
    const { merchant_trans_id, error, amount } = req.body;
    console.log("Complete kelgan data:", req.body);

    if (error !== 0) {
      return res.status(200).json({
        error: error,
        error_note: "Xatolik yuz berdi",
      });
    }

    const uploadedFile = await File.findById(merchant_trans_id);
    const scannedFile = await scanFileModel.findById(merchant_trans_id);
    const serviceData = uploadedFile || scannedFile;

    if (!serviceData) {
      return res.status(200).json({
        error: -5,
        error_note: "Fayl topilmadi",
      });
    }

    // Agar fayl miqdori noto'g'ri bo'lsa, xatolik yuborish
    if (serviceData.amount && serviceData.amount !== amount) {
      return res.status(200).json({
        error: -2,
        error_note: "Noto'g'ri miqdor",
      });
    }

    // To'lovni tekshirish
    const existingPayment = await paidModel.findOne({ _id: merchant_trans_id });
    if (existingPayment) {
      return res.status(200).json({
        error: -4,
        error_note: "To'lov allaqachon amalga oshirilgan",
      });
    }

    // To'lovni tasdiqlash
    await paidModel.findByIdAndUpdate(merchant_trans_id, {
      status: "paid",
      amount,
      date: new Date(),
    });

    // Faylni o'chirish
    if (uploadedFile) {
      await File.findByIdAndDelete(merchant_trans_id);
    }
    if (scannedFile) {
      await scanFileModel.findByIdAndDelete(merchant_trans_id);
    }

    return res.status(200).json({
      error: 0,
      error_note: "To'lov tasdiqlandi",
    });
  } catch (error) {
    console.error("Complete error:", error);
    return res.status(200).json({
      error: -1,
      error_note: "Server xatosi",
    });
  }
});

export default router;
