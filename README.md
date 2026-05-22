# EchoSend 🚀

EchoSend is a powerful, automated omnichannel broadcasting application that allows you to seamlessly send personalized messages and attachments across both **WhatsApp** and **Gmail** simultaneously. 

Built with a sleek, responsive, frosted-glass desktop UI, EchoSend serves as a local marketing command center for individuals and businesses looking to automate their outreach.

## ✨ Key Features

- **Dual-Channel Automation:** Broadcast messages to WhatsApp contacts and Email addresses at the exact same time.
- **Smart CSV Parsing:** Upload an audience CSV file and EchoSend will automatically extract names, emails, and phone numbers.
- **Dynamic Personalization:** Use `$user` in your message templates to automatically personalize greetings for every single recipient.
- **Attachments Support:** Send images, PDFs, or documents seamlessly via both WhatsApp and Email.
- **Real-Time Terminal Logs:** Watch your broadcast execute live with a built-in developer console providing granular success, warning, and error logs.
- **Resilient Infrastructure:** Includes a 1-click QR code refresher and intelligent error handling that skips invalid numbers without crashing the broadcast.
- **Premium Glassmorphism UI:** A stunning, animated, responsive dark-mode interface built with Vanilla HTML/CSS.

## 🛠️ Technology Stack

- **Backend:** Node.js, Express.js
- **WhatsApp Integration:** `whatsapp-web.js` (Puppeteer)
- **Email Integration:** Nodemailer (Google SMTP)
- **Real-Time UI:** Socket.io
- **Frontend:** HTML5, CSS3, Vanilla JavaScript

## 📦 Installation & Setup

1. **Clone the repository:**
   ```bash
   git clone https://github.com/yourusername/EchoSend.git
   cd EchoSend
   ```

2. **Install dependencies:**
   Navigate into the `webapp` folder (or wherever your `package.json` is located) and run:
   ```bash
   npm install
   ```

3. **Start the application:**
   You can start the server by running:
   ```bash
   npm start
   ```
   *(Alternatively, double-click the `start.bat` file if you are on Windows).*

4. **Access the UI:**
   Open your browser and navigate to `http://localhost:3000`.

## ⚙️ How to Use

1. **Connect WhatsApp:** Open the app and scan the QR code using the "Linked Devices" feature on your WhatsApp mobile app.
2. **Authenticate Gmail:** If sending emails, enter your Gmail address and an **App Password** (Requires 2-Factor Authentication enabled on your Google Account).
3. **Upload Audience:** Drag and drop your `.csv` file containing your contacts.
4. **Compose:** Write your message template. Don't forget to use `$user` to greet them by name!
5. **Initialize Sequence:** Hit send and watch the terminal execute your broadcast in real-time.

## ⚠️ Disclaimer

EchoSend relies on automated web scraping via `whatsapp-web.js`. Please be aware of WhatsApp's Terms of Service. Sending massive amounts of unsolicited spam may result in your WhatsApp account being banned. Use responsibly for legitimate business outreach and opted-in contacts.

---
*Designed and built with precision.*
