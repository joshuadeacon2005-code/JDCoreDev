import twilio from 'twilio';

function readTwilioEnv() {
  const accountSid = process.env.TWILIO_ACCOUNT_SID;
  const apiKey = process.env.TWILIO_API_KEY;
  const apiKeySecret = process.env.TWILIO_API_KEY_SECRET;
  const authToken = process.env.TWILIO_AUTH_TOKEN;
  const phoneNumber = process.env.TWILIO_PHONE_NUMBER;

  if (!accountSid || !phoneNumber) {
    throw new Error('Twilio env not set: TWILIO_ACCOUNT_SID and TWILIO_PHONE_NUMBER are required');
  }
  if (!(apiKey && apiKeySecret) && !authToken) {
    throw new Error('Twilio env not set: provide either TWILIO_API_KEY+TWILIO_API_KEY_SECRET or TWILIO_AUTH_TOKEN');
  }

  return { accountSid, apiKey, apiKeySecret, authToken, phoneNumber };
}

export async function getTwilioClient() {
  const { accountSid, apiKey, apiKeySecret, authToken } = readTwilioEnv();
  if (apiKey && apiKeySecret) {
    return twilio(apiKey, apiKeySecret, { accountSid });
  }
  return twilio(accountSid, authToken!);
}

export async function getTwilioFromPhoneNumber() {
  return readTwilioEnv().phoneNumber;
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
