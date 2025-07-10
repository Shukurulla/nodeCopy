// 1. CheckPerformTransaction - TEST ENVIRONMENT UCHUN import express from "express";
import mongoose from "mongoose";
import paidModel from "../model/paid.model.js";
import File from "../model/file.model.js";
import scanFileModel from "../model/scanFile.model.js";
import Statistika from "../model/statistika.model.js";
import VendingApparat from "../model/vendingApparat.model.js";
import { TransactionState } from "../enum/transaction.enum.js";
import base64 from "base-64";

const router = express.Router();

// YouTube dasturchisining kodiga asoslangan PAYME ERROR kodlari
const PaymeError = {
  InvalidAmount: -31001, // Noto'g'ri summa
  InvalidAccount: -31050, // Noto'g'ri account
  CantDoOperation: -31008, // Operatsiya bajarib bo'lmaydi
  TransactionNotFound: -31003, // Tranzaksiya topilmadi
  InvalidAuthorization: -32504, // Avtorizatsiya xatoligi
  AlreadyDone: -31060, // Allaqachon to'langan
  Pending: -31050, // Kutish holatida
};

// Bizning loyiha uchun summa chegaralari
const PAYMENT_LIMITS = {
  MIN_AMOUNT: 600, // Minimum 600 som (1 qog'oz)
  MAX_AMOUNT: 5000000, // Maksimum 5 million som
};

// Payme metodlari
const PaymeMethod = {
  CheckPerformTransaction: "CheckPerformTransaction",
  CheckTransaction: "CheckTransaction",
  CreateTransaction: "CreateTransaction",
  PerformTransaction: "PerformTransaction",
  CancelTransaction: "CancelTransaction",
  GetStatement: "GetStatement",
};

// Transaction state (YouTube kod asosida)
const PaymeTransactionState = {
  Paid: 2,
  Pending: 1,
  PendingCanceled: -1,
  PaidCanceled: -2,
};

