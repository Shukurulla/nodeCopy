import express from "express";
import Admin from "../model/admin.model.js";
import VendingApparat from "../model/vendingApparat.model.js";
import jwt from "jsonwebtoken";
import { encrypt, decrypt } from "../utils/encryption.js";

const router = express.Router();

// ============ AUTH MIDDLEWARE ============

export const authMiddleware = async (req, res, next) => {
  try {
    const token = req.headers.authorization?.split(" ")[1];

    if (!token) {
      return res.status(401).json({
        muvaffaqiyat: false,
        xabar: "Avtorizatsiya zarur",
      });
    }

    const decoded = jwt.verify(
      token,
      process.env.JWT_SECRET || "flash_print_secret_key"
    );

    const admin = await Admin.findById(decoded.adminId);
    if (!admin || !admin.isActive) {
      return res.status(401).json({
        muvaffaqiyat: false,
        xabar: "Admin topilmadi yoki faol emas",
      });
    }

    req.admin = {
      id: admin._id,
      username: admin.username,
      role: admin.role,
      firstName: admin.firstName,
      lastName: admin.lastName,
    };

    next();
  } catch (error) {
    console.error("Auth middleware xatolik:", error);
    res.status(401).json({
      muvaffaqiyat: false,
      xabar: "Avtorizatsiya xatoligi",
    });
  }
};

// ============ LOGIN ============

router.post("/login", async (req, res) => {
  try {
    const { username, password } = req.body;

    const admin = await Admin.findOne({ username }).select("+password +salt");
    if (!admin) {
      return res.status(400).json({
        muvaffaqiyat: false,
        xabar: "Noto'g'ri foydalanuvchi nomi yoki parol",
      });
    }

    if (!admin.isActive) {
      return res.status(403).json({
        muvaffaqiyat: false,
        xabar: "Akkaunt faol emas",
      });
    }

    const isValidPassword = admin.validatePassword(password);
    if (!isValidPassword) {
      return res.status(400).json({
        muvaffaqiyat: false,
        xabar: "Noto'g'ri foydalanuvchi nomi yoki parol",
      });
    }

    const token = jwt.sign(
      { adminId: admin._id, username: admin.username, role: admin.role },
      process.env.JWT_SECRET || "flash_print_secret_key",
      { expiresIn: "1d" }
    );

    res.json({
      muvaffaqiyat: true,
      malumot: {
        token,
        admin: {
          id: admin._id,
          username: admin.username,
          role: admin.role,
          firstName: admin.firstName,
          lastName: admin.lastName,
        },
      },
    });
  } catch (error) {
    console.error("Login xatolik:", error);
    res.status(500).json({ muvaffaqiyat: false, xabar: error.message });
  }
});

// ============ SIGNUP (faqat birinchi marta, postman orqali) ============

router.post("/signup", async (req, res) => {
  try {
    const { username, password, firstName, lastName, phone } = req.body;

    const existingAdmin = await Admin.findOne({ username });
    if (existingAdmin) {
      return res.status(400).json({
        muvaffaqiyat: false,
        xabar: "Bu foydalanuvchi nomi allaqachon mavjud",
      });
    }

    const admin = new Admin({
      username,
      firstName: firstName || "Super",
      lastName: lastName || "Admin",
      phone: phone || "+998000000000",
      role: "superadmin",
    });
    admin.setPassword(password);
    await admin.save();

    res.status(201).json({
      muvaffaqiyat: true,
      malumot: {
        id: admin._id,
        username: admin.username,
        role: admin.role,
      },
    });
  } catch (error) {
    console.error("Signup xatolik:", error);
    res.status(500).json({ muvaffaqiyat: false, xabar: error.message });
  }
});

// ============ PROFIL (har qanday admin o'zini) ============

// O'z profilini olish (Click credentials bilan)
router.get("/profil", authMiddleware, async (req, res) => {
  try {
    const admin = await Admin.findById(req.admin.id).select("-__v");
    if (!admin) {
      return res.status(404).json({
        muvaffaqiyat: false,
        xabar: "Admin topilmadi",
      });
    }

    const result = admin.toObject();

    // Click credentials deshifrlash
    result.clickCredentialsDecrypted = {
      secretKey: decrypt(admin.clickCredentials?.secretKey) || "",
      serviceId: decrypt(admin.clickCredentials?.serviceId) || "",
      merchantId: decrypt(admin.clickCredentials?.merchantId) || "",
      merchantUserId: decrypt(admin.clickCredentials?.merchantUserId) || "",
    };

    // Shifrlangan versiyani olib tashlash
    delete result.clickCredentials;

    res.json({ muvaffaqiyat: true, malumot: result });
  } catch (error) {
    res.status(500).json({ muvaffaqiyat: false, xabar: error.message });
  }
});

