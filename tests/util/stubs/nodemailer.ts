type Mail = { to?: string; from?: string; subject?: string; text?: string; html?: string };
type SendResult = { accepted: string[]; rejected: string[]; messageId: string; response?: string };

export type Transporter = {
    sendMail(mail: Mail): Promise<SendResult>;
    verify(): Promise<boolean>;
    close(): void;
    isIdle?: () => boolean;
};

export const createTransport = (_opts: any): Transporter => {
    return {
        async sendMail(mail: Mail): Promise<SendResult> {
            return {
                accepted: [mail.to || 'test@example.com'],
                rejected: [],
                messageId: 'test-message-id',
                response: '250 OK: queued',
            };
        },
        async verify() {
            return true;
        },
        close() { /* no-op */
        },
        isIdle: () => true,
    };
};

const nodemailer = {createTransport};
export default nodemailer;
