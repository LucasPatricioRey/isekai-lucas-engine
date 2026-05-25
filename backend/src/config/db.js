const mongoose = require("mongoose");

async function connectDB() {
  const mongoUri = process.env.MONGODB_URI;

  if (!mongoUri) {
    console.warn("MONGODB_URI no configurado. Servidor iniciado sin MongoDB.");
    return;
  }

  try {
    await mongoose.connect(mongoUri);
    console.log("MongoDB conectado correctamente");
  } catch (error) {
    console.error("Error conectando a MongoDB:", error.message);
    process.exit(1);
  }
}

module.exports = connectDB;