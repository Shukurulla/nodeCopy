import express from "express";
import paidModel from "../model/paid.model.js";
import File from "../model/file.model.js";
import scanFileModel from "../model/scanFile.model.js";
import Statistika from "../model/statistika.model.js";
import VendingApparat from "../model/vendingApparat.model.js";
import crypto from "crypto";
import { TransactionState } from "../enum/transaction.enum.js";

const router = express.Router();

// Payme xatoliklari
const PaymeError = {
  Success: 0,
  InvalidAmount: -31001,
  InvalidAccount: -31050,
  CouldNotPerform: -31008,
  TransactionNotFound: -31003,
  InvalidAuthorization: -32504,
  AccessDenied: -32001,
  TransactionNotAllowed: -31008,
  TransactionAlreadyExists: -31060,
  TransactionCancelled: -31007,
  TransactionNotPermitted: -31051,
};

// Payme metodlari
const PaymeMethod = {
  CheckPerformTransaction: "CheckPerformTransaction",
  CreateTransaction: "CreateTransaction",
  PerformTransaction: "PerformTransaction",
  CheckTransaction: "CheckTransaction",
  CancelTransaction: "CancelTransaction",
  GetStatement: "GetStatement",
};

// Authorization tekshirish - Payme formatiga muvofiq
const checkPaymeAuth = (req) => {
  const auth = req.headers.authorization;
  if (!auth || !auth.startsWith("Basic ")) {
    return false;
  }
  
  const encoded = auth.split(" ")[1];
  const decoded = Buffer.from(encoded, "base64").toString();
  const [login, password] = decoded.split(":");
  
  // Payme har doim "Paycom" login va secret key parolni kutadi
  return login === "Paycom" && password === process.env.PAYME_SECRET_KEY;
};

// Javob yuborish
const sendPaymeResponse = (res, result, error = null) => {
  const response = {
    jsonrpc: "2.0",
    id: res.locals.requestId || null,
  };

  if (error) {
    response.error = error;
  } else {
    response.result = result;
  }

  res.json(response);
};

// QR kod va to'lov linkini olish - BU ENDPOINT AUTHORIZATION TALAB QILMAYDI
router.post("/get-payme-link", async (req, res) => {
  console.log("=== GET PAYME LINK ENDPOINT ===");
  console.log("Headers:", JSON.stringify(req.headers, null, 2));
  console.log("Body:", JSON.stringify(req.body, null, 2));
  
  try {
    const { orderId, amount } = req.body;

    if (!orderId || !amount) {
      return res.json({
        status: "error",
        message: "Iltimos, orderId va amount ni kiriting",
      });
    }

    // Faylni tekshirish
    const uploadedFile = await File.findById(orderId);
    const scannedFile = await scanFileModel.findById(orderId);

    if (!uploadedFile && !scannedFile) {
      return res.json({
        status: "error",
        message: "Bunday fayl topilmadi",
      });
    }

    // Payme linki yaratish
    const paymeLink = `https://checkout.paycom.uz/${process.env.PAYME_MERCHANT_ID}?amount=${amount}&account[order_id]=${orderId}`;
    
    // QR kod yaratish
    const qrCode = `https://api.qrserver.com/v1/create-qr-code/?data=${encodeURIComponent(paymeLink)}&size=300x300`;

    console.log("Generated Payme link:", paymeLink);
    console.log("Generated QR code:", qrCode);

    res.json({
      status: "success",
      data: {
        link: paymeLink,
        qr: qrCode,
        amount: amount,
        orderId: orderId,
      },
    });
  } catch (error) {
    console.error("Payme link yaratishda xatolik:", error);
    res.status(500).json({
      status: "error",
      message: error.message,
    });
  }
});

