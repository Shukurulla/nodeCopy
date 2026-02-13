import express from "express";
import Statistika from "../model/statistika.model.js";
import VendingApparat from "../model/vendingApparat.model.js";
import { authMiddleware } from "./admin.routes.js";

const router = express.Router();

// Admin uchun ruxsat etilgan apparatIdlarni olish
async function getAdminApparatIds(admin) {
  if (admin.role === "superadmin") return null; // null = hamma
  const apparatlar = await VendingApparat.find(
    { adminId: admin.id },
    { apparatId: 1 }
  );
  return apparatlar.map((a) => a.apparatId);
}

// Umumiy statistikani olish
router.get("/", authMiddleware, async (req, res) => {
  try {
    const { davr, apparatId } = req.query;

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
    } else if (
      davr === "custom" &&
      req.query.boshlanishSana &&
      req.query.tugashSana
    ) {
      const boshlanish = new Date(req.query.boshlanishSana);
      boshlanish.setHours(0, 0, 0, 0);
      const tugash = new Date(req.query.tugashSana);
      tugash.setHours(23, 59, 59, 999);
      sanaFilter.sana = { $gte: boshlanish, $lte: tugash };
    }

    const filter = { ...sanaFilter };

    if (apparatId && apparatId !== "all") {
      filter.apparatId = apparatId;
    }

    // Role-based filter
    const ruxsatApparatlar = await getAdminApparatIds(req.admin);
    if (ruxsatApparatlar !== null) {
      if (filter.apparatId) {
        // Agar tanlangan apparat admin niki emasligini tekshirish
        if (!ruxsatApparatlar.includes(filter.apparatId)) {
          return res.json({ muvaffaqiyat: true, malumot: [] });
        }
      } else {
        filter.apparatId = { $in: ruxsatApparatlar };
      }
    }

    const statistika = await Statistika.find(filter).sort({ sana: 1 });
    res.json({ muvaffaqiyat: true, malumot: statistika });
  } catch (error) {
    res.status(500).json({ muvaffaqiyat: false, xabar: error.message });
  }
});

// Statistikani davr bo'yicha guruhlash
router.get("/guruh", authMiddleware, async (req, res) => {
  try {
    const { davr, apparatId } = req.query;

    const match = {};

    if (apparatId && apparatId !== "all") {
      match.apparatId = apparatId;
    }

    const bugun = new Date();

    if (davr === "kun") {
      bugun.setHours(0, 0, 0, 0);
      match.sana = { $gte: bugun };
    } else if (davr === "hafta") {
      const haftaBoshi = new Date(bugun);
      haftaBoshi.setDate(bugun.getDate() - bugun.getDay());
      haftaBoshi.setHours(0, 0, 0, 0);
      match.sana = { $gte: haftaBoshi };
    } else if (davr === "oy") {
      const oyBoshi = new Date(bugun.getFullYear(), bugun.getMonth(), 1);
      match.sana = { $gte: oyBoshi };
    } else if (davr === "yil") {
      const yilBoshi = new Date(bugun.getFullYear(), 0, 1);
      match.sana = { $gte: yilBoshi };
    } else if (
      davr === "custom" &&
      req.query.boshlanishSana &&
      req.query.tugashSana
    ) {
      const boshlanish = new Date(req.query.boshlanishSana);
      boshlanish.setHours(0, 0, 0, 0);
      const tugash = new Date(req.query.tugashSana);
      tugash.setHours(23, 59, 59, 999);
      match.sana = { $gte: boshlanish, $lte: tugash };
    }

    // Role-based filter
    const ruxsatApparatlar = await getAdminApparatIds(req.admin);
    if (ruxsatApparatlar !== null) {
      if (match.apparatId) {
        if (!ruxsatApparatlar.includes(match.apparatId)) {
          return res.json({ muvaffaqiyat: true, malumot: [] });
        }
      } else {
        match.apparatId = { $in: ruxsatApparatlar };
      }
    }

    let groupFormat;
    if (davr === "kun") {
      groupFormat = { $dateToString: { format: "%Y-%m-%d", date: "$sana" } };
    } else if (davr === "oy") {
      groupFormat = { $dateToString: { format: "%Y-%m", date: "$sana" } };
    } else if (davr === "yil") {
      groupFormat = { $dateToString: { format: "%Y", date: "$sana" } };
    } else {
      groupFormat = { $dateToString: { format: "%Y-%m-%d", date: "$sana" } };
    }

    const guruhlanganStatistika = await Statistika.aggregate([
      { $match: match },
      {
        $group: {
          _id: groupFormat,
          foydalanishSoni: { $sum: "$foydalanishSoni" },
          daromad: { $sum: "$daromad" },
          ishlatilganQogoz: { $sum: "$ishlatilganQogoz" },
        },
      },
      { $sort: { _id: 1 } },
    ]);

    res.json({ muvaffaqiyat: true, malumot: guruhlanganStatistika });
  } catch (error) {
    console.error("Guruhlangan statistikani olishda xatolik:", error);
    res.status(500).json({ muvaffaqiyat: false, xabar: error.message });
  }
});

