import nodemailer from "nodemailer";
import { Resend } from 'resend';

// Resend integration — uses RESEND_API_KEY secret directly
const RESEND_FROM_EMAIL = 'InvoiceReminder@jdcoredev.com';

function getResendApiKey(): string {
  const key = process.env.RESEND_API_KEY;
  if (!key) throw new Error('Resend not connected — add RESEND_API_KEY to your secrets');
  return key;
}

// WARNING: Never cache this client - always call fresh
export async function getUncachableResendClient() {
  const apiKey = getResendApiKey();
  return {
    client: new Resend(apiKey),
    fromEmail: RESEND_FROM_EMAIL,
  };
}

// SMTP transporter (legacy fallback)
const transporter = process.env.SMTP_HOST
  ? nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: parseInt(process.env.SMTP_PORT || "587"),
      secure: process.env.SMTP_SECURE === "true",
      auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS,
      },
    })
  : null;

export interface EmailOptions {
  to: string;
  subject: string;
  text: string;
  html?: string;
}

export async function sendEmail(options: EmailOptions): Promise<{ success: boolean; error?: string }> {
  if (!transporter) {
    console.warn("[Email] SMTP not configured. Email not sent:", options.subject);
    return { success: false, error: "SMTP not configured" };
  }

  try {
    await transporter.sendMail({
      from: process.env.SMTP_FROM || process.env.SMTP_USER || "noreply@jdcoredev.com",
      to: options.to,
      subject: options.subject,
      text: options.text,
      html: options.html,
    });
    console.log(`[Email] Sent to ${options.to}: ${options.subject}`);
    return { success: true };
  } catch (error: any) {
    console.error("[Email] Failed to send:", error.message);
    return { success: false, error: error.message };
  }
}

export function formatMeetingReminderEmail(params: {
  recipientName: string;
  meetingDate: string;
  meetingTime: string;
  meetingType: string;
  duration: number;
  isAdmin: boolean;
  clientName?: string;
}): EmailOptions {
  const { recipientName, meetingDate, meetingTime, meetingType, duration, isAdmin, clientName } = params;
  
  const subject = isAdmin
    ? `Reminder: Upcoming ${meetingType} meeting with ${clientName}`
    : `Reminder: Your upcoming ${meetingType} meeting with JD CoreDev`;

  const text = isAdmin
    ? `Hi,

This is a reminder that you have an upcoming ${meetingType} meeting scheduled.

Details:
- Client: ${clientName}
- Date: ${meetingDate}
- Time: ${meetingTime}
- Duration: ${duration} minutes
- Type: ${meetingType}

Best regards,
JD CoreDev System`
    : `Hi ${recipientName},

This is a reminder about your upcoming ${meetingType} meeting with JD CoreDev.

Details:
- Date: ${meetingDate}
- Time: ${meetingTime}
- Duration: ${duration} minutes
- Type: ${meetingType}

We look forward to speaking with you.

Best regards,
JD CoreDev`;

  return {
    to: "",
    subject,
    text,
  };
}

export function formatOfficeDayReminderEmail(params: {
  recipientName: string;
  officeDayDate: string;
  dayType: string;
  projectName?: string;
  isAdmin: boolean;
  clientName?: string;
}): EmailOptions {
  const { recipientName, officeDayDate, dayType, projectName, isAdmin, clientName } = params;
  
  const subject = isAdmin
    ? `Reminder: Office day with ${clientName} tomorrow`
    : `Reminder: Your office day with JD CoreDev tomorrow`;

  const text = isAdmin
    ? `Hi,

This is a reminder that you have an office day scheduled tomorrow.

Details:
- Client: ${clientName}
- Date: ${officeDayDate}
- Type: ${dayType}
${projectName ? `- Project: ${projectName}` : ""}

Best regards,
JD CoreDev System`
    : `Hi ${recipientName},

This is a reminder about your upcoming office day with JD CoreDev.

Details:
- Date: ${officeDayDate}
- Type: ${dayType}
${projectName ? `- Project: ${projectName}` : ""}

We look forward to working with you.

Best regards,
JD CoreDev`;

  return {
    to: "",
    subject,
    text,
  };
}

export function isEmailConfigured(): boolean {
  return !!process.env.SMTP_HOST;
}

// Check if Resend is available
export function isResendConfigured(): boolean {
  return !!process.env.RESEND_API_KEY;
}

