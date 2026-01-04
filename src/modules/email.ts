import nodemailer, {Transporter} from 'nodemailer';
import settings from './settings';
import {MailOptions, Options, SentMessageInfo} from 'nodemailer/lib/smtp-pool';

let transporter: Transporter<SentMessageInfo, Options> | undefined = undefined;

function init() {
    if (!transporter) {
        transporter = nodemailer.createTransport({
            pool: true,
            host: settings.value.smtpHost,
            port: settings.value.smtpPort,
            secure: settings.value.smtpSecure, // use TLS
            auth: {
                user: settings.value.smtpUser,
                pass: settings.value.smtpPassword,
            },
        });
    }
}

// Funktion zum Senden einer E-Mail
async function sendEmail(to: string, subject: string, text: string) {
    init();

    const mailOptions: MailOptions = {
        from: settings.value.smtpEmail,
        to: to,
        subject: subject,
        text: text,
    };

    try {
        const info = await transporter!.sendMail(mailOptions);
    } catch (error) {
        console.error('Error sending E-Mail:', error);
    }
}

// Funktion zum Senden einer Aktivierungs-E-Mail
async function sendActivationEmail(userEmail: string, activationLink: string) {
    const subject = 'Activate your account';
    const text = `Hi! Welcome to Inventory Management!\n\nTo activate your account, please follow this link:\n\n${activationLink}\n\nNote: This link will expire in 1 hour.\n\nYour Inventory Management Team.`;

    await sendEmail(userEmail, subject, text);
}

// Funktion zum Senden einer E-Mail für das Passwort zurücksetzen
async function sendPasswordResetEmail(userEmail: string, resetLink: string) {
    const subject = 'Reset your password';
    const text = `Hi!\n\nYou requested to reset your password.\n\nTo set a new one, please follow this link:\n\n${resetLink}\n\nNote: This link will expire in 1 hour.\n\nYour Inventory Management Team.`;

    await sendEmail(userEmail, subject, text);
}

export default {
    sendEmail,
    sendActivationEmail,
    sendPasswordResetEmail
};
