import VendingApparat from "../model/vendingApparat.model.js";

/**
 * Faqat superadmin uchun middleware
 */
export const requireSuperAdmin = (req, res, next) => {
  if (!req.admin || req.admin.role !== "superadmin") {
    return res.status(403).json({
      muvaffaqiyat: false,
      xabar: "Bu amal faqat super admin uchun ruxsat etilgan",
    });
  }
  next();
};

/**
 * Apparat egasi yoki superadmin uchun middleware
 * @param {string} paramName - req.params dan apparatId olish uchun param nomi (default: "id")
 */
export const requireApparatOwner = (paramName = "id") => {
  return async (req, res, next) => {
    try {
      // Super admin har doim ruxsat oladi
      if (req.admin.role === "superadmin") {
        return next();
      }

      const apparatId = req.params[paramName];
      const apparat = await VendingApparat.findOne({ apparatId });

      if (!apparat) {
        return res.status(404).json({
          muvaffaqiyat: false,
          xabar: "Apparat topilmadi",
        });
      }

      // Apparat adminId tekshirish
      if (
        !apparat.adminId ||
        apparat.adminId.toString() !== req.admin.id.toString()
      ) {
        return res.status(403).json({
          muvaffaqiyat: false,
          xabar: "Siz bu apparatni boshqarish huquqiga ega emassiz",
        });
      }

      req.apparat = apparat;
      next();
    } catch (error) {
      console.error("ApparatOwner middleware xatolik:", error);
      res.status(500).json({ muvaffaqiyat: false, xabar: error.message });
    }
  };
};
