const mongoose = require("mongoose");
const bcrypt = require("bcryptjs");
const User = require("./User");

mongoose.connect("mongodb://127.0.0.1:27017/student_reminders", {
    useNewUrlParser: true,
    useUnifiedTopology: true
}).then(() => console.log("✅ MongoDB Connected"))
  .catch(err => console.error("❌ MongoDB Connection Error:", err));

async function createUsers() {
    try {
        const hashedAdminPassword = await bcrypt.hash("admin123", 10);
        const hashedStudentPassword = await bcrypt.hash("student123", 10);
        const hashedThandoPassword = await bcrypt.hash("student123", 10);
        const hashedBusekaPassword = await bcrypt.hash("student123", 10);

        await User.create([
            { username: "admin", password: hashedAdminPassword, role: "admin" },
            { username: "student", password: hashedStudentPassword, role: "student" },
            { username: "thando", password: hashedThandoPassword, role: "student" },
            { username: "buseka", password: hashedBusekaPassword, role: "student" }
        ]);

        console.log("✅ Admin and Student Created Successfully!");
        mongoose.connection.close();
    } catch (error) {
        console.error("❌ Error Creating Users:", error);
        mongoose.connection.close();
    }
}

createUsers();
