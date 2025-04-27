import mongoose from "mongoose";

const fileSchema = new mongoose.Schema({
  fileId: String,
  fileName: String,
  fileType: String,
  uniqueCode: String,
  uploadedAt: { type: Date, default: Date.now },
  user: {
    username: String,
    firstName: String,
    lastName: String,
    profilePic: String,
  },
});

const File = mongoose.model("File", fileSchema);

export default File;
