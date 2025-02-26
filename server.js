require("dotenv").config();
const express = require("express");
const mongoose = require("mongoose");
const bcrypt = require("bcryptjs");
const passport = require("passport");
const session = require("express-session");
const flash = require("connect-flash");
const LocalStrategy = require("passport-local").Strategy;
const User = require("./models/User");  // User Schema
const Reminder = require("./models/Reminder");  // Reminder Schema
const nodemailer = require("nodemailer");

const app = express();

// ✅ Connect to MongoDB
mongoose.connect("mongodb://127.0.0.1:27017/student_reminders", {
    useNewUrlParser: true,
    useUnifiedTopology: true
}).then(() => console.log("✅ MongoDB Connected"))
  .catch(err => console.error("❌ MongoDB Connection Error:", err));

const transporter = nodemailer.createTransport({
    service: "gmail",
    auth: {
        user: process.env.EMAIL_USER, // Your email
        pass: process.env.EMAIL_PASS  // Your email password or app password
    }
});

// ✅ Middleware
app.set("view engine", "ejs");
app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(session({
    secret: "your-secret-key",
    resave: false,
    saveUninitialized: true
}));
app.use(flash());
app.use(passport.initialize());
app.use(passport.session());

// ✅ Passport Authentication
passport.use(new LocalStrategy(async (username, password, done) => {
    try {
        const user = await User.findOne({ username });
        if (!user) return done(null, false, { message: "User not found" });

        const isMatch = await bcrypt.compare(password, user.password);
        if (!isMatch) return done(null, false, { message: "Incorrect password" });

        return done(null, user);
    } catch (error) {
        return done(error);
    }
}));

passport.serializeUser((user, done) => done(null, user.id));
passport.deserializeUser(async (id, done) => {
    const user = await User.findById(id);
    done(null, user);
});

// ✅ Ensure Authentication Middleware (FIXED)
function ensureAuthenticated(req, res, next) {
    if (req.isAuthenticated()) return next();
    req.flash("error", "Please log in first.");
    res.redirect("/login");
}

// ✅ Global Middleware for Flash Messages
app.use((req, res, next) => {
    res.locals.messages = req.flash();
    res.locals.user = req.user || null;
    next();
});

// ✅ Home Route - Redirect to Dashboard if Authenticated
app.get("/", ensureAuthenticated, async (req, res) => {
    try {
        let reminders = await Reminder.find();

        // Calculate days since creation
        reminders = reminders.map(reminder => {
            const createdAt = new Date(reminder.createdAt); // Ensure it's a Date object
            const today = new Date();
        
            if (isNaN(createdAt)) {
                console.error("Invalid createdAt date for reminder:", reminder);
                return { ...reminder.toObject(), daysAgo: "Unknown" };
            }
        
            const diffTime = today - createdAt;
            const daysAgo = Math.floor(diffTime / (1000 * 60 * 60 * 24)); // Convert ms to days
        
            return { ...reminder.toObject(), daysAgo };
        });

        res.render("admin_dashboard", { reminders });
    } catch (error) {
        console.error("Error fetching reminders:", error);
        res.redirect("/login");
    }
});

// ✅ Register Route
app.get("/register", (req, res) => {
    res.render("register", { messages: req.flash() });
});

app.post("/register", async (req, res) => {
    const { username, password } = req.body;
    try {
        const existingUser = await User.findOne({ username });
        if (existingUser) {
            req.flash("error", "Username already exists.");
            return res.redirect("/register");
        }

        const hashedPassword = await bcrypt.hash(password, 10);
        const newUser = new User({ username, password: hashedPassword, role: "student" });

        await newUser.save();
        req.flash("success", "Registration successful! Please log in.");
        res.redirect("/login");
    } catch (error) {
        console.error("Registration error:", error);
        req.flash("error", "Something went wrong.");
        res.redirect("/register");
    }
});

// ✅ Login Route
app.get("/login", (req, res) => {
    res.render("login", { messages: req.flash() });
});

app.post("/login", (req, res, next) => {
    passport.authenticate("local", (err, user, info) => {
        if (err) return next(err);
        if (!user) {
            req.flash("error", info ? info.message : "Invalid credentials");
            return res.redirect("/login");
        }
        req.logIn(user, (err) => {
            if (err) return next(err);
            return res.redirect("/");
        });
    })(req, res, next);
});

