import mongoose from "mongoose";
import crypto from "crypto";

// Shifrlangan credential uchun sub-schema
const encryptedFieldSchema = new mongoose.Schema(
  {
    iv: { type: String },
    encryptedData: { type: String },
  },
  { _id: false }
);

const adminSchema = new mongoose.Schema(
  {
    username: {
      type: String,
      required: true,
      unique: true,
    },
    password: {
      type: String,
      required: true,
      select: false,
    },
    salt: {
      type: String,
      select: false,
    },
    role: {
      type: String,
      enum: ["superadmin", "admin"],
      default: "admin",
    },
    firstName: {
      type: String,
      required: true,
    },
    lastName: {
      type: String,
      required: true,
    },
    phone: {
      type: String,
      required: true,
    },
    clickCredentials: {
      secretKey: encryptedFieldSchema,
      serviceId: encryptedFieldSchema,
      merchantId: encryptedFieldSchema,
      merchantUserId: encryptedFieldSchema,
    },
    isActive: {
      type: Boolean,
      default: true,
    },
  },
  { timestamps: true }
);

// Password hash qilish metodlari
adminSchema.methods.setPassword = function (password) {
  this.salt = crypto.randomBytes(16).toString("hex");
  this.password = crypto
    .pbkdf2Sync(password, this.salt, 1000, 64, "sha512")
    .toString("hex");
};

adminSchema.methods.validatePassword = function (password) {
  const hash = crypto
    .pbkdf2Sync(password, this.salt, 1000, 64, "sha512")
    .toString("hex");
  return this.password === hash;
};

const Admin = mongoose.model("Admin", adminSchema);

export default Admin;
