const mongoose = require("mongoose");

const ReminderSchema = new mongoose.Schema({
    subject: { type: String, required: true },
    description: { type: String, required: true },
    status: { type: String, default: "Pending" },
    createdAt: { type: Date, default: Date.now }  // ✅ Automatically stores creation date
});

const Reminder = mongoose.model("Reminder", ReminderSchema);
module.exports = Reminder;
