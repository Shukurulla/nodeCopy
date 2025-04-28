import express from "express";
import paidModel from "../model/paid.model.js";

const router = express.Router();

router.get("/all", async (req, res) => {
  try {
    const allPaidFiles = await paidModel.find();
    res.json({ status: "succces", data: allPaidFiles });
  } catch (error) {
    res.status(500).json({ status: "error", message: error.message });
  }
});

export default router;