// Scan file uchun Payme link - BU HAM AUTHORIZATION TALAB QILMAYDI
router.post("/get-scan-payme-link", async (req, res) => {
  console.log("=== GET SCAN PAYME LINK ENDPOINT ===");
  console.log("Headers:", JSON.stringify(req.headers, null, 2));
  console.log("Body:", JSON.stringify(req.body, null, 2));
  
  try {
    const { code, amount } = req.body;

    if (!code || !amount) {
      return res.json({
        status: "error",
        message: "Iltimos, code va amount ni kiriting",
      });
    }

    const scanFile = await scanFileModel.findOne({ code });
    if (!scanFile) {
      return res.json({
        status: "error",
        message: "Bunday kod topilmadi",
      });
    }

    const paymeLink = `https://checkout.paycom.uz/${process.env.PAYME_MERCHANT_ID}?amount=${amount}&account[order_id]=${scanFile._id}`;
    const qrCode = `https://api.qrserver.com/v1/create-qr-code/?data=${encodeURIComponent(paymeLink)}&size=300x300`;

    res.json({
      status: "success",
      data: {
        link: paymeLink,
        qr: qrCode,
        amount: amount,
        orderId: scanFile._id,
      },
    });
  } catch (error) {
    console.error("Scan file uchun Payme link yaratishda xatolik:", error);
    res.status(500).json({
      status: "error",
      message: error.message,
    });
  }
});

// To'lov holatini tekshirish - BU HAM AUTHORIZATION TALAB QILMAYDI
router.post("/check-payment-status", async (req, res) => {
  console.log("=== CHECK PAYMENT STATUS ENDPOINT ===");
  console.log("Headers:", JSON.stringify(req.headers, null, 2));
  console.log("Body:", JSON.stringify(req.body, null, 2));
  
  try {
    const { order_id } = req.body;

    const payment = await paidModel.findOne({
      $or: [
        { "serviceData._id": order_id },
        { "serviceData.fileUrl": order_id },
      ],
      status: "paid",
    });

    if (!payment) {
      return res.json({
        status: "error",
        message: "To'lov topilmadi yoki hali to'lanmagan",
      });
    }

    res.json({
      status: "success",
      message: "To'lov muvaffaqiyatli amalga oshirilgan",
      data: {
        amount: payment.amount,
        date: payment.date,
        paymentMethod: payment.paymeTransactionId ? "payme" : "click",
      },
    });
  } catch (error) {
    console.error("To'lov holatini tekshirishda xatolik:", error);
    res.status(500).json({
      status: "error",
      message: error.message,
    });
  }
});

// Debug endpoint'lar
router.get("/debug", (req, res) => {
  console.log("=== PAYME DEBUG ENDPOINT ===");
  console.log("Headers:", JSON.stringify(req.headers, null, 2));
  
  res.json({
    message: "Payme endpoint ishlayapti",
    env_check: {
      PAYME_SECRET_KEY: process.env.PAYME_SECRET_KEY ? "Mavjud" : "Mavjud emas",
      PAYME_MERCHANT_ID: process.env.PAYME_MERCHANT_ID ? "Mavjud" : "Mavjud emas",
      PAYME_SECRET_KEY_LENGTH: process.env.PAYME_SECRET_KEY ? process.env.PAYME_SECRET_KEY.length : 0,
    },
    timestamp: new Date().toISOString(),
  });
});

router.post("/test", (req, res) => {
  console.log("=== PAYME TEST ENDPOINT ===");
  console.log("Headers:", JSON.stringify(req.headers, null, 2));
  console.log("Body:", JSON.stringify(req.body, null, 2));
  
  res.json({
    message: "Test tugallandi",
    receivedHeaders: req.headers,
    receivedBody: req.body,
  });
});

