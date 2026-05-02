const User = require("./models/User");
const Role = require("./models/Role");

async function seedAdmin() {
  // ✅ Use upsert to avoid duplicate errors
  const adminRole = await Role.findOneAndUpdate(
    { code: "ADMIN" },   // 🔥 use unique field
    {
      name: "admin",
      code: "ADMIN"
    },
    { new: true, upsert: true }
  );

  console.log("✅ Admin role ready");

  // Check if user exists
  const exists = await User.findOne({ username: "admin" });

  if (!exists) {
    await User.create({
      name: "Admin",
      username: "admin",
      password: "admin123",   // auto-hashed
      roleId: adminRole._id,
    });

    console.log("✅ Admin user created");
  } else {
    console.log("ℹ️ Admin already exists");
  }
}

module.exports = seedAdmin;