// YouTube dasturchisining authentication mantiqiga asoslangan
const paymeCheckToken = (req, res, next) => {
  try {
    const { id } = req.body;
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith("Basic ")) {
      return sendPaymeError(
        res,
        PaymeError.InvalidAuthorization,
        "Unauthorized",
        id
      );
    }

    const token = authHeader.split(" ")[1];
    if (!token) {
      return sendPaymeError(
        res,
        PaymeError.InvalidAuthorization,
        "No token",
        id
      );
    }

    try {
      const decoded = base64.decode(token);
      const testKey = process.env.PAYME_TEST_KEY?.replace(/"/g, "");
      const prodKey = process.env.PAYME_SECRET_KEY?.replace(/"/g, "");

      const expectedTestFormat = `Paycom:${testKey}`;
      const expectedProdFormat = `Paycom:${prodKey}`;

      if (decoded !== expectedTestFormat && decoded !== expectedProdFormat) {
        return sendPaymeError(
          res,
          PaymeError.InvalidAuthorization,
          "Invalid key",
          id
        );
      }
    } catch {
      return sendPaymeError(
        res,
        PaymeError.InvalidAuthorization,
        "Decode error",
        id
      );
    }

    next();
  } catch (error) {
    const { id } = req.body;
    return sendPaymeError(
      res,
      PaymeError.InvalidAuthorization,
      "Auth error",
      id
    );
  }
};

// YouTube kodiga asoslangan error va response funktsilar
const sendPaymeError = (res, code, message, id = null) => {
  return res.json({
    jsonrpc: "2.0",
    id: id,
    error: {
      code: code,
      message: message,
    },
  });
};

const sendPaymeResponse = (res, result, id = null) => {
  return res.json({
    jsonrpc: "2.0",
    id: id,
    result: result,
  });
};

// QR kod va link generatsiya (o'zgartirilmadi)
router.post("/get-payme-link", async (req, res) => {
  try {
    const { orderId, amount } = req.body;

    if (!orderId || !amount) {
      return res.json({
        status: "error",
        message: "Iltimos, orderId va amount ni kiriting",
      });
    }

    const uploadedFile = await File.findById(orderId);
    const scannedFile = await scanFileModel.findById(orderId);

    if (!uploadedFile && !scannedFile) {
      return res.json({
        status: "error",
        message: "Bunday fayl topilmadi",
      });
    }

    const params = {
      m: "686687d05e3cb0be785daea7",
      ac: {
        order_id: orderId,
      },
      a: amount * 100,
    };

    const encodedParams = base64.encode(JSON.stringify(params));
    const paymeLink = `https://checkout.paycom.uz/${encodedParams}`;

    res.json({
      status: "success",
      data: {
        link: paymeLink,
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

router.post("/get-scan-payme-link", async (req, res) => {
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

    const params = {
      m: "686687d05e3cb0be785daea7",
      ac: {
        order_id: scanFile._id.toString(),
      },
      a: amount * 100,
    };

    const encodedParams = base64.encode(JSON.stringify(params));
    const paymeLink = `https://checkout.paycom.uz/${encodedParams}`;

    res.json({
      status: "success",
      data: {
        link: paymeLink,
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

router.post("/check-payment-status", async (req, res) => {
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

// ASOSIY PAYME WEBHOOK - YouTube dasturchisining strukturasiga asoslangan
router.post("/", paymeCheckToken, async (req, res) => {
  try {
    const { method, params, id } = req.body;

    console.log("Payme webhook:", { method, params, id });

    switch (method) {
      case PaymeMethod.CheckPerformTransaction:
        return await checkPerformTransaction(req, res, params, id);
      case PaymeMethod.CheckTransaction:
        return await checkTransaction(req, res, params, id);
      case PaymeMethod.CreateTransaction:
        return await createTransaction(req, res, params, id);
      case PaymeMethod.PerformTransaction:
        return await performTransaction(req, res, params, id);
      case PaymeMethod.CancelTransaction:
        return await cancelTransaction(req, res, params, id);
      case PaymeMethod.GetStatement:
        return await getStatement(req, res, params, id);
      default:
        return sendPaymeError(
          res,
          PaymeError.CantDoOperation,
          "Method not found",
          id
        );
    }
  } catch (error) {
    console.error("Payme endpoint error:", error);
    return sendPaymeError(
      res,
      PaymeError.CantDoOperation,
      "Server error",
      req.body.id
    );
  }
});

// 1. CheckPerformTransaction - TO'LIQ VALIDATSIYA
async function checkPerformTransaction(req, res, params, id) {
  try {
    const { account, amount } = params;

    console.log("CheckPerformTransaction:", { account, amount });

    // 1. Account parametrini tekshirish
    if (!account || !account.order_id) {
      console.log("Invalid account - no order_id");
      return sendPaymeError(
        res,
        PaymeError.InvalidAccount,
        "Invalid account",
        id
      );
    }

    // 2. Account format tekshirish (ObjectId formatda bo'lishi kerak)
    if (!isValidObjectId(account.order_id)) {
      console.log("Invalid account - not valid ObjectId format");
      return sendPaymeError(
        res,
        PaymeError.InvalidAccount,
        "Invalid account format",
        id
      );
    }

    // 3. Amount parametrini tekshirish
    if (!amount || typeof amount !== "number") {
      console.log("Invalid amount - not a number");
      return sendPaymeError(
        res,
        PaymeError.InvalidAmount,
        "Invalid amount",
        id
      );
    }

    // 4. Amount tiyin formatidan som formatiga o'tkazish (Payme tiyin ishlatadi)
    const amountInSom = amount / 100;

    // 5. Summa chegaralarini tekshirish
    if (
      amountInSom < PAYMENT_LIMITS.MIN_AMOUNT ||
      amountInSom > PAYMENT_LIMITS.MAX_AMOUNT
    ) {
      console.log(
        `Amount out of range: ${amountInSom} som. Range: ${PAYMENT_LIMITS.MIN_AMOUNT}-${PAYMENT_LIMITS.MAX_AMOUNT}`
      );
      return sendPaymeError(
        res,
        PaymeError.InvalidAmount,
        "Amount out of range",
        id
      );
    }

    // 6. Order mavjudligini tekshirish
    const uploadedFile = await File.findById(account.order_id);
    const scannedFile = await scanFileModel.findById(account.order_id);

    if (!uploadedFile && !scannedFile) {
      console.log("Order not found in database");
      return sendPaymeError(
        res,
        PaymeError.InvalidAccount,
        "Order not found",
        id
      );
    }

    // 7. TEST ENVIRONMENT UCHUN: Faqat oxirgi 1 soat ichidagi tranzaksiyalarni tekshirish
    const oneHourAgo = Date.now() - 60 * 60 * 1000;

    const recentActiveTransactions = await paidModel.find({
      $or: [
        { "serviceData._id": account.order_id },
        { "serviceData._id": new mongoose.Types.ObjectId(account.order_id) },
      ],
      paymentMethod: "payme",
      $or: [{ status: "paid" }, { status: "pending" }],
      paymeCreateTime: { $gte: oneHourAgo }, // Faqat oxirgi 1 soat
    });

    console.log(
      "Recent active transactions (last 1 hour):",
      recentActiveTransactions.length
    );

    if (recentActiveTransactions.length > 0) {
      const activeTransaction = recentActiveTransactions[0];
      if (activeTransaction.status === "paid") {
        console.log("Order already paid");
        return sendPaymeError(res, PaymeError.AlreadyDone, "Already paid", id);
      }
      if (activeTransaction.status === "pending") {
        console.log("Order pending");
        return sendPaymeError(
          res,
          PaymeError.Pending,
          "Transaction pending",
          id
        );
      }
    }

    // 8. Agar hamma narsa yaxshi bo'lsa
    console.log("CheckPerformTransaction - All validations passed");
    return sendPaymeResponse(res, { allow: true }, id);
  } catch (error) {
    console.error("CheckPerformTransaction error:", error);
    return sendPaymeError(res, PaymeError.InvalidAccount, "Check error", id);
  }
}

// 2. CheckTransaction - TRANSACTION FIELD TO'G'RI QIYMAT
async function checkTransaction(req, res, params, id) {
  try {
    const transaction = await paidModel.findOne({
      paymeTransactionId: params.id,
    });

    if (!transaction) {
      return sendPaymeError(
        res,
        PaymeError.TransactionNotFound,
        "Transaction not found",
        id
      );
    }

    console.log("CheckTransaction found:", transaction.paymeTransactionId);

    // MUHIM: transaction maydonida internal DB ID qaytarish (YouTube kodiga asoslangan)
    const result = {
      create_time: transaction.paymeCreateTime,
      perform_time: transaction.paymePerformTime || 0,
      cancel_time: transaction.paymeCancelTime || 0,
      transaction: transaction._id.toString(), // DB ID qaytarish, Payme ID emas
      state: getTransactionState(transaction),
      reason: transaction.paymeReason || null,
    };

    console.log("CheckTransaction result:", result);
    return sendPaymeResponse(res, result, id);
  } catch (error) {
    console.error("CheckTransaction error:", error);
    return sendPaymeError(
      res,
      PaymeError.TransactionNotFound,
      "Check error",
      id
    );
  }
}

// 3. CreateTransaction - MUAMMO HAL QILINDI
async function createTransaction(req, res, params, id) {
  try {
    const { id: transactionId, time, amount, account } = params;

    console.log("CreateTransaction called:", {
      transactionId,
      account: account.order_id,
    });

    // 1. Aynan shu Payme transaction ID mavjudligini tekshirish
    let existingTransaction = await paidModel.findOne({
      paymeTransactionId: transactionId,
    });

    if (existingTransaction) {
      console.log("Same transaction ID exists, returning same response");
      // Bir xil Payme transaction ID - bir xil javob qaytarish
      return sendPaymeResponse(
        res,
        {
          transaction: existingTransaction._id.toString(), // DB ID qaytarish
          state: getTransactionState(existingTransaction),
          create_time: existingTransaction.paymeCreateTime,
        },
        id
      );
    }

    // 2. Order mavjudligini tekshirish
    const uploadedFile = await File.findById(account.order_id);
    const scannedFile = await scanFileModel.findById(account.order_id);
    const serviceData = uploadedFile || scannedFile;

    if (!serviceData) {
      return sendPaymeError(
        res,
        PaymeError.InvalidAccount,
        "Order not found",
        id
      );
    }

    // 3. KRITIK: Shu order uchun RECENT aktiv Payme tranzaksiyalari bormi?
    // TEST ENVIRONMENT UCHUN: Faqat oxirgi 1 soat ichidagi tranzaksiyalarni tekshirish
    const oneHourAgo = Date.now() - 60 * 60 * 1000;

    const recentPaymeTransactions = await paidModel.find({
      $or: [
        { "serviceData._id": account.order_id },
        { "serviceData._id": new mongoose.Types.ObjectId(account.order_id) },
      ],
      paymentMethod: "payme",
      paymeCreateTime: { $gte: oneHourAgo }, // Faqat oxirgi 1 soat
    });

    console.log(
      "Recent Payme transactions for order (last 1 hour):",
      account.order_id
    );
    console.log("Found recent transactions:", recentPaymeTransactions.length);

    recentPaymeTransactions.forEach((tx) => {
      console.log(
        `Recent Transaction: ${tx.paymeTransactionId}, Status: ${
          tx.status
        }, Time: ${new Date(tx.paymeCreateTime)}`
      );
    });

    // Aktiv tranzaksiyalarni filter qilish
    const activeTransactions = recentPaymeTransactions.filter(
      (tx) => tx.status === "pending" || tx.status === "paid"
    );

    console.log("Recent active transactions:", activeTransactions.length);

    // Agar shu order uchun RECENT aktiv Payme tranzaksiya mavjud bo'lsa
    if (activeTransactions.length > 0) {
      const activeTransaction = activeTransactions[0];

      console.log(
        `Recent active transaction found: ${activeTransaction.paymeTransactionId}, Status: ${activeTransaction.status}`
      );

      if (activeTransaction.status === "paid") {
        console.log(
          "Order already paid by recent Payme transaction - returning -31060"
        );
        return sendPaymeError(
          res,
          PaymeError.AlreadyDone,
          "Order already paid",
          id
        );
      }

      if (activeTransaction.status === "pending") {
        console.log(
          "Order has recent pending Payme transaction - returning -31050"
        );
        return sendPaymeError(
          res,
          PaymeError.Pending,
          "Another transaction is processing this order",
          id
        );
      }
    }

    // 4. Yangi tranzaksiya yaratish (faqat order uchun birinchi Payme tranzaksiya bo'lsa)
    console.log("Creating new transaction for order");
    const newTransaction = await paidModel.create({
      paymeTransactionId: transactionId,
      serviceData: serviceData,
      amount: amount,
      status: "pending",
      paymeCreateTime: time,
      paymentMethod: "payme",
    });

    console.log("New transaction created:", newTransaction._id);

    return sendPaymeResponse(
      res,
      {
        transaction: newTransaction._id.toString(), // DB ID qaytarish
        state: PaymeTransactionState.Pending,
        create_time: newTransaction.paymeCreateTime,
      },
      id
    );
  } catch (error) {
    console.error("CreateTransaction error:", error);
    return sendPaymeError(res, PaymeError.CantDoOperation, "Create error", id);
  }
}

// 4. PerformTransaction - YouTube dasturchisining mantiqiga asoslangan
async function performTransaction(req, res, params, id) {
  try {
    const currentTime = Date.now();

    const transaction = await paidModel.findOne({
      paymeTransactionId: params.id,
    });

    if (!transaction) {
      return sendPaymeError(
        res,
        PaymeError.TransactionNotFound,
        "Transaction not found",
        id
      );
    }

    if (transaction.status !== "pending") {
      if (transaction.status !== "paid") {
        return sendPaymeError(
          res,
          PaymeError.CantDoOperation,
          "Can't perform",
          id
        );
      }
      return sendPaymeResponse(
        res,
        {
          perform_time: transaction.paymePerformTime,
          transaction: transaction._id.toString(), // DB ID qaytarish
          state: PaymeTransactionState.Paid,
        },
        id
      );
    }

    // YouTube kodi: Vaqt tekshiruvi
    const expirationTime =
      (currentTime - transaction.paymeCreateTime) / 60000 < 12;
    if (!expirationTime) {
      await paidModel.findOneAndUpdate(
        { paymeTransactionId: params.id },
        {
          status: "cancelled",
          paymeCancelTime: currentTime,
          paymeReason: 4,
        }
      );
      return sendPaymeError(
        res,
        PaymeError.CantDoOperation,
        "Transaction expired",
        id
      );
    }

    // To'lovni amalga oshirish
    await paidModel.findOneAndUpdate(
      { paymeTransactionId: params.id },
      {
        status: "paid",
        paymePerformTime: currentTime,
      }
    );

    // Statistikani yangilash
    if (transaction.serviceData.apparatId) {
      await updateStatistics(
        transaction.serviceData.apparatId,
        transaction.amount
      );
    }

    // Socket.io xabar
    req.app.get("io").emit("tolovMuvaffaqiyatli", {
      fileId: transaction.serviceData._id,
      apparatId: transaction.serviceData.apparatId,
      amount: transaction.amount,
      qogozSoni: 1,
      paymentMethod: "payme",
    });

    return sendPaymeResponse(
      res,
      {
        perform_time: currentTime,
        transaction: transaction._id.toString(), // DB ID qaytarish
        state: PaymeTransactionState.Paid,
      },
      id
    );
  } catch (error) {
    console.error("PerformTransaction error:", error);
    return sendPaymeError(res, PaymeError.CantDoOperation, "Perform error", id);
  }
}

// 5. CancelTransaction - YouTube dasturchisining mantiqiga asoslangan
async function cancelTransaction(req, res, params, id) {
  try {
    const transaction = await paidModel.findOne({
      paymeTransactionId: params.id,
    });

    if (!transaction) {
      return sendPaymeError(
        res,
        PaymeError.TransactionNotFound,
        "Transaction not found",
        id
      );
    }

    const currentTime = Date.now();

    if (transaction.status === "pending" || transaction.status === "paid") {
      let newState;
      if (transaction.status === "paid") {
        newState = "cancelled";
        // Statistikani qaytarish
        if (transaction.serviceData.apparatId) {
          await reverseStatistics(
            transaction.serviceData.apparatId,
            transaction.amount
          );
        }
      } else {
        newState = "cancelled";
      }

      await paidModel.findOneAndUpdate(
        { paymeTransactionId: params.id },
        {
          status: newState,
          paymeReason: params.reason,
          paymeCancelTime: currentTime,
        }
      );
    }

    return sendPaymeResponse(
      res,
      {
        cancel_time: transaction.paymeCancelTime || currentTime,
        transaction: transaction._id.toString(), // DB ID qaytarish
        state: getTransactionState({ ...transaction, status: "cancelled" }),
      },
      id
    );
  } catch (error) {
    console.error("CancelTransaction error:", error);
    return sendPaymeError(res, PaymeError.CantDoOperation, "Cancel error", id);
  }
}

// 6. GetStatement - YouTube dasturchisining mantiqiga asoslangan
async function getStatement(req, res, params, id) {
  try {
    const { from, to } = params;

    const transactions = await paidModel
      .find({
        paymeTransactionId: { $exists: true },
        paymeCreateTime: { $gte: from, $lte: to },
        paymentMethod: "payme",
      })
      .sort({ paymeCreateTime: 1 });

    const result = transactions.map((transaction) => ({
      id: transaction.paymeTransactionId,
      time: transaction.paymeCreateTime,
      amount: transaction.amount,
      account: {
        order_id: transaction.serviceData._id,
      },
      create_time: transaction.paymeCreateTime,
      perform_time: transaction.paymePerformTime || 0,
      cancel_time: transaction.paymeCancelTime || 0,
      transaction: transaction._id.toString(), // DB ID qaytarish
      state: getTransactionState(transaction),
      reason: transaction.paymeReason || null,
    }));

    return sendPaymeResponse(res, { transactions: result }, id);
  } catch (error) {
    console.error("GetStatement error:", error);
    return sendPaymeError(
      res,
      PaymeError.CantDoOperation,
      "Statement error",
      id
    );
  }
}

// Helper functions
function isValidObjectId(str) {
  // MongoDB ObjectId formatini tekshirish
  if (!str || typeof str !== "string") return false;
  return /^[0-9a-fA-F]{24}$/.test(str);
}

function getTransactionState(transaction) {
  if (transaction.status === "paid") {
    return PaymeTransactionState.Paid;
  } else if (transaction.status === "cancelled") {
    if (transaction.paymePerformTime) {
      return PaymeTransactionState.PaidCanceled;
    } else {
      return PaymeTransactionState.PendingCanceled;
    }
  } else {
    return PaymeTransactionState.Pending;
  }
}

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

    const apparat = await VendingApparat.findOne({ apparatId });
    if (apparat) {
      apparat.joriyQogozSoni -= 1;
      await apparat.save();
    }
  } catch (error) {
    console.error("Statistikani yangilashda xatolik:", error);
  }
}

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
      statistika.ishlatilganQogoz = Math.max(
        0,
        statistika.ishlatilganQogoz - 1
      );
      await statistika.save();
    }

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
