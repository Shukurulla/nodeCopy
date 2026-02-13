import express from "express";
import paidModel from "../model/paid.model.js";
import File from "../model/file.model.js";
import scanFileModel from "../model/scanFile.model.js";
import copyModel from "../model/copy.model.js";
import Statistika from "../model/statistika.model.js";
import VendingApparat from "../model/vendingApparat.model.js";
import Admin from "../model/admin.model.js";
import { decrypt } from "../utils/encryption.js";
import md5 from "md5";
import { ClickError } from "../enum/transaction.enum.js";
import mongoose from "mongoose";

const router = express.Router();

// Barcha so'rovlarni log qilish middleware
router.use((req, res, next) => {
  console.log("=".repeat(80));
  console.log(`CLICK SO'ROV KELDI:`, {
    method: req.method,
    url: req.url,
    timestamp: new Date().toISOString(),
  });
  console.log("Body:", JSON.stringify(req.body, null, 2));
  console.log("=".repeat(80));
  next();
});

// Fallback credentials (env dan)
const FALLBACK_SECRET_KEY = process.env.CLICK_SECRET_KEY || "cCmLS75coPW7E";
const FALLBACK_SERVICE_ID = process.env.CLICK_SERVICE_ID || "71257";
const FALLBACK_MERCHANT_ID = process.env.CLICK_MERCHANT_ID || "38721";

// Apparatdan admin Click credentials olish
async function getClickCredentials(apparatId) {
  try {
    if (!apparatId) return null;

    const apparat = await VendingApparat.findOne({ apparatId });
    if (!apparat || !apparat.adminId) return null;

    const admin = await Admin.findById(apparat.adminId);
    if (!admin || !admin.clickCredentials) return null;

    const creds = admin.clickCredentials;
    const secretKey = decrypt(creds.secretKey);
    const serviceId = decrypt(creds.serviceId);
    const merchantId = decrypt(creds.merchantId);

    // Agar credentials bo'sh bo'lsa, null qaytarish (fallback ishlatiladi)
    if (!secretKey || !serviceId || !merchantId) return null;

    return { secretKey, serviceId, merchantId };
  } catch (error) {
    console.error("Click credentials olishda xatolik:", error);
    return null;
  }
}

// Signature tekshirish funksiyasi - dinamik secretKey bilan
const clickCheckToken = (data, signString, secretKey) => {
  try {
    const {
      click_trans_id,
      service_id,
      merchant_trans_id,
      merchant_prepare_id,
      amount,
      action,
      sign_time,
    } = data;

    const prepareId = merchant_prepare_id || "";

    let signature;
    if (action === "0" || action === 0) {
      signature = `${click_trans_id}${service_id}${secretKey}${merchant_trans_id}${amount}${action}${sign_time}`;
    } else {
      signature = `${click_trans_id}${service_id}${secretKey}${merchant_trans_id}${prepareId}${amount}${action}${sign_time}`;
    }

    const signatureHash = md5(signature);

    console.log("Signature tekshirish:", {
      is_valid: signatureHash === signString,
    });

    return signatureHash === signString;
  } catch (error) {
    console.error("Signature tekshirishda xatolik:", error);
    return false;
  }
};

const sendClickResponse = (result, res) => {
  console.log("Click javob:", result);
  res.status(200).json(result);
};

// File/Scan/Copy dan apparatId topish
async function findServiceData(merchantTransId) {
  let serviceData = null;
  let fileType = null;

  const uploadedFile = await File.findById(merchantTransId);
  if (uploadedFile) {
    serviceData = uploadedFile;
    fileType = "uploaded_file";
  } else {
    const scannedFile = await scanFileModel.findById(merchantTransId);
    if (scannedFile) {
      serviceData = scannedFile;
      fileType = "scanned_file";
    } else {
      const copyFile = await copyModel.findById(merchantTransId);
      if (copyFile) {
        serviceData = copyFile;
        fileType = "copy_file";
      }
    }
  }

  return { serviceData, fileType };
}

