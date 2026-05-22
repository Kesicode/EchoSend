const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const { Client, LocalAuth, MessageMedia } = require('whatsapp-web.js');
const qrcode = require('qrcode');
const multer = require('multer');
const csv = require('csv-parser');
const fs = require('fs');
const path = require('path');
const nodemailer = require('nodemailer');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static('public'));
app.use(express.json());

const upload = multer({ dest: 'uploads/' });

let clientReady = false;

// Initialize WhatsApp Client
const client = new Client({
    authStrategy: new LocalAuth(),
    puppeteer: { 
        headless: true,
        args: [
            '--no-sandbox', 
            '--disable-setuid-sandbox',
            '--disable-dev-shm-usage',
            '--disable-accelerated-2d-canvas',
            '--no-first-run',
            '--no-zygote',
            '--disable-gpu'
        ] 
    }
});

io.on('connection', (socket) => {
    socket.emit('log', { type: 'info', msg: 'Initializing WhatsApp... This may take up to 30 seconds.' });

    socket.on('refresh_qr', async () => {
        io.emit('log', { type: 'info', msg: 'Restarting WhatsApp Client to generate new QR...' });
        try {
            await client.destroy();
        } catch (e) {
            console.error('Error destroying client:', e);
        }
        client.initialize();
    });
});

client.on('qr', (qr) => {
    console.log('QR RECEIVED');
    qrcode.toDataURL(qr, (err, url) => {
        io.emit('qr', url);
        io.emit('log', { type: 'info', msg: 'Please scan the QR code to log in to WhatsApp.' });
    });
});

client.on('ready', () => {
    console.log('Client is ready!');
    clientReady = true;
    io.emit('ready', true);
    io.emit('log', { type: 'success', msg: 'WhatsApp Client is ready!' });
});

client.on('authenticated', () => {
    console.log('AUTHENTICATED');
    io.emit('log', { type: 'success', msg: 'Authenticated successfully.' });
});

client.on('auth_failure', msg => {
    console.error('AUTHENTICATION FAILURE', msg);
    io.emit('log', { type: 'error', msg: `Authentication failure: ${msg}` });
});

client.on('disconnected', (reason) => {
    console.log('Client was logged out', reason);
    clientReady = false;
    io.emit('ready', false);
    io.emit('log', { type: 'error', msg: `Client was logged out: ${reason}` });
});

client.initialize();