// ASOSIY PAYME WEBHOOK ENDPOINT - BU AUTHORIZATION TALAB QILADI
router.post("/", async (req, res) => {
  console.log("=== PAYME MAIN WEBHOOK ENDPOINT ===");
  console.log("Headers:", JSON.stringify(req.headers, null, 2));
  console.log("Body:", JSON.stringify(req.body, null, 2));
  console.log("IP Address:", req.ip || req.connection.remoteAddress);
  
  try {
    const { method, params } = req.body;
    
    // Request ID ni olish
    res.locals.requestId = req.body.id || null;
    
    // Authorization tekshirish
    const auth = req.headers.authorization;
    console.log("Authorization header:", auth);
    
    if (!auth || !auth.startsWith("Basic ")) {
      console.log("XATO: Authorization header yo'q yoki noto'g'ri format");
      console.log("Expected: Basic auth");
      console.log("Received:", auth ? auth.substring(0, 20) + "..." : "null");
      
      return sendPaymeResponse(res, null, {
        code: PaymeError.InvalidAuthorization,
        message: "Unauthorized - No Basic Auth",
      });
    }
    
    try {
      const encoded = auth.split(" ")[1];
      const decoded = Buffer.from(encoded, "base64").toString();
      const [login, password] = decoded.split(":");
      
      console.log("Decoded login:", login);
      console.log("Decoded password:", password);
      console.log("Expected login: Paycom");
      console.log("Expected password:", process.env.PAYME_SECRET_KEY);
      console.log("Login match:", login === "Paycom");
      console.log("Password match:", password === process.env.PAYME_SECRET_KEY);
      
      if (login !== "Paycom" || password !== process.env.PAYME_SECRET_KEY) {
        console.log("XATO: Authorization failed - credentials mismatch");
        return sendPaymeResponse(res, null, {
          code: PaymeError.InvalidAuthorization,
          message: "Unauthorized - Invalid credentials",
        });
      }
    } catch (decodeError) {
      console.log("XATO: Base64 decode error:", decodeError.message);
      return sendPaymeResponse(res, null, {
        code: PaymeError.InvalidAuthorization,
        message: "Unauthorized - Decode error",
      });
    }
    
    console.log("✅ Authorization successful!");
    console.log("Method:", method);
    
    // Metodga qarab yo'naltirish
    switch (method) {
      case PaymeMethod.CheckPerformTransaction:
        console.log("Calling CheckPerformTransaction");
        await checkPerformTransaction(req, res, params);
        break;
      case PaymeMethod.CreateTransaction:
        console.log("Calling CreateTransaction");
        await createTransaction(req, res, params);
        break;
      case PaymeMethod.PerformTransaction:
        console.log("Calling PerformTransaction");
        await performTransaction(req, res, params);
        break;
      case PaymeMethod.CheckTransaction:
        console.log("Calling CheckTransaction");
        await checkTransaction(req, res, params);
        break;
      case PaymeMethod.CancelTransaction:
        console.log("Calling CancelTransaction");
        await cancelTransaction(req, res, params);
        break;
      case PaymeMethod.GetStatement:
        console.log("Calling GetStatement");
        await getStatement(req, res, params);
        break;
      default:
        console.log("XATO: Unknown method:", method);
        sendPaymeResponse(res, null, {
          code: PaymeError.CouldNotPerform,
          message: "Method not found",
        });
    }
  } catch (error) {
    console.error("XATO: Payme endpoint error:", error);
    sendPaymeResponse(res, null, {
      code: PaymeError.CouldNotPerform,
      message: "Internal server error",
    });
  }
});

// 1. CheckPerformTransaction - To'lovni bajarish mumkinligini tekshirish
async function checkPerformTransaction(req, res, params) {
  const { account, amount } = params;
  
  if (!account || !account.order_id) {
    return sendPaymeResponse(res, null, {
      code: PaymeError.InvalidAccount,
      message: "Invalid account",
    });
  }

  if (!amount || amount <= 0) {
    return sendPaymeResponse(res, null, {
      code: PaymeError.InvalidAmount,
      message: "Invalid amount",
    });
  }

  // Faylni tekshirish
  const uploadedFile = await File.findById(account.order_id);
  const scannedFile = await scanFileModel.findById(account.order_id);

  if (!uploadedFile && !scannedFile) {
    return sendPaymeResponse(res, null, {
      code: PaymeError.InvalidAccount,
      message: "Order not found",
    });
  }

  // Allaqachon to'langanligini tekshirish
  const existingPayment = await paidModel.findOne({
    "serviceData._id": account.order_id,
    status: "paid",
  });

  if (existingPayment) {
    return sendPaymeResponse(res, null, {
      code: PaymeError.TransactionNotAllowed,
      message: "Order already paid",
    });
  }

  sendPaymeResponse(res, { allow: true });
}

