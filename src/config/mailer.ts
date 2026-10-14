import nodemailer from "nodemailer";

const port = Number(process.env.SMTP_PORT);

export const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST,
  port,
  secure: port === 465, // 465 usa TLS direto; as outras portas negociam depois
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS,
  },
});