// O'z Click credentials ni yangilash
router.put("/profil/click", authMiddleware, async (req, res) => {
  try {
    const admin = await Admin.findById(req.admin.id);
    if (!admin) {
      return res.status(404).json({
        muvaffaqiyat: false,
        xabar: "Admin topilmadi",
      });
    }

    const { clickSecretKey, clickServiceId, clickMerchantId, clickMerchantUserId } = req.body;

    if (!admin.clickCredentials) {
      admin.clickCredentials = {};
    }

    if (clickSecretKey !== undefined) {
      admin.clickCredentials.secretKey = encrypt(clickSecretKey);
    }
    if (clickServiceId !== undefined) {
      admin.clickCredentials.serviceId = encrypt(clickServiceId);
    }
    if (clickMerchantId !== undefined) {
      admin.clickCredentials.merchantId = encrypt(clickMerchantId);
    }
    if (clickMerchantUserId !== undefined) {
      admin.clickCredentials.merchantUserId = encrypt(clickMerchantUserId);
    }

    await admin.save();

    res.json({
      muvaffaqiyat: true,
      xabar: "Click ma'lumotlari yangilandi",
    });
  } catch (error) {
    res.status(500).json({ muvaffaqiyat: false, xabar: error.message });
  }
});

// ============ ADMIN CRUD (faqat superadmin) ============

// Barcha adminlar ro'yxati
router.get("/all", authMiddleware, async (req, res) => {
  try {
    if (req.admin.role !== "superadmin") {
      return res.status(403).json({
        muvaffaqiyat: false,
        xabar: "Faqat super admin uchun",
      });
    }

    const admins = await Admin.find().select("-__v").sort({ createdAt: -1 });

    // Har bir admin uchun apparatlar sonini hisoblash
    const adminsWithCount = await Promise.all(
      admins.map(async (admin) => {
        const apparatlarSoni = await VendingApparat.countDocuments({
          adminId: admin._id,
        });
        return {
          ...admin.toObject(),
          apparatlarSoni,
        };
      })
    );

    res.json({ muvaffaqiyat: true, malumot: adminsWithCount });
  } catch (error) {
    res.status(500).json({ muvaffaqiyat: false, xabar: error.message });
  }
});

// Admin tafsilotlari (Click credentials deshifrlangan)
router.get("/:id", authMiddleware, async (req, res) => {
  try {
    if (req.admin.role !== "superadmin") {
      return res.status(403).json({
        muvaffaqiyat: false,
        xabar: "Faqat super admin uchun",
      });
    }

    const admin = await Admin.findById(req.params.id).select("-__v");
    if (!admin) {
      return res
        .status(404)
        .json({ muvaffaqiyat: false, xabar: "Admin topilmadi" });
    }

    // Click credentials deshifrlash
    const adminObj = admin.toObject();
    if (adminObj.clickCredentials) {
      const creds = adminObj.clickCredentials;
      adminObj.clickCredentialsDecrypted = {
        secretKey: decrypt(creds.secretKey),
        serviceId: decrypt(creds.serviceId),
        merchantId: decrypt(creds.merchantId),
        merchantUserId: decrypt(creds.merchantUserId),
      };
    }

    // Biriktirilgan apparatlar
    const apparatlar = await VendingApparat.find({ adminId: admin._id });
    adminObj.apparatlar = apparatlar;

    res.json({ muvaffaqiyat: true, malumot: adminObj });
  } catch (error) {
    res.status(500).json({ muvaffaqiyat: false, xabar: error.message });
  }
});

// Yangi admin yaratish
router.post("/create", authMiddleware, async (req, res) => {
  try {
    if (req.admin.role !== "superadmin") {
      return res.status(403).json({
        muvaffaqiyat: false,
        xabar: "Faqat super admin uchun",
      });
    }

    const {
      username,
      password,
      firstName,
      lastName,
      phone,
      clickSecretKey,
      clickServiceId,
      clickMerchantId,
      clickMerchantUserId,
    } = req.body;

    // Validatsiya
    if (!username || !password || !firstName || !lastName || !phone) {
      return res.status(400).json({
        muvaffaqiyat: false,
        xabar: "Barcha maydonlar to'ldirilishi shart",
      });
    }

    const existingAdmin = await Admin.findOne({ username });
    if (existingAdmin) {
      return res.status(400).json({
        muvaffaqiyat: false,
        xabar: "Bu foydalanuvchi nomi allaqachon mavjud",
      });
    }

    const admin = new Admin({
      username,
      firstName,
      lastName,
      phone,
      role: "admin",
      clickCredentials: {
        secretKey: encrypt(clickSecretKey || ""),
        serviceId: encrypt(clickServiceId || ""),
        merchantId: encrypt(clickMerchantId || ""),
        merchantUserId: encrypt(clickMerchantUserId || ""),
      },
    });
    admin.setPassword(password);
    await admin.save();

    res.status(201).json({
      muvaffaqiyat: true,
      malumot: {
        id: admin._id,
        username: admin.username,
        firstName: admin.firstName,
        lastName: admin.lastName,
        phone: admin.phone,
        role: admin.role,
      },
    });
  } catch (error) {
    console.error("Admin yaratish xatolik:", error);
    res.status(500).json({ muvaffaqiyat: false, xabar: error.message });
  }
});

