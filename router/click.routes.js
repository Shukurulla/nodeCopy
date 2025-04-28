import express from "express";
import paidModel from "../model/paid.model.js"; // skanerlangan fayl modeli
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

    console.log(uploadedFile, scannedFile);

    if (!uploadedFile && !scannedFile) {
      return res.status(200).json({
        error: -5,
        error_note: "Fayl topilmadi",
      });
    }

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
    const { merchant_trans_id, error, amount } = req.body;
    console.log("Complete kelgan data:", req.body);

    if (error != 0) {
      return res.status(200).json({
        error: error,
        error_note: "Error occurred",
      });
    }

    const uploadedFile = await File.findById(merchant_trans_id);
    const scannedFile = await scanFileModel.findById(merchant_trans_id);
    const serviceData = uploadedFile || scannedFile;
    console.log(serviceData);

    if (!serviceData) {
      return res.status(200).json({
        error: -5,
        error_note: "User does not exist",
      });
    }

    // Agar file ichida amount bo'lsa va to'g'ri emas bo'lsa tekshiramiz
    if (serviceData.amount && serviceData.amount !== amount) {
      return res.status(200).json({
        error: -2,
        error_note: "Invalid amount",
      });
    }

    // Transactionni qayta to'lamaslik uchun tekshir
    const existingPayment = await paidModel.findOne({ _id: merchant_trans_id });
    if (existingPayment) {
      return res.status(200).json({
        error: -4,
        error_note: "Transaction already paid",
      });
    }

    await paidModel.create({
      ...serviceData._doc, // <<< MUHIM TO'G'RILASH
      status: "paid",
      amount: amount,
      date: new Date(),
    });

    if (uploadedFile) {
      await File.findByIdAndDelete(merchant_trans_id);
    }
    if (scannedFile) {
      await scanFileModel.findByIdAndDelete(merchant_trans_id);
    }

    return res.status(200).json({
      error: 0,
      error_note: "Success",
    });
  } catch (error) {
    console.error("Complete error:", error);
    return res.status(200).json({
      error: -1,
      error_note: "Server error",
    });
  }
});

export default router;
