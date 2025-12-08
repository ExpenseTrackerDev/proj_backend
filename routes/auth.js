const express = require('express');
const router = express.Router();
const User = require('../models/User');
const nodemailer = require('nodemailer');
const crypto = require('crypto');
//const { Resend } = require('resend');
//const resend = new Resend(process.env.RESEND_API_KEY);
// Nodemailer transporter
/*const transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST,    // smtp-relay.brevo.com
    port: process.env.SMTP_PORT,    // 587
    secure: false,                  // false for TLS
    auth: {
        user: process.env.SMTP_USER,   // Brevo SMTP login (e.g., 9d8e9d001@smtp-brevo.com)
        pass: process.env.SMTP_PASS    // your SMTP key from Brevo
    }
});*/

// Nodemailer transporter using SMTP (Mailgun)
/*const transporter = nodemailer.createTransport({
    service: 'gmail',
    host: process.env.SMTP_HOST,     // e.g., smtp.mailgun.org
    port: process.env.SMTP_PORT,     // 587 for TLS
    secure: false,                    // true for 465, false for 587
    auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS
    }
});
*/


// send email function
const fetch = (...args) => import('node-fetch').then(({default: fetch}) => fetch(...args));


async function sendEmail(to, subject, message) {
    try {
        const res = await fetch("https://api.brevo.com/v3/smtp/email", {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "api-key": process.env.BREVO_API_KEY
            },
            body: JSON.stringify({
                sender: { email: process.env.EMAIL_FROM },
                to: [{ email: to }],
                subject: subject,
                textContent: message
            })
        });

        if (!res.ok) {
            throw new Error(`Brevo API error: ${res.statusText}`);
        }

        console.log("Email sent successfully to", to);
    } catch (err) {
        console.error("Email send error:", err);
        throw err;
    }
}



const bcrypt = require('bcrypt');

// POST /register
router.post('/register', async (req, res) => {
    const { username, email, phone, password, confirmPassword } = req.body;

    if (!username || !email || !phone || !password || !confirmPassword) {
        return res.status(400).json({ message: 'All fields required' });
    }

    if (password !== confirmPassword) {
    return res.status(400).json({ message: 'Passwords do not match' });
    }

    try {
        
       const userByEmail = await User.findOne({ email });

        if (userByEmail) {
            if (!userByEmail.verified) {
                // Email exists but NOT verified → delete old account
                await User.deleteOne({ _id: userByEmail._id });
            } else {
                // Email exists AND verified → block registration
                return res.status(400).json({
                    message: "Email already in use. Please use another email."
                });
            }
        }
        const userByUsername = await User.findOne({ username });

        if (userByUsername) {
            return res.status(400).json({
                message: "Username already taken. Please choose a different username."
            });
        }

        // Hash password
        const saltRounds = 10;
        const hashedPassword = await bcrypt.hash(password, saltRounds);

        // Generate OTP
        const otp = crypto.randomInt(100000, 999999).toString();

        // Hash OTP
        const hashedOtp = await bcrypt.hash(otp, saltRounds);
        
        // Save user with hashed password and otp
        const newUser = new User({ username, email, phone, password: hashedPassword, otp:hashedOtp, verified: false });
        await newUser.save();

        // Send OTP email
       /* await transporter.sendMail({
            from: process.env.EMAIL_USER,
            to: email,
            subject: 'Your Verification OTP',
            text: `Your OTP code is ${otp}`
        });*/
        await sendEmail(
            email,
            "Your Verification OTP",
            `Your OTP code is ${otp}`
            );


        res.status(200).json({ message: 'OTP sent to email' });
    } catch (err) {
        console.error(err);
        res.status(500).json({ message: 'Server error' });
    }
});




module.exports = router;
// POST /verify-email
router.post('/verify-email', async (req, res) => {
    const { email, otp } = req.body;

    if (!email || !otp) return res.status(400).json({ message: 'Email and OTP required' });

    try {
       /* const user = await User.findOne({ email, otp });
        if (!user) return res.status(400).json({ message: 'Invalid OTP' });*/
        const user = await User.findOne({ email });
        if (!user) return res.status(400).json({ message: 'User not found' });

        const isMatch = await bcrypt.compare(otp, user.otp || '');
        if (!isMatch) return res.status(400).json({ message: 'Invalid OTP' });

        user.verified = true;
        user.otp = null; // clear OTP
        await user.save();

        res.status(200).json({ message: 'Email verified successfully' });
    } catch (err) {
        console.error(err);
        res.status(500).json({ message: 'Server error' });
    }
});

