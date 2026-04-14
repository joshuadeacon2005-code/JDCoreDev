// Twilio service for crypto notifications
// Uses Replit's Twilio connector integration

import twilio from 'twilio';

let connectionSettings: any;

async function getCredentials() {
  const hostname = process.env.REPLIT_CONNECTORS_HOSTNAME;
  const xReplitToken = process.env.REPL_IDENTITY 
    ? 'repl ' + process.env.REPL_IDENTITY 
    : process.env.WEB_REPL_RENEWAL 
    ? 'depl ' + process.env.WEB_REPL_RENEWAL 
    : null;

  if (!xReplitToken) {
    throw new Error('X_REPLIT_TOKEN not found for repl/depl');
  }

  connectionSettings = await fetch(
    'https://' + hostname + '/api/v2/connection?include_secrets=true&connector_names=twilio',
    {
      headers: {
        'Accept': 'application/json',
        'X_REPLIT_TOKEN': xReplitToken
      }
    }
  ).then(res => res.json()).then(data => data.items?.[0]);

  if (!connectionSettings || (!connectionSettings.settings.account_sid || !connectionSettings.settings.api_key || !connectionSettings.settings.api_key_secret)) {
    throw new Error('Twilio not connected');
  }
  return {
    accountSid: connectionSettings.settings.account_sid,
    apiKey: connectionSettings.settings.api_key,
    apiKeySecret: connectionSettings.settings.api_key_secret,
    phoneNumber: connectionSettings.settings.phone_number
  };
}

export async function getTwilioClient() {
  const { accountSid, apiKey, apiKeySecret } = await getCredentials();
  return twilio(apiKey, apiKeySecret, {
    accountSid: accountSid
  });
}

export async function getTwilioFromPhoneNumber() {
  const { phoneNumber } = await getCredentials();
  return phoneNumber;
}

function isQuietHours(quietHoursStart: string | null, quietHoursEnd: string | null): boolean {
  if (!quietHoursStart || !quietHoursEnd) return false;
  
  const now = new Date();
  const currentTime = now.getHours() * 60 + now.getMinutes();
  
  const [startHour, startMin] = quietHoursStart.split(':').map(Number);
  const [endHour, endMin] = quietHoursEnd.split(':').map(Number);
  
  const startTime = startHour * 60 + startMin;
  const endTime = endHour * 60 + endMin;
  
  if (startTime < endTime) {
    return currentTime >= startTime && currentTime <= endTime;
  } else {
    return currentTime >= startTime || currentTime <= endTime;
  }
}

export async function sendSMS(
  message: string, 
  recipientPhoneNumber: string,
  quietHoursStart?: string | null,
  quietHoursEnd?: string | null
): Promise<boolean> {
  try {
    if (isQuietHours(quietHoursStart || null, quietHoursEnd || null)) {
      console.log('Quiet hours - SMS not sent');
      return false;
    }

    const client = await getTwilioClient();
    const fromNumber = await getTwilioFromPhoneNumber();
    
    await client.messages.create({
      body: message,
      from: fromNumber,
      to: recipientPhoneNumber,
    });
    
    console.log('SMS sent successfully');
    return true;
  } catch (error) {
    console.error('Error sending SMS:', error);
    return false;
  }
}

export async function sendWhatsApp(
  message: string, 
  recipientPhoneNumber: string,
  quietHoursStart?: string | null,
  quietHoursEnd?: string | null
): Promise<boolean> {
  try {
    if (isQuietHours(quietHoursStart || null, quietHoursEnd || null)) {
      console.log('Quiet hours - WhatsApp not sent');
      return false;
    }

    const client = await getTwilioClient();
    const fromNumber = await getTwilioFromPhoneNumber();
    
    await client.messages.create({
      body: message,
      from: `whatsapp:${fromNumber}`,
      to: `whatsapp:${recipientPhoneNumber}`,
    });
    
    console.log('WhatsApp message sent successfully');
    return true;
  } catch (error) {
    console.error('Error sending WhatsApp:', error);
    return false;
  }
}
