import express from "express";
import paidModel from "../model/paid.model.js";
import File from "../model/file.model.js";
import scanFileModel from "../model/scanFile.model.js";
import Statistika from "../model/statistika.model.js";
import VendingApparat from "../model/vendingApparat.model.js";
import { TransactionState } from "../enum/transaction.enum.js";
import base64 from "base-64";

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

// Payme authentication middleware
const paymeCheckToken = (req, res, next) => {
  try {
    const { id } = req.body;
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith("Basic ")) {
      return sendPaymeError(
        res,
        PaymeError.InvalidAuthorization,
        "Unauthorized - No Basic Auth",
        id
      );
    }

    const token = authHeader.split(" ")[1];
    if (!token) {
      return sendPaymeError(
        res,
        PaymeError.InvalidAuthorization,
        "Unauthorized - No Token",
        id
      );
    }

    try {
      const decoded = base64.decode(token);
      if (!decoded.includes(process.env.PAYME_SECRET_KEY)) {
        return sendPaymeError(
          res,
          PaymeError.InvalidAuthorization,
          "Unauthorized - Invalid Key",
          id
        );
      }
    } catch (decodeError) {
      return sendPaymeError(
        res,
        PaymeError.InvalidAuthorization,
        "Unauthorized - Decode Error",
        id
      );
    }

    next();
  } catch (error) {
    const { id } = req.body;
    return sendPaymeError(
      res,
      PaymeError.InvalidAuthorization,
      "Unauthorized - Exception",
      id
    );
  }
};

// Payme xatolik javobini yuborish
const sendPaymeError = (res, code, message, id = null) => {
  const response = {
    jsonrpc: "2.0",
    id: id,
    error: {
      code: code,
      message: message,
    },
  };
  return res.json(response);
};

// Payme muvaffaqiyatli javobini yuborish
const sendPaymeResponse = (res, result, id = null) => {
  const response = {
    jsonrpc: "2.0",
    id: id,
    result: result,
  };
  return res.json(response);
};

