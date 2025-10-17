const nodemailer = require('nodemailer');

class EmailService {
  constructor() {
    this.transporter = nodemailer.createTransporter({
      host: process.env.EMAIL_HOST,
      port: process.env.EMAIL_PORT,
      auth: {
        user: process.env.EMAIL_USERNAME,
        pass: process.env.EMAIL_PASSWORD,
      },
    });
  }

  async sendWelcomeEmail(user) {
    const mailOptions = {
      from: 'Maseru Marketplace <noreply@maserumarketplace.com>',
      to: user.email,
      subject: 'Welcome to Maseru Marketplace!',
      html: this._generateWelcomeTemplate(user),
    };

    await this.transporter.sendMail(mailOptions);
  }

  async sendOrderConfirmation(order, user) {
    const mailOptions = {
      from: 'Maseru Marketplace <orders@maserumarketplace.com>',
      to: user.email,
      subject: 'Order Confirmation',
      html: this._generateOrderConfirmationTemplate(order, user),
    };

    await this.transporter.sendMail(mailOptions);
  }

  async sendPasswordResetToken(email, resetToken) {
    const resetURL = `${process.env.FRONTEND_URL}/reset-password?token=${resetToken}`;

    const mailOptions = {
      from: 'Maseru Marketplace <security@maserumarketplace.com>',
      to: email,
      subject: 'Password Reset Request',
      html: this._generatePasswordResetTemplate(resetURL),
    };

    await this.transporter.sendMail(mailOptions);
  }

  _generateWelcomeTemplate(user) {
    return `
      <!DOCTYPE html>
      <html>
      <head>
        <style>
          body { font-family: Arial, sans-serif; line-height: 1.6; }
          .container { max-width: 600px; margin: 0 auto; padding: 20px; }
          .header { background: #1E88E5; color: white; padding: 20px; text-align: center; }
          .content { padding: 20px; background: #f9f9f9; }
          .footer { padding: 20px; text-align: center; color: #666; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>Welcome to Maseru Marketplace!</h1>
          </div>
          <div class="content">
            <p>Hello ${user.profile.firstName},</p>
            <p>Thank you for joining Maseru Marketplace. We're excited to have you on board!</p>
            <p>As a ${user.role}, you can now:</p>
            <ul>
              ${user.role === 'vendor' ? '<li>List your products and services</li>' : ''}
              ${user.role === 'passenger' ? '<li>Browse and order from local vendors</li>' : ''}
              ${user.role === 'taxi_driver' ? '<li>Accept delivery requests</li>' : ''}
              <li>Connect with other users in the community</li>
            </ul>
            <p>If you have any questions, feel free to contact our support team.</p>
          </div>
          <div class="footer">
            <p>&copy; 2024 Maseru Marketplace. All rights reserved.</p>
          </div>
        </div>
      </body>
      </html>
    `;
  }

  _generateOrderConfirmationTemplate(order, user) {
    return `
      <!DOCTYPE html>
      <html>
      <head>
        <style>
          body { font-family: Arial, sans-serif; line-height: 1.6; }
          .container { max-width: 600px; margin: 0 auto; padding: 20px; }
          .header { background: #4CAF50; color: white; padding: 20px; text-align: center; }
          .content { padding: 20px; background: #f9f9f9; }
          .order-details { background: white; padding: 15px; border-radius: 5px; margin: 15px 0; }
          .footer { padding: 20px; text-align: center; color: #666; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>Order Confirmation</h1>
          </div>
          <div class="content">
            <p>Hello ${user.profile.firstName},</p>
            <p>Thank you for your order! Here are your order details:</p>
            
            <div class="order-details">
              <h3>Order #${order._id}</h3>
              <p><strong>Total Amount:</strong> LSL ${order.totalAmount}</p>
              <p><strong>Status:</strong> ${order.status}</p>
              <p><strong>Estimated Delivery:</strong> ${order.estimatedDelivery || 'To be confirmed'}</p>
            </div>
            
            <p>You can track your order status in the app.</p>
          </div>
          <div class="footer">
            <p>&copy; 2024 Maseru Marketplace. All rights reserved.</p>
          </div>
        </div>
      </body>
      </html>
    `;
  }

  _generatePasswordResetTemplate(resetURL) {
    return `
      <!DOCTYPE html>
      <html>
      <head>
        <style>
          body { font-family: Arial, sans-serif; line-height: 1.6; }
          .container { max-width: 600px; margin: 0 auto; padding: 20px; }
          .header { background: #FF9800; color: white; padding: 20px; text-align: center; }
          .content { padding: 20px; background: #f9f9f9; }
          .button { display: inline-block; padding: 10px 20px; background: #1E88E5; color: white; text-decoration: none; border-radius: 5px; }
          .footer { padding: 20px; text-align: center; color: #666; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>Password Reset Request</h1>
          </div>
          <div class="content">
            <p>We received a request to reset your password.</p>
            <p>Click the button below to reset your password:</p>
            <p style="text-align: center;">
              <a href="${resetURL}" class="button">Reset Password</a>
            </p>
            <p>If you didn't request this, please ignore this email.</p>
            <p><strong>Note:</strong> This link will expire in 1 hour.</p>
          </div>
          <div class="footer">
            <p>&copy; 2024 Maseru Marketplace. All rights reserved.</p>
          </div>
        </div>
      </body>
      </html>
    `;
  }
}

module.exports = new EmailService();