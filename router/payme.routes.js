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
  // Yangi xatoliklar qo'shildi
  TransactionNotAllowedForOrder: -31099, // Buyurtma uchun tranzaksiya ruxsat etilmagan
  OrderProcessing: -31080, // Buyurtma qayta ishlanmoqda
  OrderBlocked: -31070, // Buyurtma bloklangan
};

const message = {
  uz: "Buyurtma topilmadi",
  ru: "Заказ не найден",
  en: "Order not found",
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

// Order state enum - test talablariga mos
const OrderState = {
  WaitingPayment: 0, // Ожидает оплаты
  Processing: 1, // Обрабатывается
  Blocked: 2, // Заблокирован
  NotExists: 3, // Не существует
};

// Helper function: Order holatini aniqlash
function getOrderState(serviceData, existingTransactions) {
  if (!serviceData) {
    return OrderState.NotExists;
  }

  // Allaqachon to'langan tranzaksiya bor-yo'qligini tekshirish
  const paidTransaction = existingTransactions.find((t) => t.status === "paid");
  if (paidTransaction) {
    return OrderState.Blocked; // To'langan = bloklangan
  }

  // Boshqa pending tranzaksiya bor-yo'qligini tekshirish
  const pendingTransaction = existingTransactions.find(
    (t) => t.status === "pending"
  );
  if (pendingTransaction) {
    return OrderState.Processing; // Boshqa tranzaksiya qayta ishlanmoqda
  }

  return OrderState.WaitingPayment; // To'lov kutilmoqda
}

// Helper function: Transaction state ni aniqlash
function getTransactionState(transaction) {
  if (transaction.status === "paid") {
    return TransactionState.Paid; // 2
  } else if (transaction.status === "cancelled") {
    if (transaction.paymePerformTime) {
      return TransactionState.PaidCanceled; // -2
    } else {
      return TransactionState.PendingCanceled; // -1
    }
  } else {
    return TransactionState.Pending; // 1
  }
}

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

      const testKey = process.env.PAYME_TEST_KEY?.replace(/"/g, "");
      const prodKey = process.env.PAYME_SECRET_KEY?.replace(/"/g, "");

      const expectedTestFormat = `Paycom:${testKey}`;
      const expectedProdFormat = `Paycom:${prodKey}`;

      const isValidKey =
        decoded === expectedTestFormat || decoded === expectedProdFormat;

      if (!isValidKey) {
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
  console.log("Sending Payme Error:", response);
  return res.json(response);
};

// Payme muvaffaqiyatli javobini yuborish
const sendPaymeResponse = (res, result, id = null) => {
  const response = {
    jsonrpc: "2.0",
    id: id,
    result: result,
  };
  console.log("Sending Payme Response:", response);
  return res.json(response);
};

// QR kod va to'lov linkini olish
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

// Scan file uchun Payme link
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

// 1. CheckPerformTransaction - TUZATILGAN
async function checkPerformTransaction(req, res, params, id) {
  try {
    const { account, amount } = params;

    console.log("CheckPerformTransaction called with:", { account, amount });

    if (!account || !account.order_id) {
      return sendPaymeError(res, PaymeError.InvalidAccount, message, id);
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
    const serviceData = uploadedFile || scannedFile;

    // Shu order uchun barcha tranzaksiyalarni olish
    const existingTransactions = await paidModel.find({
      "serviceData._id": account.order_id,
    });

    const orderState = getOrderState(serviceData, existingTransactions);

    console.log("Order state:", orderState, "for order:", account.order_id);

    // Order holatiga qarab javob berish
    switch (orderState) {
      case OrderState.WaitingPayment:
        return sendPaymeResponse(res, { allow: true }, id);

      case OrderState.Processing:
        return sendPaymeError(
          res,
          PaymeError.OrderProcessing,
          "Another transaction is processing for this order",
          id
        );

      case OrderState.Blocked:
        return sendPaymeError(
          res,
          PaymeError.OrderBlocked,
          "Order already paid or blocked",
          id
        );

      case OrderState.NotExists:
      default:
        return sendPaymeError(res, PaymeError.InvalidAccount, message, id);
    }
  } catch (error) {
    console.error("CheckPerformTransaction error:", error);
    sendPaymeError(res, PaymeError.InvalidAccount, message, id);
  }
}

// 2. CreateTransaction - MUAMMO HAL QILINDI
async function createTransaction(req, res, params, id) {
  try {
    const { id: transactionId, time, amount, account } = params;

    console.log("CreateTransaction called with:", { transactionId, account });

    // 1. Aynan shu tranzaksiya mavjudligini tekshirish
    let transaction = await paidModel.findOne({
      paymeTransactionId: transactionId,
    });

    if (transaction) {
      console.log("Transaction already exists:", transaction._id);
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

    // 2. Faylni tekshirish
    const uploadedFile = await File.findById(account.order_id);
    const scannedFile = await scanFileModel.findById(account.order_id);
    const serviceData = uploadedFile || scannedFile;

    // 3. Shu order uchun barcha tranzaksiyalarni olish
    const existingTransactions = await paidModel.find({
      "serviceData._id": account.order_id,
    });

    const orderState = getOrderState(serviceData, existingTransactions);

    console.log("Order state for CreateTransaction:", orderState);

    // Order holatiga qarab javob berish
    switch (orderState) {
      case OrderState.WaitingPayment:
        // Yangi tranzaksiya yaratish mumkin
        break;

      case OrderState.Processing:
        return sendPaymeError(
          res,
          PaymeError.OrderProcessing,
          "Another transaction is processing for this order",
          id
        );

      case OrderState.Blocked:
        return sendPaymeError(
          res,
          PaymeError.OrderBlocked,
          "Order already paid or blocked",
          id
        );

      case OrderState.NotExists:
      default:
        return sendPaymeError(res, PaymeError.InvalidAccount, message, id);
    }

    // 4. Yangi tranzaksiya yaratish
    transaction = await paidModel.create({
      paymeTransactionId: transactionId,
      serviceData: serviceData,
      amount: amount,
      status: "pending",
      paymeCreateTime: time,
      paymentMethod: "payme",
    });

    console.log("Created new transaction:", transaction._id.toString());

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
    sendPaymeError(res, PaymeError.InvalidAccount, message, id);
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

// 4. CheckTransaction - TUZATILGAN - DOIMO BIR XIL RESULT QAYTARISH
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

    // MUHIM: Har doim bir xil tartibda maydonlarni qaytarish
    const result = {
      transaction: transaction._id.toString(),
      create_time: transaction.paymeCreateTime,
      state: getTransactionState(transaction),
    };

    // Perform_time ni faqat mavjud bo'lsa qo'shish
    if (transaction.paymePerformTime) {
      result.perform_time = transaction.paymePerformTime;
    }

    // Cancel_time ni faqat mavjud bo'lsa qo'shish
    if (transaction.paymeCancelTime) {
      result.cancel_time = transaction.paymeCancelTime;
    }

    // Reason ni faqat mavjud bo'lsa qo'shish
    if (transaction.paymeReason) {
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

    // Allaqachon bekor qilingan tranzaksiya
    if (transaction.status === "cancelled") {
      return sendPaymeResponse(
        res,
        {
          transaction: transaction._id.toString(),
          cancel_time: transaction.paymeCancelTime || cancelTime,
          state: transaction.paymePerformTime
            ? TransactionState.PaidCanceled
            : TransactionState.PendingCanceled,
        },
        id
      );
    }

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
        state: getTransactionState(t),
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