// PREPARE ENDPOINT
router.post("/prepare", async (req, res) => {
  console.log("PREPARE ENDPOINT ISHGA TUSHDI");

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

    if (
      !click_trans_id ||
      !service_id ||
      !merchant_trans_id ||
      !amount ||
      action === undefined ||
      !sign_time ||
      !sign_string
    ) {
      return sendClickResponse(
        { error: ClickError.BadRequest, error_note: "Missing required parameters" },
        res
      );
    }

    // File topish va credentials olish
    const { serviceData, fileType } = await findServiceData(merchant_trans_id);

    if (!serviceData) {
      return sendClickResponse(
        { error: ClickError.UserNotFound, error_note: "Order not found" },
        res
      );
    }

    // Dinamik credentials olish (apparat → admin → click creds)
    const apparatId = serviceData.apparatId;
    const creds = await getClickCredentials(apparatId);

    const activeSecretKey = creds?.secretKey || FALLBACK_SECRET_KEY;
    const activeServiceId = creds?.serviceId || FALLBACK_SERVICE_ID;

    // Service ID tekshirish
    if (service_id !== activeServiceId) {
      console.log(`Noto'g'ri service_id: ${service_id}, kutilgan: ${activeServiceId}`);
      return sendClickResponse(
        { error: ClickError.BadRequest, error_note: "Invalid service_id" },
        res
      );
    }

    // Signature tekshirish
    const signatureData = {
      click_trans_id,
      service_id,
      merchant_trans_id,
      amount,
      action,
      sign_time,
    };

    const isValid = clickCheckToken(signatureData, sign_string, activeSecretKey);

    if (!isValid) {
      return sendClickResponse(
        { error: ClickError.SignFailed, error_note: "Invalid signature" },
        res
      );
    }

    // Allaqachon to'langanligini tekshirish
    const existingPayment = await paidModel.findOne({
      "serviceData._id": merchant_trans_id,
      status: "paid",
    });

    if (existingPayment) {
      return sendClickResponse(
        { error: ClickError.AlreadyPaid, error_note: "Already paid" },
        res
      );
    }

    const merchant_prepare_id = new Date().getTime();

    return sendClickResponse(
      {
        click_trans_id,
        merchant_trans_id,
        merchant_prepare_id,
        error: ClickError.Success,
        error_note: "Success",
      },
      res
    );
  } catch (error) {
    console.error("Prepare umumiy xatolik:", error);
    return sendClickResponse(
      { error: ClickError.TransactionCanceled, error_note: "Technical error" },
      res
    );
  }
});

