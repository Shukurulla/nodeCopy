// router/paid.routes.js fayliga o'zgartirish

import express from "express";
import paidModel from "../model/paid.model.js";

const router = express.Router();

// Barcha to'lovlarni olish
router.get("/all", async (req, res) => {
  try {
    const allPaidFiles = await paidModel.find().sort({ date: -1 });
    res.json({ status: "success", data: allPaidFiles });
  } catch (error) {
    res.status(500).json({ status: "error", message: error.message });
  }
});

// To'lovlarning holatini o'zgartirish
router.put("/:id/status", async (req, res) => {
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

    // Socket.io orqali real-time xabar yuborish
    req.app.get("io").emit("tolovStatusYangilandi", {
      id: payment._id,
      status: payment.status,
    });

    res.json({ status: "success", data: payment });
  } catch (error) {
    res.status(500).json({ status: "error", message: error.message });
  }
});

export default router;
