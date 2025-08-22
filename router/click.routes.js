import express from "express";
import paidModel from "../model/paid.model.js";
import File from "../model/file.model.js";
import scanFileModel from "../model/scanFile.model.js";
import Statistika from "../model/statistika.model.js";
import VendingApparat from "../model/vendingApparat.model.js";
import md5 from "md5";
import { ClickError } from "../enum/transaction.enum.js";

const router = express.Router();

// Barcha so'rovlarni log qilish middleware
router.use((req, res, next) => {
  console.log("=".repeat(80));
  console.log(`📨 CLICK SO'ROV KELDI:`, {
    method: req.method,
    url: req.url,
    ip: req.ip || req.connection.remoteAddress,
    userAgent: req.get("User-Agent"),
    timestamp: new Date().toISOString(),
  });
  console.log("📋 Headers:", JSON.stringify(req.headers, null, 2));
  console.log("📝 Body:", JSON.stringify(req.body, null, 2));
  console.log("=".repeat(80));
  next();
});

// Environment variables tekshirish
const CLICK_SECRET_KEY = process.env.CLICK_SECRET_KEY || "cCmLS75coPW7E";
const SERVICE_ID = process.env.CLICK_SERVICE_ID || "71257";
const MERCHANT_ID = process.env.CLICK_MERCHANT_ID || "38721";

if (!CLICK_SECRET_KEY) {
  console.error(
    "❌ XATOLIK: CLICK_SECRET_KEY environment variable sozlanmagan!"
  );
  process.exit(1);
}

console.log("🔧 Click sozlamalari:", {
  SERVICE_ID,
  MERCHANT_ID,
  SECRET_KEY_LENGTH: CLICK_SECRET_KEY.length,
});

// Signature tekshirish funksiyasi - Click dokumentatsiyasiga mos
const clickCheckToken = (data, signString) => {
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

    // Click dokumentatsiyasiga mos signature yaratish
    let signature;
    if (action === "0" || action === 0) {
      // PREPARE
      signature = `${click_trans_id}${service_id}${CLICK_SECRET_KEY}${merchant_trans_id}${amount}${action}${sign_time}`;
    } else {
      // COMPLETE
      signature = `${click_trans_id}${service_id}${CLICK_SECRET_KEY}${merchant_trans_id}${prepareId}${amount}${action}${sign_time}`;
    }

    const signatureHash = md5(signature);

    console.log("🔐 Signature tekshirish:", {
      click_trans_id,
      service_id,
      merchant_trans_id,
      prepareId,
      amount,
      action,
      sign_time,
      signature_string: signature,
      calculated_hash: signatureHash,
      received_hash: signString,
      is_valid: signatureHash === signString,
    });

    return signatureHash === signString;
  } catch (error) {
    console.error("❌ Signature tekshirishda xatolik:", error);
    return false;
  }
};

// MUHIM: JSON FORMATDA JAVOB YUBORISH
const sendClickResponse = (result, res) => {
  console.log("📤 Click javob yuborilmoqda (JSON):", result);

  // CLICK SUPPORT KO'RSATMASI BO'YICHA JSON FORMATDA JAVOB
  res.status(200).json(result);
};

