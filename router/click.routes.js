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

    console.log(
      `✅ Prepare so'rov keldi: merchant_trans_id=${merchant_trans_id}, amount=${amount}`
    );

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
    console.log(merchant_trans_id);

    if (!isValid) {
      console.log("❌ Prepare: Invalid signature");
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

    console.log(
      `🔍 File tekshirish: uploadedFile=${!!uploadedFile}, scannedFile=${!!scannedFile}`
    );

    if (!uploadedFile && !scannedFile) {
      console.log("❌ Prepare: File topilmadi");
      return sendClickResponse(
        {
          error: ClickError.UserNotFound,
          error_note: "User not found",
        },
        res
      );
    }

    const time = new Date().getTime();
    console.log(`✅ Prepare muvaffaqiyatli: merchant_prepare_id=${time}`);

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
    console.error("❌ Prepare xatolik:", error);
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

    console.log(
      `✅ Complete so'rov keldi: merchant_trans_id=${merchant_trans_id}, amount=${amount}`
    );

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
      console.log("❌ Complete: Invalid signature");
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

    console.log(`🔍 Service data:`, {
      uploadedFile: !!uploadedFile,
      scannedFile: !!scannedFile,
      serviceDataId: serviceData?._id,
    });

    if (!serviceData) {
      console.log("❌ Complete: Service data topilmadi");
      return sendClickResponse(
        {
          error: ClickError.UserNotFound,
          error_note: "User not found",
        },
        res
      );
    }

    // Takroriy to'lovni tekshirish
    const existingPayment = await paidModel.findOne({ _id: merchant_trans_id });
    if (existingPayment) {
      console.log("❌ Complete: Allaqachon to'langan");
      return sendClickResponse(
        {
          error: ClickError.AlreadyPaid,
          error_note: "Already paid",
        },
        res
      );
    }

    // To'lovni bazaga qo'shish
    console.log("💾 To'lovni bazaga saqlash...");
    await paidModel.create({
      status: "paid",
      serviceData: serviceData,
      amount: +amount,
      date: new Date(),
    });

    // File larni o'chirish
    if (uploadedFile) {
      console.log(`🗑️ Uploaded file o'chirilmoqda: ${uploadedFile._id}`);
      await File.findByIdAndDelete(uploadedFile._id);
    } else if (scannedFile) {
      console.log(`🗑️ Scanned file o'chirilmoqda: ${scannedFile._id}`);
      await scanFileModel.findByIdAndDelete(scannedFile._id);
    }

    // ✅ ApparatId ni olish (har ikki holat uchun)
    let apparatId = null;

    if (uploadedFile) {
      apparatId = uploadedFile.apparatId;
      console.log(
        `📁 File upload uchun statistika va apparat logikasi: apparatId=${apparatId}`
      );

      // File upload uchun statistika va apparat logikasi
      const bugun = new Date();
      bugun.setHours(0, 0, 0, 0);

      try {
        // Statistikani qidirish yoki yaratish
        let statistika = await Statistika.findOne({
          apparatId,
          sana: {
            $gte: bugun,
          },
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

        // Apparatning qog'oz sonini kamaytirish
        const apparat = await VendingApparat.findOne({ apparatId });
        if (apparat) {
          console.log(
            `📄 Apparat qog'oz soni: ${apparat.joriyQogozSoni} -> ${
              apparat.joriyQogozSoni - 1
            }`
          );
          apparat.joriyQogozSoni -= 1;
          await apparat.save();

          // Qog'oz kam qolganda xabar berish
          if (apparat.joriyQogozSoni <= apparat.kamQogozChegarasi) {
            console.log("⚠️ Qog'oz kam qoldi, WebSocket xabar yuborilmoqda");
            req.app.get("io").emit("qogozKam", {
              apparatId,
              joriyQogozSoni: apparat.joriyQogozSoni,
              xabar: `Diqqat! ${apparat.nomi} apparatida qog'oz kam qoldi: ${apparat.joriyQogozSoni} ta`,
            });
          }
        } else {
          console.log("❌ Apparat topilmadi");
        }
      } catch (statsError) {
        console.error("❌ Statistika xatoligi:", statsError);
      }
    } else if (scannedFile) {
      // ✅ Scan file uchun apparatId olish
      apparatId = scannedFile.apparatId || "scan-device";
      console.log(`📄 Scan file uchun apparatId: ${apparatId}`);
    }

    // ✅ Umumiy WebSocket eventi (file va scan uchun)
    const websocketData = {
      fileId: merchant_trans_id,
      apparatId: apparatId || "unknown",
      amount: +amount,
      qogozSoni: 1,
      type: uploadedFile ? "file" : "scan",
    };

    console.log(`🔔 WebSocket eventi yuborilmoqda:`, websocketData);

    try {
      req.app.get("io").emit("tolovMuvaffaqiyatli", websocketData);
      console.log("✅ WebSocket eventi muvaffaqiyatli yuborildi");
    } catch (socketError) {
      console.error("❌ WebSocket xatoligi:", socketError);
    }

    const time = new Date().getTime();
    console.log(
      `✅ Complete muvaffaqiyatli tugallandi: merchant_confirm_id=${time}`
    );

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

// To'lov holatini tekshirish (file URL bo'yicha)
router.post("/check-payment-status", async (req, res) => {
  try {
    const { order_id } = req.body;
    console.log(`🔍 To'lov holati tekshirilmoqda: order_id=${order_id}`);

    const findFileWithPath = await paidModel.findOne({
      "serviceData._id": order_id,
    });

    if (!findFileWithPath) {
      console.log("❌ File bo'yicha to'lov topilmadi");
      return res.json({ status: "error", message: "bunday file topilmadi" });
    }

    console.log("✅ File to'lovi topildi");
    res.status(200).json({ status: "success", message: "Tolandi" });
  } catch (error) {
    console.error("❌ Check payment status xatolik:", error);
    res.status(500).json({ status: "error", message: error.message });
  }
});

// Scan uchun to'lov havolasini olish
router.post("/get-scan-link", async (req, res) => {
  try {
    const { code, amount } = req.body;
    console.log(`🔍 Scan link so'ralmoqda: code=${code}, amount=${amount}`);

    if (!code || !amount) {
      console.log("❌ Code yoki amount kiritilmagan");
      return res.json({
        status: "error",
        message: "iltimos malumotlarni toliq kiriting",
      });
    }

    const findFileWithPath = await scanFileModel.findOne({ code: code });
    if (!findFileWithPath) {
      console.log(`❌ Scan file topilmadi: code=${code}`);
      return res.json({ status: "error", message: "bunday file topilmadi" });
    }

    const qrCode = `https://my.click.uz/services/pay?service_id=71257&merchant_id=38721&amount=${amount}&transaction_param=${findFileWithPath._id}`;

    console.log(`✅ Scan QR kod yaratildi: fileId=${findFileWithPath._id}`);
    console.log(`🔗 QR URL: ${qrCode}`);

    return res.json({ status: "success", data: qrCode });
  } catch (error) {
    console.error("❌ Get scan link xatolik:", error);
    res.status(500).json({ status: "error", message: error.message });
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
      return res.json({
        status: "error",
        message: "iltimos malumotlarni toliq kiriting",
      });
    }

    const findFileWithPath = await File.findById(orderId);
    if (!findFileWithPath) {
      console.log(`❌ File topilmadi: orderId=${orderId}`);
      return res.json({ status: "error", message: "bunday file topilmadi" });
    }

    const qrCode = `https://my.click.uz/services/pay?service_id=71257&merchant_id=38721&amount=${amount}&transaction_param=${findFileWithPath._id}`;

    console.log(`✅ File QR kod yaratildi: fileId=${findFileWithPath._id}`);
    console.log(`🔗 QR URL: ${qrCode}`);

    return res.json({ status: "success", data: qrCode });
  } catch (error) {
    console.error("❌ Get click link xatolik:", error);
    res.status(500).json({ status: "error", message: error.message });
  }
});

export default router;