// 2. CreateTransaction - Tranzaksiya yaratish
async function createTransaction(req, res, params) {
  const { id, time, amount, account } = params;

  // Tranzaksiya mavjudligini tekshirish
  let transaction = await paidModel.findOne({ 
    paymeTransactionId: id 
  });

  if (transaction) {
    if (transaction.status === "pending") {
      return sendPaymeResponse(res, {
        transaction: transaction._id.toString(),
        state: TransactionState.Pending,
        create_time: transaction.createdAt.getTime(),
      });
    } else {
      return sendPaymeResponse(res, null, {
        code: PaymeError.TransactionAlreadyExists,
        message: "Transaction already exists",
      });
    }
  }

  // Faylni tekshirish
  const uploadedFile = await File.findById(account.order_id);
  const scannedFile = await scanFileModel.findById(account.order_id);
  const serviceData = uploadedFile || scannedFile;

  if (!serviceData) {
    return sendPaymeResponse(res, null, {
      code: PaymeError.InvalidAccount,
      message: "Order not found",
    });
  }

  // Yangi tranzaksiya yaratish
  transaction = await paidModel.create({
    paymeTransactionId: id,
    serviceData: serviceData,
    amount: amount,
    status: "pending",
    paymeCreateTime: time,
    createdAt: new Date(),
  });

  sendPaymeResponse(res, {
    transaction: transaction._id.toString(),
    state: TransactionState.Pending,
    create_time: time,
  });
}

// 3. PerformTransaction - To'lovni amalga oshirish
async function performTransaction(req, res, params) {
  const { id } = params;

  const transaction = await paidModel.findOne({ 
    paymeTransactionId: id 
  });

  if (!transaction) {
    return sendPaymeResponse(res, null, {
      code: PaymeError.TransactionNotFound,
      message: "Transaction not found",
    });
  }

  if (transaction.status === "paid") {
    return sendPaymeResponse(res, {
      transaction: transaction._id.toString(),
      state: TransactionState.Paid,
      perform_time: transaction.paymePerformTime || transaction.updatedAt.getTime(),
    });
  }

  if (transaction.status === "cancelled") {
    return sendPaymeResponse(res, null, {
      code: PaymeError.TransactionCancelled,
      message: "Transaction cancelled",
    });
  }

  // To'lovni amalga oshirish
  transaction.status = "paid";
  transaction.paymePerformTime = Date.now();
  transaction.updatedAt = new Date();
  await transaction.save();

  // Statistikani yangilash (faqat uploaded file uchun)
  if (transaction.serviceData.apparatId) {
    await updateStatistics(transaction.serviceData.apparatId, transaction.amount);
  }

  // Socket.io orqali real-time xabar
  req.app.get("io").emit("tolovMuvaffaqiyatli", {
    fileId: transaction.serviceData._id,
    apparatId: transaction.serviceData.apparatId,
    amount: transaction.amount,
    qogozSoni: 1,
    paymentMethod: "payme",
  });

  sendPaymeResponse(res, {
    transaction: transaction._id.toString(),
    state: TransactionState.Paid,
    perform_time: transaction.paymePerformTime,
  });
}

// 4. CheckTransaction - Tranzaksiya holatini tekshirish
async function checkTransaction(req, res, params) {
  const { id } = params;

  const transaction = await paidModel.findOne({ 
    paymeTransactionId: id 
  });

  if (!transaction) {
    return sendPaymeResponse(res, null, {
      code: PaymeError.TransactionNotFound,
      message: "Transaction not found",
    });
  }

  const result = {
    transaction: transaction._id.toString(),
    create_time: transaction.paymeCreateTime,
    state: transaction.status === "paid" ? TransactionState.Paid : 
           transaction.status === "cancelled" ? TransactionState.PaidCanceled : 
           TransactionState.Pending,
  };

  if (transaction.paymePerformTime) {
    result.perform_time = transaction.paymePerformTime;
  }

  if (transaction.status === "cancelled" && transaction.paymeReason) {
    result.reason = transaction.paymeReason;
  }

  sendPaymeResponse(res, result);
}

