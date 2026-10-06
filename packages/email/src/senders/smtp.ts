import nodemailer, { type Transporter } from 'nodemailer'
import type { EmailSender, OutgoingEmail, SendResult } from './types.js'

/**
 * Development: sends to Mailpit (docker-compose.yml), which catches EVERY
 * email — nothing reaches a real inbox. Open http://localhost:8025 to read them.
 */
export class SmtpEmailSender implements EmailSender {
  readonly name = 'smtp'
  private readonly transport: Transporter

  constructor(
    host: string,
    port: number,
    private readonly from: string,
  ) {
    this.transport = nodemailer.createTransport({ host, port, secure: false })
  }

  async send(email: OutgoingEmail): Promise<SendResult> {
    try {
      const info = await this.transport.sendMail({
        from: this.from,
        to: email.to,
        subject: email.subject,
        html: email.html,
        text: email.text,
        ...(email.replyTo && { replyTo: email.replyTo }),
        headers: { ...(email.tag && { 'X-Nowoll-Email': email.tag }) },
      })
      return { ok: true, id: info.messageId ?? null }
    } catch (error) {
      return { ok: false, reason: `SMTP: ${String(error)}`, retryable: true }
    }
  }
}
