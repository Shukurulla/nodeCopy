import express from "express";
import VendingApparat from "../model/vendingApparat.model.js";
import Statistika from "../model/statistika.model.js";
import { authMiddleware } from "./admin.routes.js";
import {
  requireSuperAdmin,
  requireApparatOwner,
} from "../middleware/roleMiddleware.js";

const router = express.Router();

// Barcha vending apparatlarni olish (role-based)
router.get("/", authMiddleware, async (req, res) => {
  try {
    let filter = {};

    // Oddiy admin faqat o'z apparatlarini ko'radi
    if (req.admin.role !== "superadmin") {
      filter.adminId = req.admin.id;
    }

    const apparatlar = await VendingApparat.find(filter).populate(
      "adminId",
      "firstName lastName username"
    );
    res.json({ muvaffaqiyat: true, malumot: apparatlar });
  } catch (error) {
    res.status(500).json({ muvaffaqiyat: false, xabar: error.message });
  }
});

// Bitta apparatni olish
router.get("/:id", authMiddleware, async (req, res) => {
  try {
    const apparat = await VendingApparat.findById(req.params.id).populate(
      "adminId",
      "firstName lastName username"
    );

    if (!apparat) {
      return res
        .status(404)
        .json({ muvaffaqiyat: false, xabar: "Apparat topilmadi" });
    }

    // Oddiy admin faqat o'z apparatini ko'ra oladi
    if (
      req.admin.role !== "superadmin" &&
      apparat.adminId &&
      apparat.adminId._id.toString() !== req.admin.id.toString()
    ) {
      return res.status(403).json({
        muvaffaqiyat: false,
        xabar: "Siz bu apparatni ko'rish huquqiga ega emassiz",
      });
    }

    res.json({ muvaffaqiyat: true, malumot: apparat });
  } catch (error) {
    res.status(500).json({ muvaffaqiyat: false, xabar: error.message });
  }
});

// Yangi vending apparat qo'shish (faqat superadmin)
router.post("/", authMiddleware, requireSuperAdmin, async (req, res) => {
  try {
    const apparat = new VendingApparat(req.body);
    await apparat.save();
    res.status(201).json({ muvaffaqiyat: true, malumot: apparat });
  } catch (error) {
    res.status(400).json({ muvaffaqiyat: false, xabar: error.message });
  }
});

// Qogoz sonini yangilash (faqat apparat egasi)
router.put("/:id/qogoz", authMiddleware, async (req, res) => {
  try {
    const { soni, add = false } = req.body;
    const apparat = await VendingApparat.findById(req.params.id);

    if (!apparat) {
      return res
        .status(404)
        .json({ muvaffaqiyat: false, xabar: "Apparat topilmadi" });
    }

    const isOwner =
      apparat.adminId &&
      apparat.adminId.toString() === req.admin.id.toString();
    const isSuperAdmin = req.admin.role === "superadmin";
    const isAssigned = !!apparat.adminId;

    // Biriktirilgan apparatni faqat egasi boshqaradi
    if (isSuperAdmin && isAssigned && !isOwner) {
      return res.status(403).json({
        muvaffaqiyat: false,
        xabar: "Bu apparat boshqa adminga biriktirilgan. Faqat biriktirilgan admin boshqara oladi.",
      });
    }

    // Oddiy admin faqat o'z apparatini
    if (!isSuperAdmin && !isOwner) {
      return res.status(403).json({
        muvaffaqiyat: false,
        xabar: "Siz bu apparatni boshqarish huquqiga ega emassiz",
      });
    }

    if (soni < 0) {
      return res.status(400).json({
        muvaffaqiyat: false,
        xabar: "Qog'oz soni 0 dan kam bo'lmasligi kerak",
      });
    }

    if (add) {
      if (apparat.joriyQogozSoni + soni > apparat.qogozSigimi) {
        return res.status(400).json({
          muvaffaqiyat: false,
          xabar: `Maksimal sig'im (${
            apparat.qogozSigimi
          }) dan oshib ketdi. Siz ${
            apparat.qogozSigimi - apparat.joriyQogozSoni
          } qog'ozdan ortiq qo'sha olmaysiz`,
        });
      }
      apparat.joriyQogozSoni += soni;
    } else {
      if (soni > apparat.qogozSigimi) {
        return res.status(400).json({
          muvaffaqiyat: false,
          xabar: `Maksimal sig'im (${apparat.qogozSigimi}) dan oshib ketdi`,
        });
      }
      apparat.joriyQogozSoni = soni;
    }

    apparat.oxirgiToladirishVaqti = new Date();
    await apparat.save();

    req.app.get("io").emit("qogozYangilandi", {
      apparatId: apparat.apparatId,
      joriyQogozSoni: apparat.joriyQogozSoni,
    });

    res.json({ muvaffaqiyat: true, malumot: apparat });
  } catch (error) {
    res.status(500).json({ muvaffaqiyat: false, xabar: error.message });
  }
});

