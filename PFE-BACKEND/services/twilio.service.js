import twilio from 'twilio';

// Initialize Twilio client
const accountSid = process.env.TWILIO_ACCOUNT_SID;
const authToken = process.env.TWILIO_AUTH_TOKEN;
const fromNumber = process.env.TWILIO_PHONE_NUMBER;

if (!accountSid || !authToken || !fromNumber) {
  console.warn('Twilio credentials not configured. SMS functionality disabled.');
}

const client = accountSid && authToken ? twilio(accountSid, authToken) : null;

/**
 * Validate Tunisian phone number
 * Tunisian phone numbers should start with +216
 */
const validateTunisianPhoneNumber = (phoneNumber) => {
  const tunisianPhoneRegex = /^\+216\d{8}$/;
  return tunisianPhoneRegex.test(phoneNumber);
};

/**
 * Send SMS via Twilio
 * @param {string} toNumber - Recipient phone number (format: +216xxxxxxxx)
 * @param {string} message - SMS message content
 * @returns {Promise<object>} SMS send response
 */
export const sendSMS = async (toNumber, message) => {
  try {
    // Validate phone number
    if (!validateTunisianPhoneNumber(toNumber)) {
      throw new Error('Invalid Tunisian phone number format. Expected: +216xxxxxxxx');
    }

    // Check if Twilio is configured
    if (!client) {
      throw new Error('Twilio service is not configured. Please set environment variables.');
    }

    const messageResponse = await client.messages.create({
      body: message,
      from: fromNumber,
      to: toNumber
    });

    console.log(`SMS sent successfully to ${toNumber}. SID: ${messageResponse.sid}`);

    return {
      success: true,
      messageSid: messageResponse.sid,
      status: messageResponse.status
    };
  } catch (error) {
    console.error('Error sending SMS:', error);
    throw new Error(`Failed to send SMS: ${error.message}`);
  }
};

/**
 * Send OTP SMS with formatted message
 * @param {string} phoneNumber - Recipient phone number
 * @param {string} otp - One-time password
 * @returns {Promise<object>} SMS send response
 */
export const sendOTPSMS = async (phoneNumber, otp) => {
  try {
    const message = `Your verification code is: ${otp}. This code expires in 5 minutes. Do not share this code with anyone.`;
    return await sendSMS(phoneNumber, message);
  } catch (error) {
    console.error('Error sending OTP SMS:', error);
    throw error;
  }
};

/**
 * Check SMS delivery status
 * @param {string} messageSid - Twilio message SID
 * @returns {Promise<string>} Message status
 */
export const checkMessageStatus = async (messageSid) => {
  try {
    if (!client) {
      throw new Error('Twilio service is not configured');
    }

    const message = await client.messages(messageSid).fetch();
    return {
      status: message.status,
      dateCreated: message.dateCreated,
      dateSent: message.dateSent,
      errorCode: message.errorCode,
      errorMessage: message.errorMessage
    };
  } catch (error) {
    console.error('Error checking message status:', error);
    throw error;
  }
};

/**
 * Get Twilio account details
 * @returns {Promise<object>} Account info
 */
export const getAccountInfo = async () => {
  try {
    if (!client) {
      throw new Error('Twilio service is not configured');
    }

    const account = await client.api.accounts(accountSid).fetch();
    return {
      accountSid: account.sid,
      status: account.status,
      authToken: '***' // Never expose actual token
    };
  } catch (error) {
    console.error('Error fetching account info:', error);
    throw error;
  }
};

/**
 * Check if Twilio is properly configured
 * @returns {boolean}
 */
export const isTwilioConfigured = () => {
  return !!(client && accountSid && authToken && fromNumber);
};
