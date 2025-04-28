import express from "express";
import paidModel from "../model/paid.model.js"; // To'langan fayllar
import File from "../model/file.model.js";
import scanFileModel from "../model/scanFile.model.js";
import md5 from "md5";
import { ClickError } from "../enum/transaction.enum.js"; // Enumni import qilish
import clickService from "../services/click.service.js"; // Service import qilish

const router = express.Router();

const clickCheckToken = (data, signString) => {
  const {
    click_trans_id,
    service_id,
    orderId,
    merchant_prepare_id,
    amount,
    action,
    sign_time,
  } = data;
  const CLICK_SECRET_KEY = process.env.CLICK_SECRET_KEY;
  const prepareId = merchant_prepare_id || "";
  const signature = `${click_trans_id}${service_id}${CLICK_SECRET_KEY}${orderId}${prepareId}${amount}${action}${sign_time}`;
  const signatureHash = md5(signature);
  return signatureHash === signString;
};

// Prepare Route
router.post("/prepare", async (req, res, next) => {
  try {
    const data = req.body;
    const {
      click_trans_id,
      service_id,
      merchant_trans_id,
      amount,
      action,
      sign_time,
      sign_string,
    } = data;

    // Tokenni tekshirish
    const signatureData = {
      click_trans_id,
      service_id,
      orderId: merchant_trans_id,
      amount,
      action,
      sign_time,
    };
    const checkSignature = clickCheckToken(signatureData, sign_string);

    if (!checkSignature) {
      return res
        .status(400)
        .set({
          "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
        })
        .send("Invalid signature");
    }

    // Servicega murojaat qilish
    const result = await clickService.prepare(data);
    return res
      .set({
        "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
      })
      .send(result); // HTML tarzida yuborish
  } catch (error) {
    next(error);
  }
});

// Complete Route
router.post("/complete", async (req, res, next) => {
  try {
    const data = req.body;
    const {
      click_trans_id,
      service_id,
      merchant_trans_id,
      merchant_prepare_id,
      amount,
      action,
      sign_time,
      sign_string,
    } = data;

    // Tokenni tekshirish
    const signatureData = {
      click_trans_id,
      service_id,
      orderId: merchant_trans_id,
      merchant_prepare_id,
      amount,
      action,
      sign_time,
    };
    const checkSignature = clickCheckToken(signatureData, sign_string);

    if (!checkSignature) {
      return res
        .status(400)
        .set({
          "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
        })
        .send("Invalid signature");
    }

    // To'lovni tekshirish
    const existingPayment = await paidModel.findOne({ _id: merchant_trans_id });
    if (existingPayment) {
      return res
        .status(200)
        .set({
          "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
        })
        .send("Payment already made");
    }

    // Faylni tekshirish
    const uploadedFile = await File.findById(merchant_trans_id);
    const scannedFile = await scanFileModel.findById(merchant_trans_id);
    const serviceData = uploadedFile || scannedFile;

    if (!serviceData) {
      return res
        .status(200)
        .set({
          "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
        })
        .send("File not found");
    }

    // To'lovni tasdiqlash
    if (!amount) {
      return res
        .status(200)
        .set({
          "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
        })
        .send("Invalid amount");
    }

    // To'lovni saqlash
    await paidModel.create({
      status: "paid",
      serviceData: serviceData,
      amount: +amount,
      date: new Date(),
    });

    // Faylni o'chirish
    if (uploadedFile) {
      await File.findByIdAndDelete(merchant_trans_id);
    }
    if (scannedFile) {
      await scanFileModel.findByIdAndDelete(merchant_trans_id);
    }

    return res
      .status(200)
      .set({
        "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
      })
      .send("Payment confirmed");
  } catch (error) {
    next(error);
  }
});

export default router;