// Apparat narxlarini olish
router.get("/:id/narxlar", authMiddleware, async (req, res) => {
  try {
    const apparat = await VendingApparat.findById(req.params.id);
    if (!apparat) {
      return res
        .status(404)
        .json({ muvaffaqiyat: false, xabar: "Apparat topilmadi" });
    }

    res.json({ muvaffaqiyat: true, malumot: apparat.narxlar });
  } catch (error) {
    res.status(500).json({ muvaffaqiyat: false, xabar: error.message });
  }
});

// Apparat narxlarini yangilash (faqat apparat egasi)
router.put("/:id/narxlar", authMiddleware, async (req, res) => {
  try {
    const apparat = await VendingApparat.findById(req.params.id);
    if (!apparat) {
      return res
        .status(404)
        .json({ muvaffaqiyat: false, xabar: "Apparat topilmadi" });
    }

    const isOwner =
      apparat.adminId &&
      apparat.adminId.toString() === req.admin.id.toString();
    const isSuperAdmin = req.admin.role === "superadmin";
    const isAssigned = !!apparat.adminId;

    // Biriktirilgan apparatni faqat egasi boshqaradi
    if (isSuperAdmin && isAssigned && !isOwner) {
      return res.status(403).json({
        muvaffaqiyat: false,
        xabar: "Bu apparat boshqa adminga biriktirilgan. Faqat biriktirilgan admin narxlarni o'zgartira oladi.",
      });
    }

    if (!isSuperAdmin && !isOwner) {
      return res.status(403).json({
        muvaffaqiyat: false,
        xabar: "Siz bu apparatni boshqarish huquqiga ega emassiz",
      });
    }

    const {
      printOneSide,
      printTwoSide,
      scanOneSide,
      scanTwoSide,
      copyOneSide,
      copyTwoSide,
    } = req.body;

    // Validatsiya
    const fields = {
      printOneSide,
      printTwoSide,
      scanOneSide,
      scanTwoSide,
      copyOneSide,
      copyTwoSide,
    };
    for (const [key, value] of Object.entries(fields)) {
      if (value !== undefined && value < 0) {
        return res.status(400).json({
          muvaffaqiyat: false,
          xabar: `${key} qiymati 0 dan kam bo'lmasligi kerak`,
        });
      }
    }

    if (!apparat.narxlar) apparat.narxlar = {};
    if (printOneSide !== undefined) apparat.narxlar.printOneSide = printOneSide;
    if (printTwoSide !== undefined) apparat.narxlar.printTwoSide = printTwoSide;
    if (scanOneSide !== undefined) apparat.narxlar.scanOneSide = scanOneSide;
    if (scanTwoSide !== undefined) apparat.narxlar.scanTwoSide = scanTwoSide;
    if (copyOneSide !== undefined) apparat.narxlar.copyOneSide = copyOneSide;
    if (copyTwoSide !== undefined) apparat.narxlar.copyTwoSide = copyTwoSide;

    await apparat.save();

    res.json({ muvaffaqiyat: true, malumot: apparat.narxlar });
  } catch (error) {
    res.status(500).json({ muvaffaqiyat: false, xabar: error.message });
  }
});

// Apparat statistikasini olish
router.get("/:id/statistika", authMiddleware, async (req, res) => {
  try {
    const { davr } = req.query;

    const sanaFilter = {};
    const bugun = new Date();

    if (davr === "kun") {
      bugun.setHours(0, 0, 0, 0);
      sanaFilter.sana = { $gte: bugun };
    } else if (davr === "hafta") {
      const haftaBoshi = new Date(bugun);
      haftaBoshi.setDate(bugun.getDate() - bugun.getDay());
      haftaBoshi.setHours(0, 0, 0, 0);
      sanaFilter.sana = { $gte: haftaBoshi };
    } else if (davr === "oy") {
      const oyBoshi = new Date(bugun.getFullYear(), bugun.getMonth(), 1);
      sanaFilter.sana = { $gte: oyBoshi };
    } else if (davr === "yil") {
      const yilBoshi = new Date(bugun.getFullYear(), 0, 1);
      sanaFilter.sana = { $gte: yilBoshi };
    }

    const statistika = await Statistika.find({
      apparatId: req.params.id,
      ...sanaFilter,
    }).sort({ sana: 1 });

    res.json({ muvaffaqiyat: true, malumot: statistika });
  } catch (error) {
    res.status(500).json({ muvaffaqiyat: false, xabar: error.message });
  }
});

