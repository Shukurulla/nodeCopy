import express from "express";
import paidModel from "../model/paid.model.js"; // To'langan fayllar
import File from "../model/file.model.js";
import scanFileModel from "../model/scanFile.model.js";

const router = express.Router();

// CLICK PREPARE URL
router.post("/prepare", async (req, res) => {
  try {
    const { merchant_trans_id } = req.body;
    console.log("Prepare kelgan data:", req.body);

    // Faylni tekshirish
    const uploadedFile = await File.findById(merchant_trans_id);
    const scannedFile = await scanFileModel.findById(merchant_trans_id);

    if (!uploadedFile && !scannedFile) {
      return res.status(200).json({
        error: -5, // UserNotFound, product not found
        error_note: "Fayl topilmadi", // File not found
      });
    }

    // To'lovni oldindan qoshish (prepare faqat)
    return res.status(200).json({
      error: 0, // Success
      error_note: "OK", // Success message
    });
  } catch (error) {
    console.error("Prepare error:", error);
    return res.status(200).json({
      error: -1, // SignFailed (or a general error code)
      error_note: "Server xatosi", // Server error message
    });
  }
});

// CLICK COMPLETE URL
router.post("/complete", async (req, res) => {
  try {
    const { merchant_trans_id, error, amount } = req.body; // amountni olish
    console.log("Complete kelgan data:", req.body);

    if (error !== 0) {
      return res.status(200).json({
        error: error, // Use the provided error code
        error_note: "Xatolik yuz berdi", // Error note
      });
    }

    // Faylni tekshirish
    const uploadedFile = await File.findById(merchant_trans_id);
    const scannedFile = await scanFileModel.findById(merchant_trans_id);
    const serviceData = uploadedFile || scannedFile;

    if (!serviceData) {
      return res.status(200).json({
        error: -5, // UserNotFound, file not found
        error_note: "Fayl topilmadi", // File not found
      });
    }

    // To'lovni tekshirish (Allaqachon to'langan bo'lsa)
    const existingPayment = await paidModel.findOne({ _id: merchant_trans_id });
    if (existingPayment) {
      return res.status(200).json({
        error: -4, // AlreadyPaid
        error_note: "To'lov allaqachon amalga oshirilgan", // Payment already made
      });
    }

    // Agar amount bo'lsa, uni saqlash
    if (!amount) {
      return res.status(200).json({
        error: -2, // InvalidAmount
        error_note: "Summa belgilangan emas", // Amount not specified
      });
    }

    // To'lovni tasdiqlash
    await paidModel.create({
      status: "paid",
      serviceData: serviceData, // ServiceData ni to'ldir
      amount: +amount, // Amountni to'ldir
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
      error: 0, // Success
      error_note: "To'lov tasdiqlandi", // Payment confirmed
    });
  } catch (error) {
    console.error("Complete error:", error);
    return res.status(200).json({
      error: -1, // General error
      error_note: "Server xatosi", // Server error
    });
  }
});

export default router;
