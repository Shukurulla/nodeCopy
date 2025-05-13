import express from "express";
import paidModel from "../model/paid.model.js";
import File from "../model/file.model.js";
import scanFileModel from "../model/scanFile.model.js";
import { ClickError } from "../enum/transaction.enum.js";
import crypto from "crypto";

const router = express.Router();

// Signature tekshirish
const paymeCheckSign = (headers) => {
  const auth = headers["authorization"];
  if (!auth || !auth.startsWith("Basic ")) return false;
  const encoded = auth.split(" ")[1];
  const decoded = Buffer.from(encoded, "base64").toString();
  const [username, password] = decoded.split(":");
  return (
    username === process.env.PAYME_ID &&
    password === process.env.PAYME_SECRET_KEY
  );
};

// Javob yuboruvchi helper
const sendPaymeResponse = (res, result) => {
  res.setHeader("Content-Type", "application/json");
  res.status(200).json(result);
};

// Prepare
router.post("/prepare", async (req, res) => {
  if (!paymeCheckSign(req.headers)) {
    return sendPaymeResponse(res, {
      error: { code: ClickError.SignFailed, message: "Invalid sign" },
    });
  }

  const { method, params } = req.body;

  if (method !== "CheckPerformTransaction") {
    return sendPaymeResponse(res, {
      error: { code: ClickError.ActionNotFound, message: "Invalid method" },
    });
  }

  const orderId = params.account.order_id;
  const amount = +params.amount;

  const file = await File.findById(orderId);
  const scannedFile = await scanFileModel.findById(orderId);

  if (!file && !scannedFile) {
    return sendPaymeResponse(res, {
      error: { code: ClickError.UserNotFound, message: "User not found" },
    });
  }

  return sendPaymeResponse(res, {
    result: {
      allow: true,
    },
  });
});

// Complete
router.post("/complete", async (req, res) => {
  if (!paymeCheckSign(req.headers)) {
    return sendPaymeResponse(res, {
      error: { code: ClickError.SignFailed, message: "Invalid sign" },
    });
  }

  const { method, params } = req.body;

  if (method !== "PerformTransaction") {
    return sendPaymeResponse(res, {
      error: { code: ClickError.ActionNotFound, message: "Invalid method" },
    });
  }

  const orderId = params.account.order_id;
  const amount = +params.amount;

  const file = await File.findById(orderId);
  const scannedFile = await scanFileModel.findById(orderId);
  const serviceData = file || scannedFile;

  if (!serviceData) {
    return sendPaymeResponse(res, {
      error: { code: ClickError.UserNotFound, message: "User not found" },
    });
  }

  const existingPayment = await paidModel.findOne({ _id: orderId });
  if (existingPayment) {
    return sendPaymeResponse(res, {
      error: { code: ClickError.AlreadyPaid, message: "Already paid" },
    });
  }

  await paidModel.create({
    _id: orderId,
    status: "paid",
    serviceData,
    amount: +amount,
    date: new Date(),
  });

  if (file) await File.findByIdAndDelete(orderId);
  if (scannedFile) await scanFileModel.findByIdAndDelete(orderId);

  return sendPaymeResponse(res, {
    result: {
      transaction: orderId,
      perform_time: Date.now(),
      state: 2,
    },
  });
});

// QR yoki to'lov linki olish - payme_id foydalanuvchidan olinadi
router.post("/get-payme-link", async (req, res) => {
  try {
    const { orderId, amount, payme_id } = req.body;

    if (!orderId || !amount || !payme_id) {
      return res.json({
        status: "error",
        message: "Iltimos, orderId, amount va payme_id ni kiriting",
      });
    }

    const paymeLink = `https://checkout.paycom.uz/${payme_id}?amount=${amount}&account[order_id]=${orderId}`;
    const qrCode = `http://api.qrserver.com/v1/create-qr-code/?data=${encodeURIComponent(
      paymeLink
    )}&size=500x500`;

    return res.json({
      status: "success",
      data: {
        link: paymeLink,
        qr: qrCode,
      },
    });
  } catch (error) {
    return res.status(500).json({
      status: "error",
      message: error.message,
    });
  }
});

export default router;