// ATM da qancha qog'oz qolganini olish (apparatId bo'yicha - auth kerak emas, ATM uchun)
router.get("/:apparatId/qogoz-qoldiq", async (req, res) => {
  try {
    const apparat = await VendingApparat.findOne({
      apparatId: req.params.apparatId,
    });

    if (!apparat) {
      return res
        .status(404)
        .json({ muvaffaqiyat: false, xabar: "Apparat topilmadi" });
    }

    res.json({
      muvaffaqiyat: true,
      malumot: {
        apparatId: apparat.apparatId,
        nomi: apparat.nomi,
        joriyQogozSoni: apparat.joriyQogozSoni,
        qogozSigimi: apparat.qogozSigimi,
        kamQogozChegarasi: apparat.kamQogozChegarasi,
        qogozFoiz: Math.round(
          (apparat.joriyQogozSoni / apparat.qogozSigimi) * 100
        ),
        kamQoldimi: apparat.joriyQogozSoni <= apparat.kamQogozChegarasi,
      },
    });
  } catch (error) {
    res.status(500).json({ muvaffaqiyat: false, xabar: error.message });
  }
});

// ATM da narxlarni olish (apparatId bo'yicha - auth kerak emas, ATM uchun)
router.get("/:apparatId/narxlar-public", async (req, res) => {
  try {
    const apparat = await VendingApparat.findOne({
      apparatId: req.params.apparatId,
    });

    if (!apparat) {
      return res
        .status(404)
        .json({ muvaffaqiyat: false, xabar: "Apparat topilmadi" });
    }

    res.json({
      muvaffaqiyat: true,
      malumot: {
        apparatId: apparat.apparatId,
        nomi: apparat.nomi,
        narxlar: apparat.narxlar || {
          printOneSide: 500,
          printTwoSide: 800,
          scanOneSide: 500,
          scanTwoSide: 800,
          copyOneSide: 500,
          copyTwoSide: 800,
        },
      },
    });
  } catch (error) {
    res.status(500).json({ muvaffaqiyat: false, xabar: error.message });
  }
});

// Apparatni tahrirlash
// - Biriktirilgan admin: o'z apparatini to'liq tahrirlay oladi
// - Super admin: agar apparat biriktirilgan bo'lsa, faqat adminId ni o'zgartira oladi
// - Super admin: agar apparat biriktirilmagan bo'lsa, to'liq tahrirlay oladi
router.put("/:id", authMiddleware, async (req, res) => {
  try {
    const apparat = await VendingApparat.findById(req.params.id);
    if (!apparat) {
      return res
        .status(404)
        .json({ muvaffaqiyat: false, xabar: "Apparat topilmadi" });
    }

    const isOwner =
      apparat.adminId &&
      apparat.adminId.toString() === req.admin.id.toString();
    const isSuperAdmin = req.admin.role === "superadmin";
    const isAssigned = !!apparat.adminId;

    // Oddiy admin faqat o'z apparatini tahrirlaydi
    if (!isSuperAdmin && !isOwner) {
      return res.status(403).json({
        muvaffaqiyat: false,
        xabar: "Siz bu apparatni boshqarish huquqiga ega emassiz",
      });
    }

    // Super admin biriktirilgan apparatda faqat adminId ni o'zgartira oladi
    if (isSuperAdmin && isAssigned && !isOwner) {
      const { adminId } = req.body;
      if (adminId !== undefined) {
        apparat.adminId = adminId || null;
        await apparat.save();
      }
      return res.json({ muvaffaqiyat: true, malumot: apparat });
    }

    // Oddiy admin adminId ni o'zgartira olmaydi
    if (!isSuperAdmin) {
      delete req.body.adminId;
    }

    const yangilangan = await VendingApparat.findByIdAndUpdate(
      req.params.id,
      req.body,
      { new: true }
    );

    res.json({ muvaffaqiyat: true, malumot: yangilangan });
  } catch (error) {
    res.status(500).json({ muvaffaqiyat: false, xabar: error.message });
  }
});

// Apparatni o'chirish (faqat superadmin)
router.delete(
  "/:id",
  authMiddleware,
  requireSuperAdmin,
  async (req, res) => {
    try {
      const apparat = await VendingApparat.findByIdAndDelete(req.params.id);

      if (!apparat) {
        return res
          .status(404)
          .json({ muvaffaqiyat: false, xabar: "Apparat topilmadi" });
      }

      res.json({ muvaffaqiyat: true, malumot: apparat });
    } catch (error) {
      res.status(500).json({ muvaffaqiyat: false, xabar: error.message });
    }
  }
);

export default router;
