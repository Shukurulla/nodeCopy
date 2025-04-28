import express from "express";
import paidModel from "../model/paid.model.js"; // To'langan fayllar
import File from "../model/file.model.js";
import scanFileModel from "../model/scanFile.model.js";

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
        .json({ error: "Invalid signature", error_note: "Invalid sign" });
    }

    // Servicega murojaat qilish
    const result = await clickService.prepare(data);
    res
      .set({
        headers: {
          "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
        },
      })
      .send(result);
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
        .json({ error: "Invalid signature", error_note: "Invalid sign" });
    }

    // Servicega murojaat qilish
    const result = await clickService.complete(data);
    res
      .set({
        headers: {
          "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
        },
      })
      .send(result);
  } catch (error) {
    next(error);
  }
});
export default router;
