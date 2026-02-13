import express from "express";
import paidModel from "../model/paid.model.js";
import VendingApparat from "../model/vendingApparat.model.js";
import { authMiddleware } from "./admin.routes.js";

const router = express.Router();

// Barcha to'lovlarni olish (role-based)
router.get("/all", authMiddleware, async (req, res) => {
  try {
    let allPaidFiles;

    if (req.admin.role === "superadmin") {
      allPaidFiles = await paidModel.find().sort({ date: -1 });
    } else {
      // Oddiy admin faqat o'z apparatlari to'lovlarini ko'radi
      const apparatlar = await VendingApparat.find(
        { adminId: req.admin.id },
        { apparatId: 1 }
      );
      const apparatIds = apparatlar.map((a) => a.apparatId);

      allPaidFiles = await paidModel
        .find({
          "serviceData.apparatId": { $in: apparatIds },
        })
        .sort({ date: -1 });
    }

    res.json({ status: "success", data: allPaidFiles });
  } catch (error) {
    res.status(500).json({ status: "error", message: error.message });
  }
});

// To'lovlarning holatini o'zgartirish
router.put("/:id/status", authMiddleware, async (req, res) => {
  try {
    const { status } = req.body;
    const payment = await paidModel.findById(req.params.id);

    if (!payment) {
      return res
        .status(404)
        .json({ status: "error", message: "To'lov topilmadi" });
    }

    payment.status = status;
    await payment.save();

    req.app.get("io").emit("tolovStatusYangilandi", {
      id: payment._id,
      status: payment.status,
    });

    res.json({ status: "success", data: payment });
  } catch (error) {
    res.status(500).json({ status: "error", message: error.message });
  }
});

router.get("/delete-all", authMiddleware, async (req, res) => {
  try {
    if (req.admin.role !== "superadmin") {
      return res
        .status(403)
        .json({ status: "error", message: "Faqat super admin uchun" });
    }
    await paidModel.deleteMany({});
    res.json({ status: "success", message: "Barcha to'lovlar o'chirildi" });
  } catch (error) {
    res.status(500).json({ status: "error", message: error.message });
  }
});

export default router;