// 5. CancelTransaction - Tranzaksiyani bekor qilish
async function cancelTransaction(req, res, params) {
  const { id, reason } = params;

  const transaction = await paidModel.findOne({ 
    paymeTransactionId: id 
  });

  if (!transaction) {
    return sendPaymeResponse(res, null, {
      code: PaymeError.TransactionNotFound,
      message: "Transaction not found",
    });
  }

  if (transaction.status === "paid") {
    // To'langan tranzaksiyani bekor qilish
    transaction.status = "cancelled";
    transaction.paymeReason = reason;
    transaction.paymeCancelTime = Date.now();
    await transaction.save();

    // Statistikani qaytarish (agar kerak bo'lsa)
    if (transaction.serviceData.apparatId) {
      await reverseStatistics(transaction.serviceData.apparatId, transaction.amount);
    }

    return sendPaymeResponse(res, {
      transaction: transaction._id.toString(),
      cancel_time: transaction.paymeCancelTime,
      state: TransactionState.PaidCanceled,
    });
  } else {
    // Pending tranzaksiyani bekor qilish
    transaction.status = "cancelled";
    transaction.paymeReason = reason;
    transaction.paymeCancelTime = Date.now();
    await transaction.save();

    return sendPaymeResponse(res, {
      transaction: transaction._id.toString(),
      cancel_time: transaction.paymeCancelTime,
      state: TransactionState.PendingCanceled,
    });
  }
}

// 6. GetStatement - Hisobot olish
async function getStatement(req, res, params) {
  const { from, to } = params;

  const transactions = await paidModel.find({
    paymeTransactionId: { $exists: true },
    createdAt: {
      $gte: new Date(from),
      $lte: new Date(to),
    },
  }).sort({ createdAt: 1 });

  const result = {
    transactions: transactions.map(t => ({
      id: t.paymeTransactionId,
      time: t.paymeCreateTime,
      amount: t.amount,
      account: {
        order_id: t.serviceData._id,
      },
      create_time: t.paymeCreateTime,
      perform_time: t.paymePerformTime || 0,
      cancel_time: t.paymeCancelTime || 0,
      transaction: t._id.toString(),
      state: t.status === "paid" ? TransactionState.Paid : 
             t.status === "cancelled" ? TransactionState.PaidCanceled : 
             TransactionState.Pending,
      reason: t.paymeReason || null,
    })),
  };

  sendPaymeResponse(res, result);
}

// Statistikani yangilash
async function updateStatistics(apparatId, amount) {
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
        daromad: amount,
        ishlatilganQogoz: 1,
      });
    } else {
      statistika.foydalanishSoni += 1;
      statistika.daromad += amount;
      statistika.ishlatilganQogoz += 1;
    }

    await statistika.save();

    // Apparatning qog'oz sonini kamaytirish
    const apparat = await VendingApparat.findOne({ apparatId });
    if (apparat) {
      apparat.joriyQogozSoni -= 1;
      await apparat.save();
    }
  } catch (error) {
    console.error("Statistikani yangilashda xatolik:", error);
  }
}

// Statistikani qaytarish (bekor qilish holatida)
async function reverseStatistics(apparatId, amount) {
  try {
    const bugun = new Date();
    bugun.setHours(0, 0, 0, 0);

    const statistika = await Statistika.findOne({
      apparatId,
      sana: { $gte: bugun },
    });

    if (statistika) {
      statistika.foydalanishSoni = Math.max(0, statistika.foydalanishSoni - 1);
      statistika.daromad = Math.max(0, statistika.daromad - amount);
      statistika.ishlatilganQogoz = Math.max(0, statistika.ishlatilganQogoz - 1);
      await statistika.save();
    }

    // Apparatning qog'oz sonini qaytarish
    const apparat = await VendingApparat.findOne({ apparatId });
    if (apparat) {
      apparat.joriyQogozSoni += 1;
      await apparat.save();
    }
  } catch (error) {
    console.error("Statistikani qaytarishda xatolik:", error);
  }
}

export default router;