// PREPARE ENDPOINT
router.post("/prepare", async (req, res) => {
  console.log("🚀 PREPARE ENDPOINT ISHGA TUSHDI");

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

    console.log("📊 Prepare parametrlari:", {
      click_trans_id,
      service_id,
      merchant_trans_id,
      amount,
      action,
      sign_time,
      sign_string,
    });

    // Majburiy parametrlarni tekshirish
    if (
      !click_trans_id ||
      !service_id ||
      !merchant_trans_id ||
      !amount ||
      action === undefined ||
      !sign_time ||
      !sign_string
    ) {
      console.log("❌ Ba'zi parametrlar yo'q");
      return sendClickResponse(
        {
          error: ClickError.BadRequest,
          error_note: "Missing required parameters",
        },
        res
      );
    }

    // Service ID tekshirish
    if (service_id !== SERVICE_ID) {
      console.log(
        `❌ Noto'g'ri service_id: ${service_id}, kutilgan: ${SERVICE_ID}`
      );
      return sendClickResponse(
        {
          error: ClickError.BadRequest,
          error_note: "Invalid service_id",
        },
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

    const isValid = clickCheckToken(signatureData, sign_string);

    if (!isValid) {
      console.log("❌ Prepare: Invalid signature");
      return sendClickResponse(
        {
          error: ClickError.SignFailed,
          error_note: "Invalid signature",
        },
        res
      );
    }

    // File yoki scan file mavjudligini tekshirish
    let serviceData = null;
    let fileType = null;

    // Birinchi uploaded file dan qidirish
    const uploadedFile = await File.findById(merchant_trans_id);
    if (uploadedFile) {
      serviceData = uploadedFile;
      fileType = "uploaded_file";
    } else {
      // Agar uploaded file topilmasa, scan file dan qidirish
      const scannedFile = await scanFileModel.findById(merchant_trans_id);
      if (scannedFile) {
        serviceData = scannedFile;
        fileType = "scanned_file";
      }
    }

    console.log("🔍 File tekshirish natijasi:", {
      merchant_trans_id,
      serviceData: !!serviceData,
      fileType,
      serviceDataId: serviceData?._id,
    });

    if (!serviceData) {
      console.log("❌ Prepare: File topilmadi");
      return sendClickResponse(
        {
          error: ClickError.UserNotFound,
          error_note: "Order not found",
        },
        res
      );
    }

    // Allaqachon to'langanligini tekshirish
    const existingPayment = await paidModel.findOne({
      "serviceData._id": merchant_trans_id,
      status: "paid",
    });

    if (existingPayment) {
      console.log("❌ Prepare: Allaqachon to'langan");
      return sendClickResponse(
        {
          error: ClickError.AlreadyPaid,
          error_note: "Already paid",
        },
        res
      );
    }

    // Muvaffaqiyatli prepare
    const merchant_prepare_id = new Date().getTime();

    console.log("✅ Prepare muvaffaqiyatli:", {
      click_trans_id,
      merchant_trans_id,
      merchant_prepare_id,
      amount,
      fileType,
    });

    // CLICK SUPPORT KO'RSATMASI BO'YICHA JAVOB
    return sendClickResponse(
      {
        click_trans_id: click_trans_id,
        merchant_trans_id: merchant_trans_id,
        merchant_prepare_id: merchant_prepare_id,
        error: ClickError.Success,
        error_note: "Success",
      },
      res
    );
  } catch (error) {
    console.error("❌ Prepare umumiy xatolik:", error);
    return sendClickResponse(
      {
        error: ClickError.TransactionCanceled,
        error_note: "Technical error",
      },
      res
    );
  }
});

// COMPLETE ENDPOINT
router.post("/complete", async (req, res) => {
  console.log("🏁 COMPLETE ENDPOINT ISHGA TUSHDI");

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

    console.log("📊 Complete parametrlari:", {
      click_trans_id,
      service_id,
      merchant_trans_id,
      merchant_prepare_id,
      amount,
      action,
      sign_time,
      click_error,
    });

    // Click tomonidan xatolik bo'lsa
    if (click_error && click_error !== "0" && click_error !== 0) {
      console.log(`❌ Click tomonidan xatolik: ${click_error}`);
      return sendClickResponse(
        {
          error: ClickError.TransactionCanceled,
          error_note: "Transaction failed by Click",
        },
        res
      );
    }

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

    const isValid = clickCheckToken(signatureData, sign_string);

    if (!isValid) {
      console.log("❌ Complete: Invalid signature");
      return sendClickResponse(
        {
          error: ClickError.SignFailed,
          error_note: "Invalid signature",
        },
        res
      );
    }

    // File mavjudligini tekshirish
    let serviceData = null;
    let fileType = null;

    const uploadedFile = await File.findById(merchant_trans_id);
    if (uploadedFile) {
      serviceData = uploadedFile;
      fileType = "uploaded_file";
    } else {
      const scannedFile = await scanFileModel.findById(merchant_trans_id);
      if (scannedFile) {
        serviceData = scannedFile;
        fileType = "scanned_file";
      }
    }

    if (!serviceData) {
      console.log("❌ Complete: Service data topilmadi");
      return sendClickResponse(
        {
          error: ClickError.UserNotFound,
          error_note: "Order not found",
        },
        res
      );
    }

    // Takroriy to'lovni tekshirish
    const existingPayment = await paidModel.findOne({
      "serviceData._id": merchant_trans_id,
      status: "paid",
    });

    if (existingPayment) {
      console.log("❌ Complete: Allaqachon to'langan");
      return sendClickResponse(
        {
          click_trans_id: click_trans_id,
          merchant_trans_id: merchant_trans_id,
          merchant_confirm_id: merchant_prepare_id,
          error: ClickError.AlreadyPaid,
          error_note: "Already paid",
        },
        res
      );
    }

    // To'lovni saqlash
    console.log("💾 To'lovni bazaga saqlash...");
    const payment = await paidModel.create({
      status: "paid",
      serviceData: serviceData,
      amount: +amount,
      date: new Date(),
      clickTransactionId: click_trans_id,
      paymentMethod: "click",
    });

    console.log("✅ To'lov saqlandi:", payment._id);

    // Statistika va apparat logikasi
    let apparatId = null;

    if (fileType === "uploaded_file") {
      apparatId = serviceData.apparatId;
      console.log(`📁 File upload uchun logika: apparatId=${apparatId}`);

      try {
        // Statistika yangilash
        const bugun = new Date();
        bugun.setHours(0, 0, 0, 0);

        let statistika = await Statistika.findOne({
          apparatId,
          sana: { $gte: bugun },
        });

        if (!statistika) {
          console.log("📊 Yangi statistika yaratilmoqda");
          statistika = new Statistika({
            apparatId,
            sana: bugun,
            foydalanishSoni: 1,
            daromad: +amount,
            ishlatilganQogoz: 1,
          });
        } else {
          console.log("📊 Mavjud statistika yangilanmoqda");
          statistika.foydalanishSoni += 1;
          statistika.daromad += +amount;
          statistika.ishlatilganQogoz += 1;
        }

        await statistika.save();
        console.log("✅ Statistika saqlandi");

        // Apparat qog'oz sonini kamaytirish
        const apparat = await VendingApparat.findOne({ apparatId });
        if (apparat && apparat.joriyQogozSoni > 0) {
          console.log(
            `📄 Qog'oz soni: ${apparat.joriyQogozSoni} -> ${
              apparat.joriyQogozSoni - 1
            }`
          );
          apparat.joriyQogozSoni -= 1;
          await apparat.save();

          // Qog'oz kam qolganda ogohlantirish
          if (apparat.joriyQogozSoni <= apparat.kamQogozChegarasi) {
            console.log("⚠️ Qog'oz kam qoldi, WebSocket xabar yuborilmoqda");
            try {
              req.app.get("io").emit("qogozKam", {
                apparatId,
                joriyQogozSoni: apparat.joriyQogozSoni,
                xabar: `Diqqat! ${apparat.nomi} apparatida qog'oz kam qoldi: ${apparat.joriyQogozSoni} ta`,
              });
            } catch (socketError) {
              console.error(
                "❌ WebSocket qog'oz kam xabari xatoligi:",
                socketError
              );
            }
          }
        }
      } catch (statsError) {
        console.error("❌ Statistika xatoligi:", statsError);
      }

      // File ni o'chirish
      try {
        await File.findByIdAndDelete(serviceData._id);
        console.log(`🗑️ Uploaded file o'chirildi: ${serviceData._id}`);
      } catch (deleteError) {
        console.error("❌ File o'chirishda xatolik:", deleteError);
      }
    } else if (fileType === "scanned_file") {
      apparatId = serviceData.apparatId || "scan-device";
      console.log(`📄 Scan file uchun apparatId: ${apparatId}`);

      // Scan file ni o'chirish
      try {
        await scanFileModel.findByIdAndDelete(serviceData._id);
        console.log(`🗑️ Scanned file o'chirildi: ${serviceData._id}`);
      } catch (deleteError) {
        console.error("❌ Scan file o'chirishda xatolik:", deleteError);
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
    };

    console.log("🔔 WebSocket eventi yuborilmoqda:", websocketData);

    try {
      req.app.get("io").emit("tolovMuvaffaqiyatli", websocketData);
      console.log("✅ WebSocket eventi yuborildi");
    } catch (socketError) {
      console.error("❌ WebSocket xatoligi:", socketError);
    }

    // Muvaffaqiyatli javob
    const merchant_confirm_id = new Date().getTime();

    console.log("✅ Complete muvaffaqiyatli tugallandi");

    // CLICK SUPPORT KO'RSATMASI BO'YICHA JAVOB
    return sendClickResponse(
      {
        click_trans_id: click_trans_id,
        merchant_trans_id: merchant_trans_id,
        merchant_confirm_id: merchant_confirm_id,
        error: ClickError.Success,
        error_note: "Success",
      },
      res
    );
  } catch (error) {
    console.error("❌ Complete umumiy xatolik:", error);
    return sendClickResponse(
      {
        error: ClickError.TransactionCanceled,
        error_note: "Technical error",
      },
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
      "serviceData._id": order_id,
    });

    if (!payment) {
      return res.json({
        status: "error",
        message: "To'lov topilmadi",
        paid: false,
      });
    }

    console.log("✅ To'lov topildi:", {
      paymentId: payment._id,
      amount: payment.amount,
      date: payment.date,
      status: payment.status,
    });

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
    console.error("❌ Check payment status xatolik:", error);
    res.status(500).json({
      status: "error",
      message: error.message,
    });
  }
});