// COMPLETE ENDPOINT
router.post("/complete", async (req, res) => {
  console.log("COMPLETE ENDPOINT ISHGA TUSHDI");

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
      error: click_error,
    } = data;

    if (click_error && click_error !== "0" && click_error !== 0) {
      return sendClickResponse(
        { error: ClickError.TransactionCanceled, error_note: "Transaction failed by Click" },
        res
      );
    }

    // File topish va credentials olish
    const { serviceData, fileType } = await findServiceData(merchant_trans_id);

    if (!serviceData) {
      return sendClickResponse(
        { error: ClickError.UserNotFound, error_note: "Order not found" },
        res
      );
    }

    const apparatId = serviceData.apparatId;
    const creds = await getClickCredentials(apparatId);
    const activeSecretKey = creds?.secretKey || FALLBACK_SECRET_KEY;

    // Signature tekshirish
    const signatureData = {
      click_trans_id,
      service_id,
      merchant_trans_id,
      merchant_prepare_id,
      amount,
      action,
      sign_time,
    };

    const isValid = clickCheckToken(signatureData, sign_string, activeSecretKey);

    if (!isValid) {
      return sendClickResponse(
        { error: ClickError.SignFailed, error_note: "Invalid signature" },
        res
      );
    }

    // Takroriy to'lovni tekshirish
    const existingPayment = await paidModel.findOne({
      "serviceData._id": merchant_trans_id,
      status: "paid",
    });

    if (existingPayment) {
      return sendClickResponse(
        {
          click_trans_id,
          merchant_trans_id,
          merchant_confirm_id: merchant_prepare_id,
          error: ClickError.AlreadyPaid,
          error_note: "Already paid",
        },
        res
      );
    }

    // To'lovni saqlash
    const payment = await paidModel.create({
      status: "paid",
      serviceData: serviceData,
      amount: +amount,
      date: new Date(),
      clickTransactionId: click_trans_id,
      paymentMethod: "click",
    });

    // Statistika va apparat logikasi
    if (fileType === "uploaded_file" || fileType === "copy_file") {
      try {
        const bugun = new Date();
        bugun.setHours(0, 0, 0, 0);

        let statistika = await Statistika.findOne({
          apparatId,
          sana: { $gte: bugun },
        });

        if (!statistika) {
          statistika = new Statistika({
            apparatId,
            sana: bugun,
            foydalanishSoni: 1,
            daromad: +amount,
            ishlatilganQogoz: 1,
          });
        } else {
          statistika.foydalanishSoni += 1;
          statistika.daromad += +amount;
          statistika.ishlatilganQogoz += 1;
        }

        await statistika.save();

        // Apparat qog'oz sonini kamaytirish
        const apparat = await VendingApparat.findOne({ apparatId });
        if (apparat && apparat.joriyQogozSoni > 0) {
          apparat.joriyQogozSoni -= 1;
          await apparat.save();

          if (apparat.joriyQogozSoni <= apparat.kamQogozChegarasi) {
            try {
              req.app.get("io").emit("qogozKam", {
                apparatId,
                joriyQogozSoni: apparat.joriyQogozSoni,
                xabar: `Diqqat! ${apparat.nomi} apparatida qog'oz kam qoldi: ${apparat.joriyQogozSoni} ta`,
              });
            } catch (socketError) {
              console.error("WebSocket qog'oz kam xabari xatoligi:", socketError);
            }
          }
        }
      } catch (statsError) {
        console.error("Statistika xatoligi:", statsError);
      }

      // File/Copy ni o'chirish
      try {
        if (fileType === "uploaded_file") {
          await File.findByIdAndDelete(serviceData._id);
        } else {
          await copyModel.findByIdAndDelete(serviceData._id);
        }
      } catch (deleteError) {
        console.error("File o'chirishda xatolik:", deleteError);
      }
    }

    // WebSocket eventi yuborish
    const websocketData = {
      fileId: merchant_trans_id,
      apparatId: apparatId || "unknown",
      amount: +amount,
      qogozSoni: 1,
      type: fileType,
      click_trans_id,
      code: serviceData.code || null,
    };

    try {
      req.app.get("io").emit("tolovMuvaffaqiyatli", websocketData);
    } catch (socketError) {
      console.error("WebSocket xatoligi:", socketError);
    }

    const merchant_confirm_id = new Date().getTime();

    return sendClickResponse(
      {
        click_trans_id,
        merchant_trans_id,
        merchant_confirm_id,
        error: ClickError.Success,
        error_note: "Success",
      },
      res
    );
  } catch (error) {
    console.error("Complete umumiy xatolik:", error);
    return sendClickResponse(
      { error: ClickError.TransactionCanceled, error_note: "Technical error" },
      res
    );
  }
});

// To'lov holatini tekshirish
router.post("/check-payment-status", async (req, res) => {
  try {
    const { order_id } = req.body;

    if (!order_id) {
      return res.status(400).json({
        status: "error",
        message: "order_id kiritilmagan",
      });
    }

    const payment = await paidModel.findOne({
      "serviceData._id": new mongoose.Types.ObjectId(order_id),
    });

    if (!payment) {
      return res.json({
        status: "error",
        message: "To'lov topilmadi",
        paid: false,
      });
    }

    res.status(200).json({
      status: "success",
      message: "To'landi",
      paid: true,
      data: {
        amount: payment.amount,
        date: payment.date,
        click_trans_id: payment.clickTransactionId,
      },
    });
  } catch (error) {
    console.error("Check payment status xatolik:", error);
    res.status(500).json({ status: "error", message: error.message });
  }
});

