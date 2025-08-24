import express from "express";
import copyModel from "../model/copy.model.js";
import VendingApparat from "../model/vendingApparat.model.js";

const router = express.Router();

// 5 xonali noyob kod yaratish
const generateUniqueCode = async () => {
  let code;
  let exists = true;
  do {
    code = Math.floor(10000 + Math.random() * 90000).toString();
    exists = await copyModel.exists({ code });
  } while (exists);
  return code;
};

// Yangi copy yaratish (5 xonali kod generatsiya qilish)
router.post("/create", async (req, res) => {
  try {
    const { apparatId } = req.body;

    console.log("Copy create so'rovi:", { apparatId });

    if (!apparatId) {
      return res.status(400).json({
        status: "error",
        message: "apparatId kiritish majburiy",
      });
    }

    // Apparat mavjudligini tekshirish
    const apparat = await VendingApparat.findOne({ apparatId });
    if (!apparat) {
      return res.status(404).json({
        status: "error",
        message: "Bunday vending apparat topilmadi",
      });
    }

    // Noyob kod yaratish
    const code = await generateUniqueCode();

    // Copy yaratish
    const newCopy = await copyModel.create({
      code,
      apparatId,
      status: "pending",
    });

    console.log("Yangi copy yaratildi:", {
      id: newCopy._id,
      code: newCopy.code,
      apparatId: newCopy.apparatId,
    });

    res.json({
      status: "success",
      data: {
        id: newCopy._id,
        code: newCopy.code,
        apparatId: newCopy.apparatId,
        createdAt: newCopy.createdAt,
      },
    });
  } catch (error) {
    console.error("Copy yaratishda xatolik:", error);
    res.status(500).json({
      status: "error",
      message: error.message,
    });
  }
});

// Copy ni kod orqali olish
router.get("/get-by-code/:code", async (req, res) => {
  try {
    const { code } = req.params;

    console.log("Copy kod orqali qidirilmoqda:", code);

    if (!code) {
      return res.status(400).json({
        status: "error",
        message: "Kod kiritish majburiy",
      });
    }

    const copyData = await copyModel.findOne({ code });
    if (!copyData) {
      return res.status(404).json({
        status: "error",
        message: "Bunday kod topilmadi",
      });
    }

    console.log("Copy topildi:", {
      id: copyData._id,
      code: copyData.code,
      apparatId: copyData.apparatId,
      status: copyData.status,
    });

    res.json({
      status: "success",
      data: {
        id: copyData._id,
        code: copyData.code,
        apparatId: copyData.apparatId,
        status: copyData.status,
        createdAt: copyData.createdAt,
        updatedAt: copyData.updatedAt,
      },
    });
  } catch (error) {
    console.error("Copy ni kod orqali olishda xatolik:", error);
    res.status(500).json({
      status: "error",
      message: error.message,
    });
  }
});

// Barcha copy larni olish (debug uchun)
router.get("/all", async (req, res) => {
  try {
    const { apparatId, status } = req.query;

    const filter = {};
    if (apparatId) filter.apparatId = apparatId;
    if (status) filter.status = status;

    const copies = await copyModel.find(filter).sort({ createdAt: -1 });

    res.json({
      status: "success",
      count: copies.length,
      data: copies,
    });
  } catch (error) {
    console.error("Barcha copy larni olishda xatolik:", error);
    res.status(500).json({
      status: "error",
      message: error.message,
    });
  }
});

// Copy ni o'chirish (debug uchun)
router.delete("/:id", async (req, res) => {
  try {
    const { id } = req.params;

    const deletedCopy = await copyModel.findByIdAndDelete(id);
    if (!deletedCopy) {
      return res.status(404).json({
        status: "error",
        message: "Copy topilmadi",
      });
    }

    console.log("Copy o'chirildi:", {
      id: deletedCopy._id,
      code: deletedCopy.code,
    });

    res.json({
      status: "success",
      message: "Copy o'chirildi",
      data: deletedCopy,
    });
  } catch (error) {
    console.error("Copy ni o'chirishda xatolik:", error);
    res.status(500).json({
      status: "error",
      message: error.message,
    });
  }
});

export default router;
