// router/payme.routes.js - TO'LIQ TUZATILGAN VERSIYA
import express from "express";
import mongoose from "mongoose";
import paidModel from "../model/paid.model.js";
import File from "../model/file.model.js";
import scanFileModel from "../model/scanFile.model.js";
import Statistika from "../model/statistika.model.js";
import VendingApparat from "../model/vendingApparat.model.js";
import { TransactionState } from "../enum/transaction.enum.js";
import base64 from "base-64";

const router = express.Router();

// Payme error kodlari
const PaymeError = {
  InvalidAmount: -31001,
  InvalidAccount: -31050,
  CantDoOperation: -31008,
  TransactionNotFound: -31003,
  InvalidAuthorization: -32504,
  AlreadyDone: -31060,
  Pending: -31050,
};

// Summa chegaralari
const PAYMENT_LIMITS = {
  MIN_AMOUNT: 100, // 1 som
  MAX_AMOUNT: 50000000, // 500,000 som
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

// Transaction state
const PaymeTransactionState = {
  Paid: 2,
  Pending: 1,
  PendingCanceled: -1,
  PaidCanceled: -2,
};

// Detail obyektini yaratish funksiyasi
const createDetailObject = (
  amount,
  title = "Vending apparat chop etish xizmati"
) => {
  return {
    receipt_type: 0,
    items: [
      {
        title: title,
        price: amount,
        count: 1,
        code: "10311001001000000", // IKPU kod - tasnif.soliq.uz dan oling
        units: 796, // Dona (xizmat birligi)
        vat_percent: 0,
        package_code: "796", // Xizmat birligi kodi
      },
    ],
  };
};

// Authentication middleware
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

// Helper functions
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

// ================== PUBLIC ENDPOINTS ==================

// Fayl uchun Payme link yaratish
router.post("/get-payme-link", async (req, res) => {
  try {
    const { orderId, amount } = req.body;

    console.log("Payme link so'rovi:", { orderId, amount });

    if (!orderId || !amount) {
      return res.json({
        status: "error",
        message: "Iltimos, orderId va amount ni kiriting",
      });
    }

    const uploadedFile = await File.findById(orderId);
    if (!uploadedFile) {
      return res.json({
        status: "error",
        message: "Bunday fayl topilmadi",
      });
    }

    const merchantId = process.env.PAYME_MERCHANT_ID;
    if (!merchantId || merchantId.length !== 24) {
      return res.json({
        status: "error",
        message: "Merchant ID noto'g'ri formatda",
      });
    }

    // URL yaratish (detail obyektisiz)
    const r = base64.encode(
      `m=${merchantId};ac.order_id=${orderId};a=${amount}`
    );

    const paymeLink = `https://checkout.paycom.uz/${r}`;

    console.log("Yaratilgan link:", paymeLink);

    res.json({
      status: "success",
      data: {
        link: paymeLink,
        amount: amount,
        orderId: orderId,
        merchantId: merchantId,
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

// Scan file uchun Payme link yaratish
router.post("/get-scan-payme-link", async (req, res) => {
  try {
    const { code, amount } = req.body;

    console.log("Scan Payme link so'rovi:", { code, amount });

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

    const merchantId = process.env.PAYME_MERCHANT_ID;
    if (!merchantId || merchantId.length !== 24) {
      return res.json({
        status: "error",
        message: "Merchant ID noto'g'ri formatda",
      });
    }

    // URL yaratish (detail obyektisiz)
    const r = base64.encode(
      `m=${merchantId};ac.order_id=${scanFile._id};a=${amount}`
    );

    const paymeLink = `https://checkout.paycom.uz/${r}`;

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

// To'lov holatini tekshirish
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

// ================== PAYME WEBHOOK ==================

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

// ================== WEBHOOK METHODS ==================

// 1. CheckPerformTransaction
async function checkPerformTransaction(req, res, params, id) {
  try {
    const { account, amount } = params;

    console.log("CheckPerformTransaction:", { account, amount });

    // Amount validatsiyasi
    if (!amount || typeof amount !== "number" || amount <= 0) {
      console.log("Invalid amount - not a valid number");
      return sendPaymeError(
        res,
        PaymeError.InvalidAmount,
        "Invalid amount",
        id
      );
    }

    // Amount chegaralarini tekshirish
    if (
      amount < PAYMENT_LIMITS.MIN_AMOUNT ||
      amount > PAYMENT_LIMITS.MAX_AMOUNT
    ) {
      console.log(`Amount out of range: ${amount} tiyin`);
      return sendPaymeError(
        res,
        PaymeError.InvalidAmount,
        "Amount out of range",
        id
      );
    }

    // Account validatsiyasi
    if (!account || !account.order_id) {
      console.log("Invalid account - no order_id");
      return sendPaymeError(
        res,
        PaymeError.InvalidAccount,
        "Invalid account",
        id
      );
    }

    // ObjectId format tekshirish
    if (!isValidObjectId(account.order_id)) {
      console.log("Invalid account - not valid ObjectId format");
      return sendPaymeError(
        res,
        PaymeError.InvalidAccount,
        "Invalid account format",
        id
      );
    }

    // Order mavjudligini tekshirish
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

    // Mavjud aktiv tranzaksiyalarni tekshirish
    const existingPayments = await paidModel.find({
      $or: [
        { "serviceData._id": account.order_id },
        { "serviceData._id": new mongoose.Types.ObjectId(account.order_id) },
      ],
      paymentMethod: "payme",
    });

    const activePayments = existingPayments.filter(
      (payment) => payment.status === "pending" || payment.status === "paid"
    );

    if (activePayments.length > 0) {
      const activePayment = activePayments[0];
      console.log(`Active payment found: Status = ${activePayment.status}`);

      if (activePayment.status === "paid") {
        console.log("Order already paid");
        return sendPaymeError(
          res,
          PaymeError.InvalidAccount,
          "Order already paid",
          id
        );
      }

      if (activePayment.status === "pending") {
        console.log("Order has pending transaction");
        return sendPaymeError(
          res,
          PaymeError.InvalidAccount,
          "Transaction pending",
          id
        );
      }
    }

    // Detail obyektini yaratish
    const serviceData = uploadedFile || scannedFile;
    const title = uploadedFile
      ? "Vending apparat chop etish xizmati"
      : "Scan fayl chop etish xizmati";
    const detail = createDetailObject(amount, title);

    console.log("CheckPerformTransaction - All validations passed");
    return sendPaymeResponse(
      res,
      {
        allow: true,
        detail: detail,
      },
      id
    );
  } catch (error) {
    console.error("CheckPerformTransaction error:", error);
    return sendPaymeError(res, PaymeError.InvalidAccount, "Check error", id);
  }
}

// 2. CheckTransaction
async function checkTransaction(req, res, params, id) {
  try {
    console.log("CheckTransaction called with ID:", params.id);

    const transaction = await paidModel.findOne({
      paymeTransactionId: params.id,
    });

    if (!transaction) {
      console.log("Transaction not found:", params.id);
      return sendPaymeError(
        res,
        PaymeError.TransactionNotFound,
        "Transaction not found",
        id
      );
    }

    console.log("CheckTransaction found:", transaction.paymeTransactionId);

    // Detail obyektini yaratish
    const title = transaction.serviceData.apparatId
      ? "Vending apparat chop etish xizmati"
      : "Scan fayl chop etish xizmati";
    const detail = createDetailObject(transaction.amount, title);

    const result = {
      create_time: transaction.paymeCreateTime,
      perform_time: transaction.paymePerformTime || 0,
      cancel_time: transaction.paymeCancelTime || 0,
      transaction: transaction._id.toString(),
      state: getTransactionState(transaction),
      reason: transaction.paymeReason || null,
      detail: detail,
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

// 3. CreateTransaction
async function createTransaction(req, res, params, id) {
  try {
    const { id: transactionId, time, amount, account } = params;

    console.log("CreateTransaction called:", {
      transactionId,
      account: account.order_id,
      amount,
    });

    // Amount validatsiyasi
    if (!amount || typeof amount !== "number" || amount <= 0) {
      console.log("CreateTransaction - Invalid amount");
      return sendPaymeError(
        res,
        PaymeError.InvalidAmount,
        "Invalid amount",
        id
      );
    }

    // Amount chegaralarini tekshirish
    if (
      amount < PAYMENT_LIMITS.MIN_AMOUNT ||
      amount > PAYMENT_LIMITS.MAX_AMOUNT
    ) {
      console.log(`CreateTransaction - Amount out of range: ${amount}`);
      return sendPaymeError(
        res,
        PaymeError.InvalidAmount,
        "Amount out of range",
        id
      );
    }

    // Account validatsiyasi
    if (!account || !account.order_id || !isValidObjectId(account.order_id)) {
      console.log("CreateTransaction - Invalid account");
      return sendPaymeError(
        res,
        PaymeError.InvalidAccount,
        "Invalid account",
        id
      );
    }

    // Aynan shu transaction ID mavjudligini tekshirish
    let existingTransaction = await paidModel.findOne({
      paymeTransactionId: transactionId,
    });

    if (existingTransaction) {
      console.log("Same transaction ID exists, returning same response");

      // Detail obyektini yaratish
      const title = existingTransaction.serviceData.apparatId
        ? "Vending apparat chop etish xizmati"
        : "Scan fayl chop etish xizmati";
      const detail = createDetailObject(existingTransaction.amount, title);

      return sendPaymeResponse(
        res,
        {
          transaction: existingTransaction._id.toString(),
          state: getTransactionState(existingTransaction),
          create_time: existingTransaction.paymeCreateTime,
          detail: detail,
        },
        id
      );
    }

    // Order mavjudligini tekshirish
    const uploadedFile = await File.findById(account.order_id);
    const scannedFile = await scanFileModel.findById(account.order_id);
    const serviceData = uploadedFile || scannedFile;

    if (!serviceData) {
      console.log("CreateTransaction - Order not found");
      return sendPaymeError(
        res,
        PaymeError.InvalidAccount,
        "Order not found",
        id
      );
    }

    // Aktiv tranzaksiyalarni tekshirish
    const existingPayments = await paidModel.find({
      $or: [
        { "serviceData._id": account.order_id },
        { "serviceData._id": new mongoose.Types.ObjectId(account.order_id) },
      ],
      paymentMethod: "payme",
    });

    const activePayments = existingPayments.filter(
      (payment) => payment.status === "pending" || payment.status === "paid"
    );

    if (activePayments.length > 0) {
      const activePayment = activePayments[0];
      console.log(`Active payment found: Status = ${activePayment.status}`);

      if (activePayment.status === "paid") {
        console.log("CreateTransaction - Order already paid");
        return sendPaymeError(
          res,
          PaymeError.InvalidAccount,
          "Order already paid",
          id
        );
      }

      if (activePayment.status === "pending") {
        console.log("CreateTransaction - Order has pending transaction");
        return sendPaymeError(
          res,
          PaymeError.InvalidAccount,
          "Another transaction is processing this order",
          id
        );
      }
    }

    // Yangi tranzaksiya yaratish
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

    // Detail obyektini yaratish
    const title = uploadedFile
      ? "Vending apparat chop etish xizmati"
      : "Scan fayl chop etish xizmati";
    const detail = createDetailObject(amount, title);

    return sendPaymeResponse(
      res,
      {
        transaction: newTransaction._id.toString(),
        state: PaymeTransactionState.Pending,
        create_time: newTransaction.paymeCreateTime,
        detail: detail,
      },
      id
    );
  } catch (error) {
    console.error("CreateTransaction error:", error);
    return sendPaymeError(res, PaymeError.CantDoOperation, "Create error", id);
  }
}

// 4. PerformTransaction
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

      // Detail obyektini yaratish
      const title = transaction.serviceData.apparatId
        ? "Vending apparat chop etish xizmati"
        : "Scan fayl chop etish xizmati";
      const detail = createDetailObject(transaction.amount, title);

      return sendPaymeResponse(
        res,
        {
          perform_time: transaction.paymePerformTime,
          transaction: transaction._id.toString(),
          state: PaymeTransactionState.Paid,
          detail: detail,
        },
        id
      );
    }

    // Vaqt tekshiruvi (12 daqiqa)
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
    const updatedTransaction = await paidModel.findOneAndUpdate(
      { paymeTransactionId: params.id },
      {
        status: "paid",
        paymePerformTime: currentTime,
      },
      { new: true }
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

    // Detail obyektini yaratish
    const title = transaction.serviceData.apparatId
      ? "Vending apparat chop etish xizmati"
      : "Scan fayl chop etish xizmati";
    const detail = createDetailObject(transaction.amount, title);

    return sendPaymeResponse(
      res,
      {
        perform_time: currentTime,
        transaction: transaction._id.toString(),
        state: PaymeTransactionState.Paid,
        detail: detail,
      },
      id
    );
  } catch (error) {
    console.error("PerformTransaction error:", error);
    return sendPaymeError(res, PaymeError.CantDoOperation, "Perform error", id);
  }
}

// 5. CancelTransaction
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

    // Agar tranzaksiya allaqachon bekor qilingan bo'lsa
    if (transaction.status === "cancelled") {
      // Detail obyektini yaratish
      const title = transaction.serviceData.apparatId
        ? "Vending apparat chop etish xizmati"
        : "Scan fayl chop etish xizmati";
      const detail = createDetailObject(transaction.amount, title);

      return sendPaymeResponse(
        res,
        {
          cancel_time: transaction.paymeCancelTime,
          transaction: transaction._id.toString(),
          state: getTransactionState(transaction),
          detail: detail,
        },
        id
      );
    }

    // Pending yoki paid tranzaksiyalarni bekor qilish
    if (transaction.status === "pending" || transaction.status === "paid") {
      const wasCompleted = transaction.status === "paid";

      // Tranzaksiyani bekor qilish
      const updatedTransaction = await paidModel.findOneAndUpdate(
        { paymeTransactionId: params.id },
        {
          status: "cancelled",
          paymeReason: params.reason,
          paymeCancelTime: currentTime,
        },
        { new: true }
      );

      // Agar to'langan tranzaksiya bekor qilinsa, statistikani qaytarish
      if (wasCompleted && transaction.serviceData.apparatId) {
        await reverseStatistics(
          transaction.serviceData.apparatId,
          transaction.amount
        );
      }

      // State to'g'ri hisoblash
      let state;
      if (wasCompleted) {
        state = PaymeTransactionState.PaidCanceled; // -2
      } else {
        state = PaymeTransactionState.PendingCanceled; // -1
      }

      // Detail obyektini yaratish
      const title = transaction.serviceData.apparatId
        ? "Vending apparat chop etish xizmati"
        : "Scan fayl chop etish xizmati";
      const detail = createDetailObject(transaction.amount, title);

      return sendPaymeResponse(
        res,
        {
          cancel_time: currentTime,
          transaction: transaction._id.toString(),
          state: state,
          detail: detail,
        },
        id
      );
    }

    // Agar tranzaksiya bekor qilish mumkin bo'lmagan holatda bo'lsa
    return sendPaymeError(
      res,
      PaymeError.CantDoOperation,
      "Can't cancel transaction",
      id
    );
  } catch (error) {
    console.error("CancelTransaction error:", error);
    return sendPaymeError(res, PaymeError.CantDoOperation, "Cancel error", id);
  }
}

// 6. GetStatement
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

    const result = transactions.map((transaction) => {
      // Detail obyektini yaratish
      const title = transaction.serviceData.apparatId
        ? "Vending apparat chop etish xizmati"
        : "Scan fayl chop etish xizmati";
      const detail = createDetailObject(transaction.amount, title);

      return {
        id: transaction.paymeTransactionId,
        time: transaction.paymeCreateTime,
        amount: transaction.amount,
        account: {
          order_id: transaction.serviceData._id,
        },
        create_time: transaction.paymeCreateTime,
        perform_time: transaction.paymePerformTime || 0,
        cancel_time: transaction.paymeCancelTime || 0,
        transaction: transaction._id.toString(),
        state: getTransactionState(transaction),
        reason: transaction.paymeReason || null,
        detail: detail,
      };
    });

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

// ================== HELPER FUNCTIONS ==================

function isValidObjectId(str) {
  if (!str || typeof str !== "string") return false;
  return /^[0-9a-fA-F]{24}$/.test(str);
}

function getTransactionState(transaction) {
  if (transaction.status === "paid") {
    return PaymeTransactionState.Paid; // 2
  } else if (transaction.status === "cancelled") {
    if (transaction.paymePerformTime && transaction.paymePerformTime > 0) {
      return PaymeTransactionState.PaidCanceled; // -2
    } else {
      return PaymeTransactionState.PendingCanceled; // -1
    }
  } else {
    return PaymeTransactionState.Pending; // 1
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

// ================== TEST ENDPOINTS ==================

// Test uchun detail obyektini ko'rish
router.get("/test-detail", (req, res) => {
  const detail = createDetailObject(5000, "Test chop etish xizmati");
  res.json({
    detail: detail,
    encoded: JSON.stringify(detail),
    base64: base64.encode(JSON.stringify(detail)),
  });
});

// Test uchun merchant ID tekshirish
router.get("/test-merchant", (req, res) => {
  res.json({
    merchantId: process.env.PAYME_MERCHANT_ID,
    length: process.env.PAYME_MERCHANT_ID?.length,
    testKey: process.env.PAYME_TEST_KEY,
    isValidLength: process.env.PAYME_MERCHANT_ID?.length === 24,
  });
});

export default router;
