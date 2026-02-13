import express from "express";
import Settings from "../model/settings.model.js";
import { authMiddleware } from "./admin.routes.js";
import { requireSuperAdmin } from "../middleware/roleMiddleware.js";

const router = express.Router();

// Narxlarni olish (ATM va admin panel uchun - auth kerak emas)
router.get("/", async (req, res) => {
  try {
    let settings = await Settings.findOne();

    // Agar sozlamalar bazada yo'q bo'lsa, default qiymatlar bilan yaratamiz
    if (!settings) {
      settings = await Settings.create({
        printOneSide: 500,
        printTwoSide: 800,
        scanOneSide: 500,
        scanTwoSide: 800,
        copyOneSide: 500,
        copyTwoSide: 800,
      });
    }

    res.json({ muvaffaqiyat: true, malumot: settings });
  } catch (error) {
    res.status(500).json({ muvaffaqiyat: false, xabar: error.message });
  }
});

// Narxlarni yangilash (faqat superadmin uchun)
router.put("/", authMiddleware, requireSuperAdmin, async (req, res) => {
  try {
    const {
      printOneSide,
      printTwoSide,
      scanOneSide,
      scanTwoSide,
      copyOneSide,
      copyTwoSide,
    } = req.body;

    // Validatsiya - manfiy qiymat bo'lmasligi kerak
    const fields = {
      printOneSide,
      printTwoSide,
      scanOneSide,
      scanTwoSide,
      copyOneSide,
      copyTwoSide,
    };

    for (const [key, value] of Object.entries(fields)) {
      if (value !== undefined && value < 0) {
        return res.status(400).json({
          muvaffaqiyat: false,
          xabar: `${key} qiymati 0 dan kam bo'lmasligi kerak`,
        });
      }
    }

    let settings = await Settings.findOne();

    if (!settings) {
      settings = await Settings.create(fields);
    } else {
      // Faqat yuborilgan maydonlarni yangilaymiz
      if (printOneSide !== undefined) settings.printOneSide = printOneSide;
      if (printTwoSide !== undefined) settings.printTwoSide = printTwoSide;
      if (scanOneSide !== undefined) settings.scanOneSide = scanOneSide;
      if (scanTwoSide !== undefined) settings.scanTwoSide = scanTwoSide;
      if (copyOneSide !== undefined) settings.copyOneSide = copyOneSide;
      if (copyTwoSide !== undefined) settings.copyTwoSide = copyTwoSide;

      await settings.save();
    }

    res.json({ muvaffaqiyat: true, malumot: settings });
  } catch (error) {
    res.status(500).json({ muvaffaqiyat: false, xabar: error.message });
  }
});

export default router;
