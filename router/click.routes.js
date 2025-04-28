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

    if (!uploadedFile && !scannedFile) {
      return res.status(200).json({
        error: -5, // Clickda noto'g'ri ID uchun -5 error kodi ishlatiladi
        error_note: "User does not exist",
      });
    }

    return res.status(200).json({
      error: 0,
      error_note: "Success", // <<< Muhim!
    });
  } catch (error) {
    console.error("Prepare error:", error);
    return res.status(200).json({
      error: -1,
      error_note: "Server error",
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
        error_note: "Error occurred",
      });
    }

    const uploadedFile = await File.findById(merchant_trans_id);
    const scannedFile = await scanFileModel.findById(merchant_trans_id);

    let serviceData = uploadedFile || scannedFile;

    if (!serviceData) {
      return res.status(200).json({
        error: -5,
        error_note: "User does not exist",
      });
    }

    await paidModel.create({
      serviceData,
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
      error_note: "Success", // <<< Muhim!
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