// File upload uchun to'lov havolasini olish
router.post("/get-click-link", async (req, res) => {
  try {
    const { orderId, amount } = req.body;
    console.log(
      `🔍 File link so'ralmoqda: orderId=${orderId}, amount=${amount}`
    );

    if (!orderId || !amount) {
      console.log("❌ OrderId yoki amount kiritilmagan");
      return res.status(400).json({
        status: "error",
        message: "orderId va amount kiritish majburiy",
      });
    }

    // Amount ni tekshirish (minimum 100 so'm)
    if (+amount < 100) {
      return res.status(400).json({
        status: "error",
        message: "Minimum to'lov summasi 100 so'm",
      });
    }

    const findFileWithPath = await File.findById(orderId);
    if (!findFileWithPath) {
      console.log(`❌ File topilmadi: orderId=${orderId}`);
      return res.status(404).json({
        status: "error",
        message: "File topilmadi",
      });
    }

    // TO'G'RI Click URL format
    const qrCode = `https://my.click.uz/services/pay?service_id=${SERVICE_ID}&merchant_id=${MERCHANT_ID}&amount=${amount}&transaction_param=${findFileWithPath._id}`;

    console.log(`✅ File QR kod yaratildi:`, {
      fileId: findFileWithPath._id,
      amount,
      service_id: SERVICE_ID,
      merchant_id: MERCHANT_ID,
    });

    return res.json({
      status: "success",
      data: qrCode,
    });
  } catch (error) {
    console.error("❌ Get click link xatolik:", error);
    res.status(500).json({
      status: "error",
      message: error.message,
    });
  }
});