// File upload uchun to'lov havolasini olish (dinamik credentials)
router.post("/get-click-link", async (req, res) => {
  try {
    const { orderId, amount } = req.body;

    if (!orderId || !amount) {
      return res.status(400).json({
        status: "error",
        message: "orderId va amount kiritish majburiy",
      });
    }

    if (+amount < 100) {
      return res.status(400).json({
        status: "error",
        message: "Minimum to'lov summasi 100 so'm",
      });
    }

    const findFileWithPath = await File.findById(orderId);
    if (!findFileWithPath) {
      return res.status(404).json({ status: "error", message: "File topilmadi" });
    }

    // Dinamik credentials
    const creds = await getClickCredentials(findFileWithPath.apparatId);
    const serviceId = creds?.serviceId || FALLBACK_SERVICE_ID;
    const merchantId = creds?.merchantId || FALLBACK_MERCHANT_ID;

    const qrCode = `https://my.click.uz/services/pay?service_id=${serviceId}&merchant_id=${merchantId}&amount=${amount}&transaction_param=${findFileWithPath._id}`;

    return res.json({ status: "success", data: qrCode });
  } catch (error) {
    console.error("Get click link xatolik:", error);
    res.status(500).json({ status: "error", message: error.message });
  }
});

// Scan uchun to'lov havolasini olish
router.post("/get-scan-link", async (req, res) => {
  try {
    const { code, amount } = req.body;

    if (!code || !amount) {
      return res.status(400).json({
        status: "error",
        message: "code va amount kiritish majburiy",
      });
    }

    if (+amount < 100) {
      return res.status(400).json({
        status: "error",
        message: "Minimum to'lov summasi 100 so'm",
      });
    }

    const findFileWithPath = await scanFileModel.findOne({ code: code });
    if (!findFileWithPath) {
      return res.status(404).json({ status: "error", message: "Scan file topilmadi" });
    }

    // Dinamik credentials
    const creds = await getClickCredentials(findFileWithPath.apparatId);
    const serviceId = creds?.serviceId || FALLBACK_SERVICE_ID;
    const merchantId = creds?.merchantId || FALLBACK_MERCHANT_ID;

    const qrCode = `https://my.click.uz/services/pay?service_id=${serviceId}&merchant_id=${merchantId}&amount=${amount}&transaction_param=${findFileWithPath._id}`;

    return res.json({
      status: "success",
      data: {
        payment_url: qrCode,
        order_id: findFileWithPath._id,
        amount: +amount,
        code,
      },
    });
  } catch (error) {
    console.error("Get scan link xatolik:", error);
    res.status(500).json({ status: "error", message: error.message });
  }
});

// Copy uchun to'lov havolasini olish
router.post("/get-copy-link", async (req, res) => {
  try {
    const { code, amount } = req.body;

    if (!code || !amount) {
      return res.status(400).json({
        status: "error",
        message: "code va amount kiritish majburiy",
      });
    }

    if (+amount < 100) {
      return res.status(400).json({
        status: "error",
        message: "Minimum to'lov summasi 100 so'm",
      });
    }

    const findCopyWithCode = await copyModel.findOne({ code: code });
    if (!findCopyWithCode) {
      return res.status(404).json({ status: "error", message: "Copy topilmadi" });
    }

    const existingPayment = await paidModel.findOne({
      "serviceData._id": findCopyWithCode._id,
      status: "paid",
    });

    if (existingPayment) {
      return res.status(400).json({
        status: "error",
        message: "Bu copy uchun to'lov allaqachon amalga oshirilgan",
      });
    }

    // Dinamik credentials
    const creds = await getClickCredentials(findCopyWithCode.apparatId);
    const serviceId = creds?.serviceId || FALLBACK_SERVICE_ID;
    const merchantId = creds?.merchantId || FALLBACK_MERCHANT_ID;

    const qrCode = `https://my.click.uz/services/pay?service_id=${serviceId}&merchant_id=${merchantId}&amount=${amount}&transaction_param=${findCopyWithCode._id}`;

    return res.json({
      status: "success",
      data: {
        payment_url: qrCode,
        order_id: findCopyWithCode._id,
        amount: +amount,
        code,
        apparatId: findCopyWithCode.apparatId,
      },
    });
  } catch (error) {
    console.error("Get copy link xatolik:", error);
    res.status(500).json({ status: "error", message: error.message });
  }
});

// Test endpoint
router.get("/test", (req, res) => {
  res.json({
    status: "success",
    message: "Click router ishlayapti (dinamik credentials)",
    timestamp: new Date().toISOString(),
  });
});

export default router;