// Apparatlar bo'yicha statistikani olish
router.get("/apparatlar", authMiddleware, async (req, res) => {
  try {
    const { davr } = req.query;

    const match = {};

    const bugun = new Date();

    if (davr === "kun") {
      bugun.setHours(0, 0, 0, 0);
      match.sana = { $gte: bugun };
    } else if (davr === "hafta") {
      const haftaBoshi = new Date(bugun);
      haftaBoshi.setDate(bugun.getDate() - bugun.getDay());
      haftaBoshi.setHours(0, 0, 0, 0);
      match.sana = { $gte: haftaBoshi };
    } else if (davr === "oy") {
      const oyBoshi = new Date(bugun.getFullYear(), bugun.getMonth(), 1);
      match.sana = { $gte: oyBoshi };
    } else if (davr === "yil") {
      const yilBoshi = new Date(bugun.getFullYear(), 0, 1);
      match.sana = { $gte: yilBoshi };
    } else if (
      davr === "custom" &&
      req.query.boshlanishSana &&
      req.query.tugashSana
    ) {
      const boshlanish = new Date(req.query.boshlanishSana);
      boshlanish.setHours(0, 0, 0, 0);
      const tugash = new Date(req.query.tugashSana);
      tugash.setHours(23, 59, 59, 999);
      match.sana = { $gte: boshlanish, $lte: tugash };
    }

    // Role-based filter
    const ruxsatApparatlar = await getAdminApparatIds(req.admin);
    if (ruxsatApparatlar !== null) {
      match.apparatId = { $in: ruxsatApparatlar };
    }

    const apparatlarStatistikasi = await Statistika.aggregate([
      { $match: match },
      {
        $group: {
          _id: "$apparatId",
          foydalanishSoni: { $sum: "$foydalanishSoni" },
          daromad: { $sum: "$daromad" },
          ishlatilganQogoz: { $sum: "$ishlatilganQogoz" },
        },
      },
      { $sort: { daromad: -1 } },
    ]);

    res.json({ muvaffaqiyat: true, malumot: apparatlarStatistikasi });
  } catch (error) {
    console.error("Apparatlar statistikasini olishda xatolik:", error);
    res.status(500).json({ muvaffaqiyat: false, xabar: error.message });
  }
});

// Kunlik statistikani olish (so'nggi 30 kun)
router.get("/kunlik", authMiddleware, async (req, res) => {
  try {
    const { apparatId } = req.query;

    const bugun = new Date();
    const ottizKunOldin = new Date();
    ottizKunOldin.setDate(bugun.getDate() - 30);
    ottizKunOldin.setHours(0, 0, 0, 0);

    const match = {
      sana: { $gte: ottizKunOldin },
    };

    if (apparatId && apparatId !== "all") {
      match.apparatId = apparatId;
    }

    // Role-based filter
    const ruxsatApparatlar = await getAdminApparatIds(req.admin);
    if (ruxsatApparatlar !== null) {
      if (match.apparatId) {
        if (!ruxsatApparatlar.includes(match.apparatId)) {
          return res.json({ muvaffaqiyat: true, malumot: [] });
        }
      } else {
        match.apparatId = { $in: ruxsatApparatlar };
      }
    }

    const kunlikStatistika = await Statistika.aggregate([
      { $match: match },
      {
        $group: {
          _id: { $dateToString: { format: "%Y-%m-%d", date: "$sana" } },
          foydalanishSoni: { $sum: "$foydalanishSoni" },
          daromad: { $sum: "$daromad" },
          ishlatilganQogoz: { $sum: "$ishlatilganQogoz" },
        },
      },
      { $sort: { _id: 1 } },
    ]);

    res.json({ muvaffaqiyat: true, malumot: kunlikStatistika });
  } catch (error) {
    console.error("Kunlik statistikani olishda xatolik:", error);
    res.status(500).json({ muvaffaqiyat: false, xabar: error.message });
  }
});

export default router;
