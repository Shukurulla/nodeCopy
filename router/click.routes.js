import express from "express";
import paidModel from "../models/paid.model.js"; // skanerlangan fayl modeli
import File from "../model/file.model.js";
import scanFileModel from "../model/scanFile.model.js";

const router = express.Router();

// CLICK PREPARE URL
router.post("/prepare", async (req, res) => {
  try {
    const { merchant_trans_id } = req.body;
    console.log("Prepare kelgan data:", req.body);

    // Bu yerda file mavjudligini tekshirasan
    const uploadedFile = await File.findById(merchant_trans_id);
    const scannedFile = await scanFileModel.findById(merchant_trans_id);

    if (!uploadedFile && !scannedFile) {
      return res.status(400).json({
        error: "File topilmadi",
        error_note: "Bunday file id mavjud emas",
      });
    }

    return res.status(200).json({
      error: 0,
      error_note: "OK",
    });
  } catch (error) {
    console.error("Prepare error:", error);
    return res.status(500).json({
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

    if (error != 0) {
      return res.status(200).json({
        error: error,
        error_note: "To'lov bekor qilindi",
      });
    }

    // Faylni qidiramiz
    const uploadedFile = await File.findById(merchant_trans_id);
    const scannedFile = await scanFileModel.findById(merchant_trans_id);

    let serviceData = uploadedFile || scannedFile;

    if (!serviceData) {
      return res.status(400).json({
        error: -1,
        error_note: "File topilmadi",
      });
    }

    // PaidModel'ga saqlaymiz
    await paidModel.create({
      serviceData,
      status: "paid",
      amount: amount,
      date: new Date(),
    });

    // Eski faylni o'chiramiz
    if (uploadedFile) {
      await uploadModel.findByIdAndDelete(merchant_trans_id);
    }
    if (scannedFile) {
      await scanModel.findByIdAndDelete(merchant_trans_id);
    }

    return res.status(200).json({
      error: 0,
      error_note: "To'lov muvaffaqiyatli yakunlandi",
    });
  } catch (error) {
    console.error("Complete error:", error);
    return res.status(500).json({
      error: -1,
      error_note: "Server xatosi",
    });
  }
});

export default router;