router.post('/resend-otp', async (req, res) => {
    const { email } = req.body;
    if (!email) return res.status(400).json({ message: 'Email required' });
    

    try {
        const user = await User.findOne({ email });
        if (!user) return res.status(400).json({ message: 'User not found' });

        const otp = crypto.randomInt(100000, 999999).toString();
        const hashedOtp = await bcrypt.hash(otp, 10);

        user.otp = hashedOtp;
        await user.save();

        /*await transporter.sendMail({
            from: process.env.EMAIL_USER,
            to: email,
            subject: 'Your New Verification OTP',
            text: `Your new OTP code is ${otp}`
        });*/
        await sendEmail(
            email,
            "Your New Verification OTP",
            `Your new OTP code is ${otp}`
            );

        res.status(200).json({ message: 'OTP resent successfully' });
    } catch (err) {
        console.error(err);
        res.status(500).json({ message: 'Server error' });
    }
});


// POST /reset-request
router.post('/reset-request', async (req, res) => {
    const { email, newPassword, confirmNewPassword } = req.body;
    if (!email || !newPassword || !confirmNewPassword) return res.status(400).json({ message: 'All fields required' });

    try {
        const user = await User.findOne({ email });
        if (!user) return res.status(400).json({ message: 'User not found' });

        // Generate OTP
        const otp = crypto.randomInt(100000, 999999).toString();
        const hashedOtp = await bcrypt.hash(otp, 10);
        const hashedNewPassword = await bcrypt.hash(newPassword, 10);

        user.otp = hashedOtp;
        user.tempPassword = hashedNewPassword; // store temporarily
        await user.save();

        /*await transporter.sendMail({
            from: process.env.EMAIL_USER,
            to: email,
            subject: 'Your Reset Password OTP',
            text: `Your OTP code is ${otp}`
        });*/
        await sendEmail(
            email,
            "Your Reset Password OTP",
            `Your OTP code is ${otp}`
            );
        

        res.status(200).json({ message: 'OTP sent to email' });
    } catch (err) {
        console.error(err);
        res.status(500).json({ message: 'Server error' });
    }
});

// POST /reset-verify
router.post('/reset-verify', async (req, res) => {
    const { email, otp } = req.body;
    if (!email || !otp) return res.status(400).json({ message: 'Email and OTP required' });

    try {
        const user = await User.findOne({ email });
        if (!user || !user.otp || !user.tempPassword) return res.status(400).json({ message: 'No pending password reset found' });

        const isMatch = await bcrypt.compare(otp, user.otp);
        if (!isMatch) return res.status(400).json({ message: 'Invalid OTP' });

        // Update password
        user.password = user.tempPassword;
        user.tempPassword = null;
        user.otp = null;
        await user.save();

        res.status(200).json({ message: 'Password reset successfully' });
    } catch (err) {
        console.error(err);
        res.status(500).json({ message: 'Server error' });
    }
});

// LOGIN
router.post("/login", async (req, res) => {
    const { identifier, password } = req.body; 
    // identifier = email OR username

    if (!identifier || !password) {
        return res.status(400).json({ message: "All fields required" });
    }

    try {
        let user;

        // Check if identifier is email or username
        if (identifier.includes("@")) {
            // Email (case-insensitive)
            user = await User.findOne({ email: { $regex: new RegExp("^" + identifier + "$", "i") } });
        } else {
            // Username (CASE SENSITIVE)
            user = await User.findOne({ username: identifier });
        }

        if (!user) {
            return res.status(400).json({ message: "User not found" });
        }

        if (!user.verified) {
            return res.status(400).json({ message: "Email not verified" });
        }

        // Compare password
        const isMatch = await bcrypt.compare(password, user.password);
        if (!isMatch) {
            return res.status(400).json({ message: "Incorrect password" });
        }

        return res.status(200).json({
            message: "Login successful",
            userId: user._id, 
            username: user.username,
            email: user.email
        });

    } catch (err) {
        console.error(err);
        return res.status(500).json({ message: "Server error" });
    }
});

// GET /profile/:userId → fetch current profile
router.get('/profile/:userId', async (req, res) => {
    const { userId } = req.params;

    try {
        const user = await User.findById(userId).select('username email phone');
        if (!user) return res.status(404).json({ message: 'User not found' });

        res.status(200).json({
            username: user.username,
            email: user.email,
            phone: user.phone
        });
    } catch (err) {
        console.error(err);
        res.status(500).json({ message: 'Server error' });
    }
});

// PUT /profile/:userId → update profile (partial update allowed)
router.put('/profile/:userId', async (req, res) => {
    const { userId } = req.params;
    const { username, email, phone } = req.body;

    try {
        const user = await User.findById(userId);
        if (!user) return res.status(404).json({ message: 'User not found' });

        // Update only provided fields
        if (username) {
            const usernameExists = await User.findOne({ username, _id: { $ne: userId } });
            if (usernameExists) return res.status(400).json({ message: 'Username already taken' });
            user.username = username;
        }

        if (email) {
            const emailExists = await User.findOne({ email, _id: { $ne: userId } });
            if (emailExists) return res.status(400).json({ message: 'Email already in use' });
            user.email = email;
        }

        if (phone) {
            user.phone = phone;
        }

        await user.save();

        res.status(200).json({ message: 'Profile updated successfully' });

    } catch (err) {
        console.error(err);
        res.status(500).json({ message: 'Server error' });
    }
});