// Send invoice reminder email via Resend
export async function sendInvoiceReminderEmail(
  toEmail: string,
  clientName: string,
  invoiceNumber: string,
  totalAmountCents: number,
  dueDate: string,
  isOverdue: boolean,
  reminderCount: number
): Promise<{ success: boolean; error?: any; messageId?: string }> {
  try {
    const { client, fromEmail } = await getUncachableResendClient();
    
    const formattedAmount = `$${(totalAmountCents / 100).toFixed(2)}`;
    const formattedDueDate = new Date(dueDate).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    });
    
    const subject = isOverdue 
      ? `Payment Overdue: Invoice ${invoiceNumber} - Action Required`
      : `Payment Reminder: Invoice ${invoiceNumber}`;
    
    const urgencyText = isOverdue
      ? `This invoice was due on ${formattedDueDate} and is now overdue.`
      : `This invoice is due on ${formattedDueDate}.`;
    
    const reminderText = reminderCount > 1 
      ? `This is reminder #${reminderCount}.` 
      : '';
    
    const html = `
      <!DOCTYPE html>
      <html>
        <head>
          <meta charset="utf-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
        </head>
        <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
          <div style="background: linear-gradient(135deg, #008080 0%, #006666 100%); padding: 30px; border-radius: 8px 8px 0 0;">
            <h1 style="color: white; margin: 0; font-size: 24px;">JD CoreDev</h1>
          </div>
          
          <div style="background: #f9fafb; padding: 30px; border: 1px solid #e5e7eb; border-top: none; border-radius: 0 0 8px 8px;">
            <h2 style="color: #111827; margin-top: 0;">${isOverdue ? 'Payment Overdue' : 'Payment Reminder'}</h2>
            
            <p>Dear ${clientName},</p>
            
            <p>${urgencyText} ${reminderText}</p>
            
            <div style="background: white; border: 1px solid #e5e7eb; border-radius: 8px; padding: 20px; margin: 20px 0;">
              <table style="width: 100%; border-collapse: collapse;">
                <tr>
                  <td style="padding: 8px 0; color: #6b7280;">Invoice Number:</td>
                  <td style="padding: 8px 0; text-align: right; font-weight: 600;">${invoiceNumber}</td>
                </tr>
                <tr>
                  <td style="padding: 8px 0; color: #6b7280;">Amount Due:</td>
                  <td style="padding: 8px 0; text-align: right; font-weight: 600; color: ${isOverdue ? '#dc2626' : '#008080'}; font-size: 18px;">${formattedAmount}</td>
                </tr>
                <tr>
                  <td style="padding: 8px 0; color: #6b7280;">Due Date:</td>
                  <td style="padding: 8px 0; text-align: right; ${isOverdue ? 'color: #dc2626;' : ''}">${formattedDueDate}</td>
                </tr>
              </table>
            </div>
            
            <p>Please ensure payment is made at your earliest convenience to avoid any service interruptions.</p>
            
            <p>If you have already made this payment, please disregard this reminder or contact us to confirm receipt.</p>
            
            <p style="margin-top: 30px;">
              Best regards,<br>
              <strong>JD CoreDev</strong>
            </p>
          </div>
          
          <div style="text-align: center; padding: 20px; color: #9ca3af; font-size: 12px;">
            <p>This is an automated reminder from JD CoreDev.</p>
          </div>
        </body>
      </html>
    `;
    
    const result = await client.emails.send({
      from: fromEmail,
      to: toEmail,
      subject,
      html
    });
    
    console.log(`[Email] Invoice reminder sent to ${toEmail} for invoice ${invoiceNumber}`);
    return { success: true, messageId: result.data?.id };
  } catch (error) {
    console.error(`[Email] Failed to send invoice reminder:`, error);
    return { success: false, error };
  }
}

