 // seedAdmin.js
const User = require("./models/User");
const bcrypt = require("bcrypt");

async function seedAdmin() {
  const exists = await User.findOne({ email: "admin@example.com" });

  if (!exists) {
    const hashed = await bcrypt.hash("admin123", 10);

    await User.create({
      name: "Admin",
      email: "admin@example.com",
      password: hashed,
      role: "admin",
    });

    console.log("Admin created");
  }
}

module.exports = seedAdmin;