// Scan uchun to'lov havolasini olish
router.post("/get-scan-link", async (req, res) => {
  try {
    const { code, amount } = req.body;
    console.log(`🔍 Scan link so'ralmoqda: code=${code}, amount=${amount}`);

    if (!code || !amount) {
      console.log("❌ Code yoki amount kiritilmagan");
      return res.status(400).json({
        status: "error",
        message: "code va amount kiritish majburiy",
      });
    }

    // Amount ni tekshirish
    if (+amount < 100) {
      return res.status(400).json({
        status: "error",
        message: "Minimum to'lov summasi 100 so'm",
      });
    }

    const findFileWithPath = await scanFileModel.findOne({ code: code });
    if (!findFileWithPath) {
      console.log(`❌ Scan file topilmadi: code=${code}`);
      return res.status(404).json({
        status: "error",
        message: "Scan file topilmadi",
      });
    }

    // TO'G'RI Click URL format
    const qrCode = `https://my.click.uz/services/pay?service_id=${SERVICE_ID}&merchant_id=${MERCHANT_ID}&amount=${amount}&transaction_param=${findFileWithPath._id}`;

    console.log(`✅ Scan QR kod yaratildi:`, {
      fileId: findFileWithPath._id,
      code,
      amount,
      service_id: SERVICE_ID,
      merchant_id: MERCHANT_ID,
    });

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
    console.error("❌ Get scan link xatolik:", error);
    res.status(500).json({
      status: "error",
      message: error.message,
    });
  }
});

// Test endpoint
router.get("/test", (req, res) => {
  console.log("🧪 Test endpoint ishga tushdi");
  res.json({
    status: "success",
    message: "Click router ishlayapti",
    timestamp: new Date().toISOString(),
    config: {
      SERVICE_ID,
      MERCHANT_ID,
      SECRET_KEY_SET: !!CLICK_SECRET_KEY,
    },
  });
});

export default router;