// ✅ Logout Route
app.get("/logout", (req, res) => {
    req.session.destroy((err) => {
        if (err) return next(err);
        res.redirect("/login");
    });
});

// ✅ Create Reminder Page Route
app.get("/create-reminder", ensureAuthenticated, (req, res) => {
    res.render("create_reminder");  // Renders the form to create a new reminder
});

// ✅ Create Reminder (POST Request)
app.post("/add", ensureAuthenticated, async (req, res) => {
    const { subject, description } = req.body;
    try {
        const newReminder = new Reminder({
            subject,
            description,
            status: "To Be Actioned",  // Default status
            lodgedBy: req.user.username
        });
        await newReminder.save();
        req.flash("success", "Reminder added successfully.");
        res.redirect("/");
    } catch (error) {
        req.flash("error", "Error creating reminder.");
        res.redirect("/");
    }
});

// ✅ Fetch a Single Reminder by ID
app.get("/reminder/:id", ensureAuthenticated, async (req, res) => {
    try {
        const reminder = await Reminder.findById(req.params.id);
        if (!reminder) {
            return res.status(404).json({ error: "Reminder not found" });
        }
        res.json(reminder);
    } catch (error) {
        console.error("Error fetching reminder:", error);
        res.status(500).json({ error: "Server error" });
    }
});

// ✅ Update Reminder Status (Admin Only)
app.post("/update/:id", ensureAuthenticated, async (req, res) => {
    if (req.user.role !== "admin") {
        req.flash("error", "Unauthorized.");
        return res.redirect("/");
    }

    try {
        await Reminder.findByIdAndUpdate(req.params.id, { status: req.body.status });
        req.flash("success", "Reminder updated.");
        res.redirect("/");
    } catch (error) {
        req.flash("error", "Failed to update reminder.");
        res.redirect("/");
    }
});

// ✅ Delete Reminder (Only Admin or Creator Can Delete)
app.post("/delete/:id", ensureAuthenticated, async (req, res) => {
    try {
        const reminder = await Reminder.findById(req.params.id);
        if (!reminder) {
            req.flash("error", "Reminder not found.");
            return res.redirect("/");
        }

        if (req.user.role === "admin" || reminder.lodgedBy === req.user.username) {
            await Reminder.findByIdAndDelete(req.params.id);
            req.flash("success", "Reminder deleted.");
        } else {
            req.flash("error", "Unauthorized to delete.");
        }

        res.redirect("/");
    } catch (error) {
        req.flash("error", "Failed to delete reminder.");
        res.redirect("/");
    }
});

// ✅ Send Nudge Email
app.post("/nudge/:id", ensureAuthenticated, async (req, res) => {
    try {
        const reminder = await Reminder.findById(req.params.id);
        if (!reminder) {
            req.flash("error", "Reminder not found.");
            return res.redirect("/");
        }

        const mailOptions = {
            from: process.env.EMAIL_USER,
            to: "thandomatomela00@gmail.com",
            subject: `Nudge: Reminder - ${reminder.subject}`,
            text: `Hello,\n\nA reminder has been nudged:\n\nSubject: ${reminder.subject}\nDescription: ${reminder.description}\n\nBest regards,\nStudent Reminder System`
        };

        await transporter.sendMail(mailOptions);

        req.flash("success", "Nudge email sent successfully.");
    } catch (error) {
        console.error("Error sending nudge email:", error);
        req.flash("error", "Failed to send nudge email.");
    }

    res.redirect("/");
});
// ✅ Add a Note to a Reminder
app.post("/add-note", ensureAuthenticated, async (req, res) => {
    const { reminderId, note } = req.body;

    if (!reminderId || !note) {
        return res.status(400).json({ error: "Reminder ID and note are required." });
    }

    try {
        const reminder = await Reminder.findById(reminderId);
        if (!reminder) {
            return res.status(404).json({ error: "Reminder not found." });
        }

        // Add note to the reminder
        reminder.notes = reminder.notes || []; // Ensure notes array exists
        reminder.notes.push({ text: note, addedBy: req.user.username, date: new Date() });

        await reminder.save();
        res.status(200).json({ success: "Note added successfully." });
    } catch (error) {
        console.error("Error adding note:", error);
        res.status(500).json({ error: "Failed to add note." });
    }
});

// ✅ Start Server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`🚀 Server running on port ${PORT}`));
