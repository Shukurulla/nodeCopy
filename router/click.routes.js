import express from "express";
import paidModel from "../model/paid.model.js";
import File from "../model/file.model.js";
import scanFileModel from "../model/scanFile.model.js";
import md5 from "md5";

const router = express.Router();

// Signature tekshirish funksiyasi
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

// Helper: Javob yuborish funksiyasi
const sendClickResponse = (res, error, error_note) => {
  res
    .set({
      "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
    })
    .send(`error=${error}&error_note=${encodeURIComponent(error_note)}`);
};

// Prepare
router.post("/prepare", async (req, res) => {
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
    const isValid = clickCheckToken(signatureData, sign_string);

    if (!isValid) {
      return sendClickResponse(res, -1, "SIGN CHECK FAILED!");
    }

    // File tekshirish
    const uploadedFile = await File.findById(merchant_trans_id);
    const scannedFile = await scanFileModel.findById(merchant_trans_id);

    if (!uploadedFile && !scannedFile) {
      return sendClickResponse(res, -5, "User does not exist");
    }

    return sendClickResponse(res, 0, "Success");
  } catch (error) {
    console.error("Prepare error:", error);
    return sendClickResponse(res, -9, "Technical error");
  }
});

// Complete
router.post("/complete", async (req, res) => {
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
      error,
    } = data;

    const signatureData = {
      click_trans_id,
      service_id,
      orderId: merchant_trans_id,
      merchant_prepare_id,
      amount,
      action,
      sign_time,
    };
    const isValid = clickCheckToken(signatureData, sign_string);

    if (!isValid) {
      return sendClickResponse(res, -1, "SIGN CHECK FAILED!");
    }

    if (error !== 0) {
      return sendClickResponse(res, error, "Transaction cancelled");
    }

    const uploadedFile = await File.findById(merchant_trans_id);
    const scannedFile = await scanFileModel.findById(merchant_trans_id);
    const serviceData = uploadedFile || scannedFile;

    if (!serviceData) {
      return sendClickResponse(res, -5, "User does not exist");
    }

    const existingPayment = await paidModel.findOne({ _id: merchant_trans_id });
    if (existingPayment) {
      return sendClickResponse(res, -4, "Already paid");
    }

    if (!amount) {
      return sendClickResponse(res, -2, "Incorrect parameter amount");
    }

    await paidModel.create({
      status: "paid",
      serviceData: serviceData,
      amount: +amount,
      date: new Date(),
    });

    if (uploadedFile) {
      await File.findByIdAndDelete(merchant_trans_id);
    }
    if (scannedFile) {
      await scanFileModel.findByIdAndDelete(merchant_trans_id);
    }

    return sendClickResponse(res, 0, "Success");
  } catch (error) {
    console.error("Complete error:", error);
    return sendClickResponse(res, -9, "Technical error");
  }
});

export default router;
