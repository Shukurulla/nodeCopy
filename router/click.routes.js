import express from "express";
import paidModel from "../model/paid.model.js"; // To'langan fayllar
import File from "../model/file.model.js";
import scanFileModel from "../model/scanFile.model.js";
import {
  ClickError,
  ClickAction,
  TransactionState,
} from "../enum/transaction.enum.js"; // Import enum

const router = express.Router();

// CLICK PREPARE URL
router.post("/prepare", async (req, res) => {
  try {
    const { merchant_trans_id } = req.body;
    console.log("Prepare kelgan data:", req.body);

    const uploadedFile = await File.findById(merchant_trans_id);
    const scannedFile = await scanFileModel.findById(merchant_trans_id);

    // Fayl topilmasa xato
    if (!uploadedFile && !scannedFile) {
      return res.status(200).json({
        error: ClickError.TransactionNotFound, // Using correct enum error
        error_note: "Fayl topilmadi",
      });
    }

    return res.status(200).json({
      error: ClickError.Success, // Using correct enum error
      error_note: "OK",
    });
  } catch (error) {
    console.error("Prepare error:", error);
    return res.status(200).json({
      error: ClickError.SignFailed, // Using correct enum error
      error_note: "Server xatosi",
    });
  }
});

router.post("/complete", async (req, res) => {
  try {
    const { merchant_trans_id, error, amount } = req.body; // amountni olish
    console.log("Complete kelgan data:", req.body);

    // Agar xato bo'lsa, darhol javob beramiz
    if (error !== 0) {
      return res.status(200).json({
        error: error,
        error_note: "Xatolik yuz berdi",
      });
    }

    // Faylni tekshirish
    const uploadedFile = await File.findById(merchant_trans_id);
    const scannedFile = await scanFileModel.findById(merchant_trans_id);
    const serviceData = uploadedFile || scannedFile;

    // Agar fayl topilmasa, xato
    if (!serviceData) {
      return res.status(200).json({
        error: ClickError.TransactionNotFound, // Using correct enum error
        error_note: "Fayl topilmadi",
      });
    }

    // To'lovni tekshirish (allaqachon to'langan bo'lsa)
    const existingPayment = await paidModel.findOne({ _id: merchant_trans_id });
    if (existingPayment) {
      return res.status(200).json({
        error: ClickError.AlreadyPaid, // Using correct enum error
        error_note: "To'lov allaqachon amalga oshirilgan",
      });
    }

    // Agar amount bo'lsa, uni saqlash
    if (!amount) {
      return res.status(200).json({
        error: ClickError.InvalidAmount, // Using correct enum error
        error_note: "Summa belgilangan emas",
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
      error: ClickError.Success, // Using correct enum error
      error_note: "To'lov tasdiqlandi",
    });
  } catch (error) {
    console.error("Complete error:", error);
    return res.status(200).json({
      error: ClickError.SignFailed, // Using correct enum error
      error_note: "Server xatosi",
    });
  }
});

export default router;