// API Endpoint to upload CSV and start broadcast
app.post('/api/broadcast', upload.fields([{ name: 'csvFile', maxCount: 1 }, { name: 'attachment', maxCount: 1 }]), (req, res) => {
    const { template, mode, emailUser, emailPass, emailSubject } = req.body;

    if (mode === 'whatsapp' || mode === 'both') {
        if (!clientReady) {
            return res.status(400).json({ error: 'WhatsApp client is not ready.' });
        }
    }

    if (!req.files || !req.files['csvFile'] || !template) {
        return res.status(400).json({ error: 'Missing CSV file or message template.' });
    }

    const csvFilePath = req.files['csvFile'][0].path;
    let attachmentPath = null;
    let attachmentName = null;
    
    if (req.files['attachment'] && req.files['attachment'][0]) {
        attachmentPath = req.files['attachment'][0].path;
        attachmentName = req.files['attachment'][0].originalname;
    }

    let transporter = null;
    if (mode === 'email' || mode === 'both') {
        if (!emailUser || !emailPass || !emailSubject) {
            return res.status(400).json({ error: 'Missing Gmail credentials or Subject.' });
        }
        transporter = nodemailer.createTransport({
            service: 'gmail',
            auth: {
                user: emailUser,
                pass: emailPass
            }
        });
    }

    const results = [];
    fs.createReadStream(csvFilePath)
        .pipe(csv())
        .on('data', (data) => results.push(data))
        .on('end', async () => {
            fs.unlinkSync(csvFilePath); // Cleanup CSV

            res.json({ message: 'Broadcast started', total: results.length });
            io.emit('log', { type: 'info', msg: `Starting broadcast to ${results.length} contacts (Mode: ${mode.toUpperCase()})...` });
            if (attachmentPath) {
                io.emit('log', { type: 'info', msg: `Attachment included: ${attachmentName}` });
            }

            let successCount = 0;
            let failCount = 0;
            let failedContacts = [];

            for (let i = 0; i < results.length; i++) {
                const row = results[i];
                const keys = Object.keys(row);
                
                // Intelligently find columns
                const phoneKey = keys.find(k => k.toLowerCase().includes('phone') || k.toLowerCase().includes('search'));
                const phone = phoneKey ? row[phoneKey] : null;

                const nameKey = keys.find(k => k.toLowerCase().includes('name') || k.toLowerCase().includes('user') || k.toLowerCase().includes('first'));
                const user = nameKey ? row[nameKey] : 'User';

                const emailKey = keys.find(k => k.toLowerCase().includes('email') || k.toLowerCase().includes('mail'));
                const emailAddress = emailKey ? row[emailKey] : null;

                // Expand template variables manually
                let message = template;
                keys.forEach(key => {
                    const regex = new RegExp(`\\$${key}\\b`, 'g');
                    message = message.replace(regex, row[key]);
                });

                let rowSuccess = false;

                // 1. Send WhatsApp
                if (mode === 'whatsapp' || mode === 'both') {
                    if (!phone || phone.length < 5) {
                        io.emit('log', { type: 'warning', msg: `WA Skipped [${user}]: Invalid phone number.` });
                        if (!failedContacts.includes(user)) failedContacts.push(user);
                    } else {
                        let formattedPhone = phone.replace(/\D/g, '');
                        if (formattedPhone.length === 10) formattedPhone = '91' + formattedPhone;
                        const chatId = formattedPhone + '@c.us';

                        try {
                            const isRegistered = await client.isRegisteredUser(chatId);
                            if (isRegistered) {
                                // Send attachment with caption if exists, otherwise just send text
                                if (attachmentPath) {
                                    const mimetype = req.files['attachment'][0].mimetype;
                                    const b64data = fs.readFileSync(attachmentPath, {encoding: 'base64'});
                                    const media = new MessageMedia(mimetype, b64data, attachmentName);
                                    await client.sendMessage(chatId, media, { caption: message });
                                } else {
                                    await client.sendMessage(chatId, message);
                                }
                                
                                io.emit('log', { type: 'success', msg: `WA sent to ${user} (${formattedPhone})` });
                                rowSuccess = true;
                            } else {
                                io.emit('log', { type: 'warning', msg: `WA Skipped [${user}]: Not on WhatsApp.` });
                                if (!failedContacts.includes(user)) failedContacts.push(user);
                            }
                        } catch (err) {
                            io.emit('log', { type: 'error', msg: `WA Error for [${user}]: ${err.message}` });
                            if (!failedContacts.includes(user)) failedContacts.push(user);
                        }
                    }
                }

                // 2. Send Email
                if (mode === 'email' || mode === 'both') {
                    if (!emailAddress || !emailAddress.includes('@')) {
                        io.emit('log', { type: 'warning', msg: `Email Skipped [${user}]: Invalid email address.` });
                        if (!failedContacts.includes(user)) failedContacts.push(user);
                    } else {
                        try {
                            const mailOptions = {
                                from: emailUser,
                                to: emailAddress,
                                subject: emailSubject,
                                text: message,
                                attachments: attachmentPath ? [{ path: attachmentPath, filename: attachmentName }] : []
                            };
                            await transporter.sendMail(mailOptions);
                            io.emit('log', { type: 'success', msg: `Email sent to [${user}] (${emailAddress})` });
                            rowSuccess = true;
                        } catch (err) {
                            io.emit('log', { type: 'error', msg: `Email Error for [${user}]: ${err.message}` });
                            if (!failedContacts.includes(user)) failedContacts.push(user);
                        }
                    }
                }

                if (rowSuccess) successCount++;
                else failCount++;

                // Delay to prevent getting banned/rate-limited (3-5 seconds)
                const delay = Math.floor(Math.random() * 2000) + 3000;
                await new Promise(r => setTimeout(r, delay));

                // Emit progress
                io.emit('progress', { current: i + 1, total: results.length });
            }

            io.emit('log', { type: 'info', msg: `Broadcast finished. Success: ${successCount}, Failed: ${failCount}` });
            if (failedContacts.length > 0) {
                io.emit('log', { type: 'warning', msg: `Failed Contacts: ${failedContacts.join(', ')}` });
            }
            
            // Cleanup attachment if exists
            if (attachmentPath && fs.existsSync(attachmentPath)) {
                fs.unlinkSync(attachmentPath);
            }
        });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`Server is running on http://localhost:${PORT}`);
});