export async function sendMilestoneReminderEmail(
  toEmail: string,
  clientName: string,
  milestoneName: string,
  projectName: string,
  amountCents: number,
  dueDate: string,
  isOverdue: boolean,
  reminderCount: number
): Promise<{ success: boolean; error?: any; messageId?: string }> {
  try {
    const { client, fromEmail } = await getUncachableResendClient();
    
    const formattedAmount = `$${(amountCents / 100).toFixed(2)}`;
    const formattedDueDate = new Date(dueDate).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    });
    
    const subject = isOverdue 
      ? `Payment Overdue: ${milestoneName} - Action Required`
      : `Payment Reminder: ${milestoneName}`;
    
    const urgencyText = isOverdue
      ? `This payment was due on ${formattedDueDate} and is now overdue.`
      : `This payment is due on ${formattedDueDate}.`;
    
    const reminderText = reminderCount > 1 
      ? `This is reminder #${reminderCount}.` 
      : '';
    
    const html = `
      <!DOCTYPE html>
      <html>
        <head>
          <meta charset="utf-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
        </head>
        <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
          <div style="background: linear-gradient(135deg, #008080 0%, #006666 100%); padding: 30px; border-radius: 8px 8px 0 0;">
            <h1 style="color: white; margin: 0; font-size: 24px;">JD CoreDev</h1>
          </div>
          
          <div style="background: #f9fafb; padding: 30px; border: 1px solid #e5e7eb; border-top: none; border-radius: 0 0 8px 8px;">
            <h2 style="color: #111827; margin-top: 0;">${isOverdue ? 'Payment Overdue' : 'Payment Reminder'}</h2>
            
            <p>Dear ${clientName},</p>
            
            <p>${urgencyText} ${reminderText}</p>
            
            <div style="background: white; border: 1px solid #e5e7eb; border-radius: 8px; padding: 20px; margin: 20px 0;">
              <table style="width: 100%; border-collapse: collapse;">
                <tr>
                  <td style="padding: 8px 0; color: #6b7280;">Milestone:</td>
                  <td style="padding: 8px 0; text-align: right; font-weight: 600;">${milestoneName}</td>
                </tr>
                <tr>
                  <td style="padding: 8px 0; color: #6b7280;">Project:</td>
                  <td style="padding: 8px 0; text-align: right; font-weight: 600;">${projectName}</td>
                </tr>
                <tr>
                  <td style="padding: 8px 0; color: #6b7280;">Amount Due:</td>
                  <td style="padding: 8px 0; text-align: right; font-weight: 600; color: ${isOverdue ? '#dc2626' : '#008080'}; font-size: 18px;">${formattedAmount}</td>
                </tr>
                <tr>
                  <td style="padding: 8px 0; color: #6b7280;">Due Date:</td>
                  <td style="padding: 8px 0; text-align: right; ${isOverdue ? 'color: #dc2626;' : ''}">${formattedDueDate}</td>
                </tr>
              </table>
            </div>
            
            <p>Please ensure payment is made at your earliest convenience to avoid any delays in your project.</p>
            
            <p>If you have already made this payment, please disregard this reminder or contact us to confirm receipt.</p>
            
            <p style="margin-top: 30px;">
              Best regards,<br>
              <strong>JD CoreDev</strong>
            </p>
          </div>
          
          <div style="text-align: center; padding: 20px; color: #9ca3af; font-size: 12px;">
            <p>This is an automated reminder from JD CoreDev.</p>
          </div>
        </body>
      </html>
    `;
    
    const result = await client.emails.send({
      from: fromEmail,
      to: toEmail,
      subject,
      html
    });
    
    console.log(`[Email] Milestone reminder sent to ${toEmail} for milestone "${milestoneName}"`);
    return { success: true, messageId: result.data?.id };
  } catch (error) {
    console.error(`[Email] Failed to send milestone reminder:`, error);
    return { success: false, error };
  }
}

export function formatContactInquiryEmail(params: {
  name: string;
  email: string;
  company?: string;
  appType?: string;
  budget?: string;
  timeline?: string;
  message: string;
}): EmailOptions {
  const { name, email, company, appType, budget, timeline, message } = params;

  const subject = `New Project Inquiry from ${name}${company ? ` (${company})` : ""}`;

  const text = `New project inquiry received!

Contact Details:
- Name: ${name}
- Email: ${email}
${company ? `- Company: ${company}` : ""}
${appType ? `- App Type: ${appType}` : ""}
${budget ? `- Budget: ${budget}` : ""}
${timeline ? `- Timeline: ${timeline}` : ""}

Message:
${message}

---
Reply directly to this email or contact ${email} to respond.`;

  const html = `
<h2>New Project Inquiry</h2>
<h3>Contact Details:</h3>
<ul>
  <li><strong>Name:</strong> ${name}</li>
  <li><strong>Email:</strong> <a href="mailto:${email}">${email}</a></li>
  ${company ? `<li><strong>Company:</strong> ${company}</li>` : ""}
  ${appType ? `<li><strong>App Type:</strong> ${appType}</li>` : ""}
  ${budget ? `<li><strong>Budget:</strong> ${budget}</li>` : ""}
  ${timeline ? `<li><strong>Timeline:</strong> ${timeline}</li>` : ""}
</ul>
<h3>Message:</h3>
<p>${message.replace(/\n/g, "<br>")}</p>
<hr>
<p><em>Reply directly to this email or contact <a href="mailto:${email}">${email}</a> to respond.</em></p>
`;

  return {
    to: process.env.ADMIN_EMAIL || "",
    subject,
    text,
    html,
  };
}