// Admin tahrirlash
router.put("/:id", authMiddleware, async (req, res) => {
  try {
    if (req.admin.role !== "superadmin") {
      return res.status(403).json({
        muvaffaqiyat: false,
        xabar: "Faqat super admin uchun",
      });
    }

    const admin = await Admin.findById(req.params.id).select("+password +salt");
    if (!admin) {
      return res
        .status(404)
        .json({ muvaffaqiyat: false, xabar: "Admin topilmadi" });
    }

    const {
      firstName,
      lastName,
      phone,
      password,
      isActive,
      clickSecretKey,
      clickServiceId,
      clickMerchantId,
      clickMerchantUserId,
    } = req.body;

    if (firstName !== undefined) admin.firstName = firstName;
    if (lastName !== undefined) admin.lastName = lastName;
    if (phone !== undefined) admin.phone = phone;
    if (isActive !== undefined) admin.isActive = isActive;
    if (password) admin.setPassword(password);

    // Click credentials yangilash (faqat yuborilgan bo'lsa)
    if (clickSecretKey !== undefined) {
      if (!admin.clickCredentials) admin.clickCredentials = {};
      admin.clickCredentials.secretKey = encrypt(clickSecretKey);
    }
    if (clickServiceId !== undefined) {
      if (!admin.clickCredentials) admin.clickCredentials = {};
      admin.clickCredentials.serviceId = encrypt(clickServiceId);
    }
    if (clickMerchantId !== undefined) {
      if (!admin.clickCredentials) admin.clickCredentials = {};
      admin.clickCredentials.merchantId = encrypt(clickMerchantId);
    }
    if (clickMerchantUserId !== undefined) {
      if (!admin.clickCredentials) admin.clickCredentials = {};
      admin.clickCredentials.merchantUserId = encrypt(clickMerchantUserId);
    }

    await admin.save();

    res.json({
      muvaffaqiyat: true,
      malumot: {
        id: admin._id,
        username: admin.username,
        firstName: admin.firstName,
        lastName: admin.lastName,
        phone: admin.phone,
        role: admin.role,
        isActive: admin.isActive,
      },
    });
  } catch (error) {
    res.status(500).json({ muvaffaqiyat: false, xabar: error.message });
  }
});

// Admin o'chirish
router.delete("/:id", authMiddleware, async (req, res) => {
  try {
    if (req.admin.role !== "superadmin") {
      return res.status(403).json({
        muvaffaqiyat: false,
        xabar: "Faqat super admin uchun",
      });
    }

    const admin = await Admin.findById(req.params.id);
    if (!admin) {
      return res
        .status(404)
        .json({ muvaffaqiyat: false, xabar: "Admin topilmadi" });
    }

    if (admin.role === "superadmin") {
      return res.status(400).json({
        muvaffaqiyat: false,
        xabar: "Super adminni o'chirib bo'lmaydi",
      });
    }

    // Apparatlarni ajratish (adminId ni null qilish)
    await VendingApparat.updateMany(
      { adminId: admin._id },
      { $set: { adminId: null } }
    );

    await Admin.findByIdAndDelete(req.params.id);

    res.json({ muvaffaqiyat: true, xabar: "Admin o'chirildi" });
  } catch (error) {
    res.status(500).json({ muvaffaqiyat: false, xabar: error.message });
  }
});

// ============ APPARAT TAYINLASH ============

// Apparatni adminga tayinlash
router.post("/assign-apparat", authMiddleware, async (req, res) => {
  try {
    if (req.admin.role !== "superadmin") {
      return res.status(403).json({
        muvaffaqiyat: false,
        xabar: "Faqat super admin uchun",
      });
    }

    const { adminId, apparatId } = req.body;

    const admin = await Admin.findById(adminId);
    if (!admin) {
      return res
        .status(404)
        .json({ muvaffaqiyat: false, xabar: "Admin topilmadi" });
    }

    const apparat = await VendingApparat.findOne({ apparatId });
    if (!apparat) {
      return res
        .status(404)
        .json({ muvaffaqiyat: false, xabar: "Apparat topilmadi" });
    }

    apparat.adminId = admin._id;
    await apparat.save();

    res.json({
      muvaffaqiyat: true,
      xabar: `${apparat.nomi} apparati ${admin.firstName} ${admin.lastName} ga tayinlandi`,
    });
  } catch (error) {
    res.status(500).json({ muvaffaqiyat: false, xabar: error.message });
  }
});

// Apparatni admindan ajratish
router.post("/unassign-apparat", authMiddleware, async (req, res) => {
  try {
    if (req.admin.role !== "superadmin") {
      return res.status(403).json({
        muvaffaqiyat: false,
        xabar: "Faqat super admin uchun",
      });
    }

    const { apparatId } = req.body;

    const apparat = await VendingApparat.findOne({ apparatId });
    if (!apparat) {
      return res
        .status(404)
        .json({ muvaffaqiyat: false, xabar: "Apparat topilmadi" });
    }

    apparat.adminId = null;
    await apparat.save();

    res.json({
      muvaffaqiyat: true,
      xabar: `${apparat.nomi} apparati ajratildi`,
    });
  } catch (error) {
    res.status(500).json({ muvaffaqiyat: false, xabar: error.message });
  }
});

export default router;