// QR kod va to'lov linkini olish - BU ENDPOINT AUTHORIZATION TALAB QILMAYDI
router.post("/get-payme-link", async (req, res) => {
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

// Scan file uchun Payme link - BU HAM AUTHORIZATION TALAB QILMAYDI
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

    const paymeLink = `https://checkout.paycom.uz/${process.env.PAYME_MERCHANT_ID}?amount=${amount}&account[order_id]=${scanFile._id}`;

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

// ASOSIY PAYME WEBHOOK ENDPOINT
router.post("/", paymeCheckToken, async (req, res) => {
  try {
    const { method, params, id } = req.body;

    console.log("Payme webhook received:", { method, params, id });

    // Metodga qarab yo'naltirish
    switch (method) {
      case PaymeMethod.CheckPerformTransaction:
        await checkPerformTransaction(req, res, params, id);
        break;
      case PaymeMethod.CreateTransaction:
        await createTransaction(req, res, params, id);
        break;
      case PaymeMethod.PerformTransaction:
        await performTransaction(req, res, params, id);
        break;
      case PaymeMethod.CheckTransaction:
        await checkTransaction(req, res, params, id);
        break;
      case PaymeMethod.CancelTransaction:
        await cancelTransaction(req, res, params, id);
        break;
      case PaymeMethod.GetStatement:
        await getStatement(req, res, params, id);
        break;
      default:
        sendPaymeError(res, PaymeError.CouldNotPerform, "Method not found", id);
    }
  } catch (error) {
    console.error("Payme endpoint error:", error);
    sendPaymeError(
      res,
      PaymeError.CouldNotPerform,
      "Internal server error",
      req.body.id
    );
  }
});

// 1. CheckPerformTransaction
async function checkPerformTransaction(req, res, params, id) {
  try {
    const { account, amount } = params;

    if (!account || !account.order_id) {
      return sendPaymeError(
        res,
        PaymeError.InvalidAccount,
        "Invalid account",
        id
      );
    }

    if (!amount || amount <= 0) {
      return sendPaymeError(
        res,
        PaymeError.InvalidAmount,
        "Invalid amount",
        id
      );
    }

    // Faylni tekshirish
    const uploadedFile = await File.findById(account.order_id);
    const scannedFile = await scanFileModel.findById(account.order_id);

    if (!uploadedFile && !scannedFile) {
      return sendPaymeError(
        res,
        PaymeError.InvalidAccount,
        "Order not found",
        id
      );
    }

    // Allaqachon to'langanligini tekshirish
    const existingPayment = await paidModel.findOne({
      "serviceData._id": account.order_id,
      status: "paid",
    });

    if (existingPayment) {
      return sendPaymeError(
        res,
        PaymeError.TransactionNotAllowed,
        "Order already paid",
        id
      );
    }

    sendPaymeResponse(res, { allow: true }, id);
  } catch (error) {
    console.error("CheckPerformTransaction error:", error);
    sendPaymeError(res, PaymeError.CouldNotPerform, "Check perform failed", id);
  }
}

// 2. CreateTransaction
async function createTransaction(req, res, params, id) {
  try {
    const { id: transactionId, time, amount, account } = params;

    // Tranzaksiya mavjudligini tekshirish
    let transaction = await paidModel.findOne({
      paymeTransactionId: transactionId,
    });

    if (transaction) {
      if (transaction.status === "pending") {
        return sendPaymeResponse(
          res,
          {
            transaction: transaction._id.toString(),
            state: TransactionState.Pending,
            create_time: transaction.paymeCreateTime,
          },
          id
        );
      } else {
        return sendPaymeError(
          res,
          PaymeError.TransactionAlreadyExists,
          "Transaction already exists",
          id
        );
      }
    }

    // Faylni tekshirish
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

    // Yangi tranzaksiya yaratish
    transaction = await paidModel.create({
      paymeTransactionId: transactionId,
      serviceData: serviceData,
      amount: amount,
      status: "pending",
      paymeCreateTime: time,
      paymentMethod: "payme",
    });

    sendPaymeResponse(
      res,
      {
        transaction: transaction._id.toString(),
        state: TransactionState.Pending,
        create_time: time,
      },
      id
    );
  } catch (error) {
    console.error("CreateTransaction error:", error);
    sendPaymeError(
      res,
      PaymeError.CouldNotPerform,
      "Create transaction failed",
      id
    );
  }
}

// 3. PerformTransaction
async function performTransaction(req, res, params, id) {
  try {
    const { id: transactionId } = params;

    const transaction = await paidModel.findOne({
      paymeTransactionId: transactionId,
    });

    if (!transaction) {
      return sendPaymeError(
        res,
        PaymeError.TransactionNotFound,
        "Transaction not found",
        id
      );
    }

    if (transaction.status === "paid") {
      return sendPaymeResponse(
        res,
        {
          transaction: transaction._id.toString(),
          state: TransactionState.Paid,
          perform_time: transaction.paymePerformTime,
        },
        id
      );
    }

    if (transaction.status === "cancelled") {
      return sendPaymeError(
        res,
        PaymeError.TransactionCancelled,
        "Transaction cancelled",
        id
      );
    }

    // To'lovni amalga oshirish
    const performTime = Date.now();
    transaction.status = "paid";
    transaction.paymePerformTime = performTime;
    await transaction.save();

    // Statistikani yangilash
    if (transaction.serviceData.apparatId) {
      await updateStatistics(
        transaction.serviceData.apparatId,
        transaction.amount
      );
    }

    // Socket.io orqali real-time xabar
    req.app.get("io").emit("tolovMuvaffaqiyatli", {
      fileId: transaction.serviceData._id,
      apparatId: transaction.serviceData.apparatId,
      amount: transaction.amount,
      qogozSoni: 1,
      paymentMethod: "payme",
    });

    sendPaymeResponse(
      res,
      {
        transaction: transaction._id.toString(),
        state: TransactionState.Paid,
        perform_time: performTime,
      },
      id
    );
  } catch (error) {
    console.error("PerformTransaction error:", error);
    sendPaymeError(
      res,
      PaymeError.CouldNotPerform,
      "Perform transaction failed",
      id
    );
  }
}

// 4. CheckTransaction
async function checkTransaction(req, res, params, id) {
  try {
    const { id: transactionId } = params;

    const transaction = await paidModel.findOne({
      paymeTransactionId: transactionId,
    });

    if (!transaction) {
      return sendPaymeError(
        res,
        PaymeError.TransactionNotFound,
        "Transaction not found",
        id
      );
    }

    const result = {
      transaction: transaction._id.toString(),
      create_time: transaction.paymeCreateTime,
      state:
        transaction.status === "paid"
          ? TransactionState.Paid
          : transaction.status === "cancelled"
          ? TransactionState.PaidCanceled
          : TransactionState.Pending,
    };

    if (transaction.paymePerformTime) {
      result.perform_time = transaction.paymePerformTime;
    }

    if (transaction.status === "cancelled" && transaction.paymeReason) {
      result.reason = transaction.paymeReason;
    }

    sendPaymeResponse(res, result, id);
  } catch (error) {
    console.error("CheckTransaction error:", error);
    sendPaymeError(
      res,
      PaymeError.CouldNotPerform,
      "Check transaction failed",
      id
    );
  }
}

// 5. CancelTransaction
async function cancelTransaction(req, res, params, id) {
  try {
    const { id: transactionId, reason } = params;

    const transaction = await paidModel.findOne({
      paymeTransactionId: transactionId,
    });

    if (!transaction) {
      return sendPaymeError(
        res,
        PaymeError.TransactionNotFound,
        "Transaction not found",
        id
      );
    }

    const cancelTime = Date.now();

    if (transaction.status === "paid") {
      // To'langan tranzaksiyani bekor qilish
      transaction.status = "cancelled";
      transaction.paymeReason = reason;
      transaction.paymeCancelTime = cancelTime;
      await transaction.save();

      // Statistikani qaytarish
      if (transaction.serviceData.apparatId) {
        await reverseStatistics(
          transaction.serviceData.apparatId,
          transaction.amount
        );
      }

      return sendPaymeResponse(
        res,
        {
          transaction: transaction._id.toString(),
          cancel_time: cancelTime,
          state: TransactionState.PaidCanceled,
        },
        id
      );
    } else {
      // Pending tranzaksiyani bekor qilish
      transaction.status = "cancelled";
      transaction.paymeReason = reason;
      transaction.paymeCancelTime = cancelTime;
      await transaction.save();

      return sendPaymeResponse(
        res,
        {
          transaction: transaction._id.toString(),
          cancel_time: cancelTime,
          state: TransactionState.PendingCanceled,
        },
        id
      );
    }
  } catch (error) {
    console.error("CancelTransaction error:", error);
    sendPaymeError(
      res,
      PaymeError.CouldNotPerform,
      "Cancel transaction failed",
      id
    );
  }
}

// 6. GetStatement
async function getStatement(req, res, params, id) {
  try {
    const { from, to } = params;

    const transactions = await paidModel
      .find({
        paymeTransactionId: { $exists: true },
        paymeCreateTime: {
          $gte: from,
          $lte: to,
        },
      })
      .sort({ paymeCreateTime: 1 });

    const result = {
      transactions: transactions.map((t) => ({
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
        state:
          t.status === "paid"
            ? TransactionState.Paid
            : t.status === "cancelled"
            ? TransactionState.PaidCanceled
            : TransactionState.Pending,
        reason: t.paymeReason || null,
      })),
    };

    sendPaymeResponse(res, result, id);
  } catch (error) {
    console.error("GetStatement error:", error);
    sendPaymeError(res, PaymeError.CouldNotPerform, "Get statement failed", id);
  }
}

// Statistikani yangilash funksiyasi
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

// Statistikani qaytarish funksiyasi
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
