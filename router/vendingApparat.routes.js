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
    const { soni, add = false } = req.body;
    const apparat = await VendingApparat.findById(req.params.id);

    if (!apparat) {
      return res
        .status(404)
        .json({ muvaffaqiyat: false, xabar: "Apparat topilmadi" });
    }

    // Qiymatlari tekshirish
    if (soni < 0) {
      return res
        .status(400)
        .json({
          muvaffaqiyat: false,
          xabar: "Qog'oz soni 0 dan kam bo'lmasligi kerak",
        });
    }

    // Agar add=true bo'lsa, qog'oz qo'shamiz, aks holda, qiymatni to'g'ridan-to'g'ri o'rnatamiz
    if (add) {
      // Maksimal sig'imdan oshib ketmasligini tekshirish
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
      // To'g'ridan-to'g'ri o'rnatish
      if (soni > apparat.qogozSigimi) {
        return res.status(400).json({
          muvaffaqiyat: false,
          xabar: `Maksimal sig'im (${apparat.qogozSigimi}) dan oshib ketdi. Siz ${apparat.qogozSigimi} qog'ozdan ortiq o'rnata olmaysiz`,
        });
      }
      apparat.joriyQogozSoni = soni;
    }

    apparat.oxirgiToladirishVaqti = new Date();
    await apparat.save();

    // Real-time xabar yuborish
    req.app.get("io").emit("qogozYangilandi", {
      apparatId: apparat.apparatId,
      joriyQogozSoni: apparat.joriyQogozSoni,
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

// ATM da qancha qog'oz qolganini olish (apparatId bo'yicha)
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

// Apparatni tahrirlash
router.put("/:id", async (req, res) => {
  try {
    const apparat = await VendingApparat.findByIdAndUpdate(
      req.params.id,
      req.body,
      { new: true }
    );

    if (!apparat) {
      return res
        .status(404)
        .json({ muvaffaqiyat: false, xabar: "Apparat topilmadi" });
    }

    res.json({ muvaffaqiyat: true, malumot: apparat });
  } catch (error) {
    res.status(500).json({ muvaffaqiyat: false, xabar: error.message });
  }
});

// Apparatni o'chirish
router.delete("/:id", async (req, res) => {
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
});

export default router;
