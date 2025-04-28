import express from "express";
import paidModel from "../model/paid.model.js";
import File from "../model/file.model.js";
import scanFileModel from "../model/scanFile.model.js";
import md5 from "md5";
import { ClickError } from "../enum/transaction.enum.js";

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
const sendClickResponse = (result) => {
  res
    .set({
      "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
    })
    .send(result);
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
      return sendClickResponse({
        error: ClickError.SignFailed,
        error_note: "Invalid sign",
      });
    }

    // File tekshirish
    const uploadedFile = await File.findById(merchant_trans_id);
    const scannedFile = await scanFileModel.findById(merchant_trans_id);

    if (!uploadedFile && !scannedFile) {
      return sendClickResponse({
        error: ClickError.UserNotFound,
        error_note: "User not found",
      });
    }
    const time = new Date().getTime();

    return sendClickResponse({
      click_trans_id,
      merchant_trans_id,
      merchant_prepare_id: time,
      error: ClickError.Success,
      error_note: "Success",
    });
  } catch (error) {
    console.error("Prepare error:", error);
    return sendClickResponse({
      error: ClickError.TransactionCanceled,
      error_note: "Technical error",
    });
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
      return sendClickResponse({
        error: ClickError.SignFailed,
        error_note: "Invalid sign",
      });
    }

    const uploadedFile = await File.findById(merchant_trans_id);
    const scannedFile = await scanFileModel.findById(merchant_trans_id);
    const serviceData = uploadedFile || scannedFile;

    if (!serviceData) {
      return sendClickResponse({
        error: ClickError.UserNotFound,
        error_note: "User not found",
      });
    }

    const existingPayment = await paidModel.findOne({ _id: merchant_trans_id });
    if (existingPayment) {
      return {
        error: ClickError.AlreadyPaid,
        error_note: "Already paid for course",
      };
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
    const time = new Date().getTime();

    return {
      click_trans_id,
      merchant_trans_id,
      merchant_confirm_id: time,
      error: ClickError.Success,
      error_note: "Success",
    };
  } catch (error) {
    console.error("Complete error:", error);
    return sendClickResponse({
      error: ClickError.TransactionCanceled,
      error_note: "Technical error",
    });
  }
});

export default router;
