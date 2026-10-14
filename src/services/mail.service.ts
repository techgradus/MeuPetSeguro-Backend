import { transporter } from "../config/mailer";

export const sendPasswordResetCode = async (
  to: string,
  name: string,
  code: string
) => {
  await transporter.sendMail({
    from: process.env.MAIL_FROM,
    to,
    subject: "Seu código para redefinir a senha",
    text: [
      `Olá, ${name}!`,
      "",
      `Seu código para redefinir a senha do MeuPet Seguro é: ${code}`,
      "",
      "Ele vale por 15 minutos. Se você não pediu isso, pode ignorar este e-mail.",
    ].join("\n"),
  });
};