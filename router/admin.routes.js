// router/admin.routes.js (yangi fayl)
import express from "express";
import Admin from "../model/admin.model.js";
import jwt from "jsonwebtoken";

const router = express.Router();

// Admin tizimga kirish
router.post("/login", async (req, res) => {
  try {
    const { username, password } = req.body;

    // Admin mavjudligini tekshirish
    const admin = await Admin.findOne({ username }).select("+password +salt");
    if (!admin) {
      return res.status(400).json({
        muvaffaqiyat: false,
        xabar: "Noto'g'ri foydalanuvchi nomi yoki parol",
      });
    }

    // Parolni tekshirish
    const isValidPassword = admin.validatePassword(password);
    if (!isValidPassword) {
      return res.status(400).json({
        muvaffaqiyat: false,
        xabar: "Noto'g'ri foydalanuvchi nomi yoki parol",
      });
    }

    // JWT token yaratish
    const token = jwt.sign(
      { adminId: admin._id, username: admin.username },
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
        },
      },
    });
  } catch (error) {
    console.error("Login xatolik:", error);
    res.status(500).json({ muvaffaqiyat: false, xabar: error.message });
  }
});

// Yangi admin yaratish (faqat postmanda ishlatiladi)
router.post("/signup", async (req, res) => {
  try {
    const { username, password } = req.body;

    // Username mavjudligini tekshirish
    const existingAdmin = await Admin.findOne({ username });
    if (existingAdmin) {
      return res.status(400).json({
        muvaffaqiyat: false,
        xabar: "Bu foydalanuvchi nomi allaqachon mavjud",
      });
    }

    // Yangi admin yaratish
    const admin = new Admin({ username });
    admin.setPassword(password);
    await admin.save();

    res.status(201).json({
      muvaffaqiyat: true,
      malumot: {
        id: admin._id,
        username: admin.username,
      },
    });
  } catch (error) {
    console.error("Signup xatolik:", error);
    res.status(500).json({ muvaffaqiyat: false, xabar: error.message });
  }
});

// Middleware funksiyasi - JWT token tekshirish
export const authMiddleware = async (req, res, next) => {
  try {
    const token = req.headers.authorization?.split(" ")[1];

    if (!token) {
      return res.status(401).json({
        muvaffaqiyat: false,
        xabar: "Avtorizatsiya zarur",
      });
    }

    // Token tekshirish
    const decoded = jwt.verify(
      token,
      process.env.JWT_SECRET || "flash_print_secret_key"
    );

    // Admin mavjudligini tekshirish
    const admin = await Admin.findById(decoded.adminId);
    if (!admin) {
      return res.status(401).json({
        muvaffaqiyat: false,
        xabar: "Admin topilmadi",
      });
    }

    // Admin ma'lumotlarini requst ga saqlash
    req.admin = {
      id: admin._id,
      username: admin.username,
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

export default router;
