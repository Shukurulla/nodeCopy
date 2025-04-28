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

    const uploadedFile = await File.findById(merchant_trans_id);
    const scannedFile = await scanFileModel.findById(merchant_trans_id);

    if (!uploadedFile && !scannedFile) {
      return res.status(200).json({
        error: -5,
        error_note: "Fayl topilmadi",
      });
    }

    // Faylni tayyorlash
    await paidModel.create({
      _id: merchant_trans_id,
      status: "pending", // To'lovni tayyorlash
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

router.post("/complete", async (req, res) => {
  try {
    const { merchant_trans_id, error, amount } = req.body; // amountni olish
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

    // To'lovni tekshirish (allaqachon to'langan bo'lsa)
    const existingPayment = await paidModel.findOne({ _id: merchant_trans_id });
    if (existingPayment) {
      return res.status(200).json({
        error: -4,
        error_note: "To'lov allaqachon amalga oshirilgan",
      });
    }

    // Agar amount bo'lsa, uni saqlash
    if (!amount) {
      return res.status(200).json({
        error: -2,
        error_note: "Summa belgilangan emas",
      });
    }

    // To'lovni tasdiqlash
    await paidModel.create({
      status: "paid",
      serviceData: serviceData, // ServiceData ni to'ldir
      amount: amount, // Amountni to'ldir
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
