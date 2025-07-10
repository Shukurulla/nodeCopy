import express from "express";
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
  InvalidAmount: -31001,
  InvalidAccount: -31050,
  CantDoOperation: -31008,
  TransactionNotFound: -31003,
  InvalidAuthorization: -32504,
  AlreadyDone: -31060,
  Pending: -31050,
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

// 1. CheckPerformTransaction - YouTube dasturchisi mantiqiga asoslangan
async function checkPerformTransaction(req, res, params, id) {
  try {
    const { account, amount } = params;

    // Parametrlar tekshiruvi
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

    // Order mavjudligini tekshirish
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

    // YouTube kodida: Allaqachon to'langan yoki pending tranzaksiya tekshiruvi
    const existingTransaction = await paidModel.findOne({
      "serviceData._id": account.order_id,
      paymentMethod: "payme",
      $or: [{ status: "paid" }, { status: "pending" }],
    });

    if (existingTransaction) {
      if (existingTransaction.status === "paid") {
        return sendPaymeError(res, PaymeError.AlreadyDone, "Already paid", id);
      }
      if (existingTransaction.status === "pending") {
        return sendPaymeError(
          res,
          PaymeError.Pending,
          "Transaction pending",
          id
        );
      }
    }

    return sendPaymeResponse(res, { allow: true }, id);
  } catch (error) {
    console.error("CheckPerformTransaction error:", error);
    return sendPaymeError(res, PaymeError.InvalidAccount, "Check error", id);
  }
}

// 2. CheckTransaction - YouTube dasturchisining mantiqiga asoslangan
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

    // YouTube kodi: Har doim bir xil format qaytarish
    const result = {
      create_time: transaction.paymeCreateTime,
      perform_time: transaction.paymePerformTime || 0,
      cancel_time: transaction.paymeCancelTime || 0,
      transaction: transaction.paymeTransactionId,
      state: getTransactionState(transaction),
      reason: transaction.paymeReason || null,
    };

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

// 3. CreateTransaction - YouTube dasturchisining mantiqiga asoslangan
async function createTransaction(req, res, params, id) {
  try {
    const { id: transactionId, time, amount, account } = params;

    // Tranzaksiya mavjudligini tekshirish
    let transaction = await paidModel.findOne({
      paymeTransactionId: transactionId,
    });

    if (transaction) {
      if (transaction.status !== PaymeTransactionState.Pending) {
        return sendPaymeError(
          res,
          PaymeError.CantDoOperation,
          "Can't create",
          id
        );
      }

      // YouTube kodi: Vaqt tekshiruvi (12 daqiqa)
      const currentTime = Date.now();
      const expirationTime =
        (currentTime - transaction.paymeCreateTime) / 60000 < 12;

      if (!expirationTime) {
        await paidModel.findOneAndUpdate(
          { paymeTransactionId: transactionId },
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

      return sendPaymeResponse(
        res,
        {
          create_time: transaction.paymeCreateTime,
          transaction: transaction.paymeTransactionId,
          state: PaymeTransactionState.Pending,
        },
        id
      );
    }

    // Yangi tranzaksiya yaratishdan oldin tekshiruvlar
    await checkPerformTransaction(req, res, params, id);

    // Order ma'lumotlarini olish
    const uploadedFile = await File.findById(account.order_id);
    const scannedFile = await scanFileModel.findById(account.order_id);
    const serviceData = uploadedFile || scannedFile;

    if (!serviceData) {
      return sendPaymeError(
        res,
        PaymeError.InvalidAccount,
        "Service not found",
        id
      );
    }

    // YouTube kodi: Bir xil order uchun boshqa tranzaksiya tekshiruvi
    const existingOrderTransaction = await paidModel.findOne({
      "serviceData._id": account.order_id,
      paymentMethod: "payme",
    });

    if (existingOrderTransaction) {
      if (existingOrderTransaction.status === "paid") {
        return sendPaymeError(
          res,
          PaymeError.AlreadyDone,
          "Order already paid",
          id
        );
      }
      if (existingOrderTransaction.status === "pending") {
        return sendPaymeError(res, PaymeError.Pending, "Order pending", id);
      }
    }

    // Yangi tranzaksiya yaratish
    const newTransaction = await paidModel.create({
      paymeTransactionId: transactionId,
      serviceData: serviceData,
      amount: amount,
      status: "pending",
      paymeCreateTime: time,
      paymentMethod: "payme",
    });

    return sendPaymeResponse(
      res,
      {
        transaction: newTransaction.paymeTransactionId,
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
          transaction: transaction.paymeTransactionId,
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
        transaction: transaction.paymeTransactionId,
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
        transaction: transaction.paymeTransactionId,
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
      transaction: transaction.paymeTransactionId,
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
