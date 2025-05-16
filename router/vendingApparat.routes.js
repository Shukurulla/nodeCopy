// router/vendingApparat.routes.js
import express from "express";
import VendingApparat from "../model/vendingApparat.model.js";
import Statistika from "../model/statistika.model.js";

const router = express.Router();

// Barcha vending apparatlarni olish
router.get("/", async (req, res) => {
  try {
    const apparatlar = await VendingApparat.find();
    res.json({ muvaffaqiyat: true, malumot: apparatlar });
  } catch (error) {
    res.status(500).json({ muvaffaqiyat: false, xabar: error.message });
  }
});
router.get("/:id", async (req, res) => {
  try {
    const apparatlar = await VendingApparat.findById(req.params.id);
    res.json({ muvaffaqiyat: true, malumot: apparatlar });
  } catch (error) {
    res.status(500).json({ muvaffaqiyat: false, xabar: error.message });
  }
});

// Yangi vending apparat qo'shish
router.post("/", async (req, res) => {
  try {
    const apparat = new VendingApparat(req.body);
    await apparat.save();
    res.status(201).json({ muvaffaqiyat: true, malumot: apparat });
  } catch (error) {
    res.status(400).json({ muvaffaqiyat: false, xabar: error.message });
  }
});

// Qogoz sonini yangilash
router.put("/:id/qogoz", async (req, res) => {
  try {
    const { soni } = req.body;
    const apparat = await VendingApparat.findById(req.params.id);

    if (!apparat) {
      return res
        .status(404)
        .json({ muvaffaqiyat: false, xabar: "Apparat topilmadi" });
    }

    apparat.joriyQogozSoni = soni;
    apparat.oxirgiToladirishVaqti = new Date();
    await apparat.save();

    // Real-time xabar yuborish
    req.app.get("io").emit("qogozYangilandi", {
      apparatId: apparat.apparatId,
      joriyQogozSoni: soni,
    });

    res.json({ muvaffaqiyat: true, malumot: apparat });
  } catch (error) {
    res.status(500).json({ muvaffaqiyat: false, xabar: error.message });
  }
});

// Apparat statistikasini olish
router.get("/:id/statistika", async (req, res) => {
  try {
    const { davr } = req.query; // kun, hafta, oy, yil

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

export default router;
