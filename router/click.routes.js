import express from "express";
import paidModel from "../model/paid.model.js";
import File from "../model/file.model.js";
import scanFileModel from "../model/scanFile.model.js";
import Statistika from "../model/statistika.model.js"; // Yangi qo'shildi
import VendingApparat from "../model/vendingApparat.model.js"; // Yangi qo'shildi
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
const sendClickResponse = (result, res) => {
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
      return sendClickResponse(
        {
          error: ClickError.SignFailed,
          error_note: "Invalid sign",
        },
        res
      );
    }

    // File tekshirish
    const uploadedFile = await File.findById(merchant_trans_id);
    const scannedFile = await scanFileModel.findById(merchant_trans_id);

    if (!uploadedFile && !scannedFile) {
      return sendClickResponse(
        {
          error: ClickError.UserNotFound,
          error_note: "User not found",
        },
        res
      );
    }
    const time = new Date().getTime();

    return sendClickResponse(
      {
        click_trans_id,
        merchant_trans_id,
        merchant_prepare_id: time,
        error: ClickError.Success,
        error_note: "Success",
      },
      res
    );
  } catch (error) {
    console.error("Prepare error:", error);
    return sendClickResponse(
      {
        error: ClickError.TransactionCanceled,
        error_note: "Technical error",
      },
      res
    );
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
      return sendClickResponse(
        {
          error: ClickError.SignFailed,
          error_note: "Invalid sign",
        },
        res
      );
    }

    const uploadedFile = await File.findById(merchant_trans_id);
    const scannedFile = await scanFileModel.findById(merchant_trans_id);
    const serviceData = uploadedFile || scannedFile;

    if (!serviceData) {
      return sendClickResponse(
        {
          error: ClickError.UserNotFound,
          error_note: "User not found",
        },
        res
      );
    }

    const existingPayment = await paidModel.findOne({ _id: merchant_trans_id });
    if (existingPayment) {
      return sendClickResponse(
        {
          error: ClickError.AlreadyPaid,
          error_note: "Already paid",
        },
        res
      );
    }

    // To'lovni bazaga qo'shish
    await paidModel.create({
      status: "paid",
      serviceData: serviceData,
      amount: +amount,
      date: new Date(),
    });

    // Yangi: To'lov statistikasini yangilash
    if (uploadedFile) {
      const apparatId = uploadedFile.apparatId;
      const bugun = new Date();
      bugun.setHours(0, 0, 0, 0);

      // Statistikani qidirish yoki yaratish
      let statistika = await Statistika.findOne({
        apparatId,
        sana: {
          $gte: bugun,
        },
      });

      if (!statistika) {
        statistika = new Statistika({
          apparatId,
          sana: bugun,
          foydalanishSoni: 1,
          daromad: +amount,
          ishlatilganQogoz: 1, // Default 1 ta - bu qiymatni o'zgartirish mumkin
        });
      } else {
        statistika.foydalanishSoni += 1;
        statistika.daromad += +amount;
        statistika.ishlatilganQogoz += 1; // Default 1 ta
      }

      await statistika.save();

      // Apparatning qog'oz sonini kamaytirish
      const apparat = await VendingApparat.findOne({ apparatId });
      if (apparat) {
        apparat.joriyQogozSoni -= 1; // Default 1 ta
        await apparat.save();

        // Qog'oz kam qolganda xabar berish
        if (apparat.joriyQogozSoni <= apparat.kamQogozChegarasi) {
          req.app.get("io").emit("qogozKam", {
            apparatId,
            joriyQogozSoni: apparat.joriyQogozSoni,
            xabar: `Diqqat! ${apparat.nomi} apparatida qog'oz kam qoldi: ${apparat.joriyQogozSoni} ta`,
          });
        }
      }

      // Socketga to'lov haqida xabar yuborish
      req.app.get("io").emit("tolovMuvaffaqiyatli", {
        fileId: merchant_trans_id,
        apparatId,
        amount: +amount,
        qogozSoni: 1,
      });
    }

    const time = new Date().getTime();

    return sendClickResponse(
      {
        click_trans_id,
        merchant_trans_id,
        merchant_confirm_id: time,
        error: ClickError.Success,
        error_note: "Success",
      },
      res
    );
  } catch (error) {
    console.error("Complete error:", error);
    return sendClickResponse(
      {
        error: ClickError.TransactionCanceled,
        error_note: "Technical error",
      },
      res
    );
  }
});

router.post("/get-click-link", async (req, res) => {
  try {
    const { orderId, amount } = req.body;
    if (!orderId || !amount) {
      return res.json({
        status: "error",
        message: "iltimos malumotlarni toliq kiriting",
      });
    }
    const qrCode = `https://my.click.uz/services/pay?service_id=71257&merchant_id=38721&amount=${amount}&transaction_param=${orderId}`;
    return res.json({ status: "success", data: qrCode });
  } catch (error) {
    res.status(500).json({ status: "error", message: error.message });
  }
});

export default router;
