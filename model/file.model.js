// model/file.model.js o'zgartirilgan versiyasi
import mongoose from "mongoose";

const fileSchema = new mongoose.Schema({
  fileId: String,
  fileName: String,
  fileType: String,
  uniqueCode: String,
  uploadedAt: { type: Date, default: Date.now },
  apparatId: {
    // Yangi maydon qo'shildi
    type: String,
    required: true,
    ref: "VendingApparat",
  },
  user: {
    username: String,
    firstName: String,
    lastName: String,
    profilePic: String,
  },
  fileUrl: {
    type: String,
    required: true,
  },
});

const File = mongoose.model("File", fileSchema);

export default File;
