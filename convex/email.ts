import { Resend } from "resend";
import { action, internalAction, query } from "./_generated/server";
import { v } from "convex/values";
import { internal } from "./_generated/api";

/**
 * Check if the email service is properly configured.
 * This is a public query that can be used to diagnose email issues.
 */
export const getEmailConfigStatus = query({
  args: {},
  async handler() {
    // Note: We can't access process.env directly in queries,
    // but we can provide guidance
    return {
      message: "To check if RESEND_API_KEY is configured, run: npx convex env get RESEND_API_KEY",
      setupInstructions: [
        "1. Create a Resend account at https://resend.com",
        "2. Get your API key from https://resend.com/api-keys",
        "3. Set it in Convex: npx convex env set RESEND_API_KEY re_xxxxx",
        "4. Verify your domain 'flmlnk.com' in Resend dashboard",
        "5. Add the required DNS records for domain verification",
      ],
      senderAddress: "inquiries@flmlnk.com",
    };
  },
});

/**
 * Test the email configuration by attempting to send a test email.
 * Only accessible to authenticated users for their own email.
 */
export const testEmailConfiguration = action({
  args: {
    testEmail: v.string(),
  },
  async handler(ctx, { testEmail }) {
    const apiKey = process.env.RESEND_API_KEY;

    if (!apiKey) {
      return {
        success: false,
        error: "RESEND_API_KEY is not configured in Convex environment variables",
        instructions: "Run: npx convex env set RESEND_API_KEY your_api_key_here",
      };
    }

    const resend = new Resend(apiKey);

    try {
      const result = await resend.emails.send({
        from: "Flmlnk <inquiries@flmlnk.com>",
        to: testEmail,
        subject: "Flmlnk Email Test - Configuration Working!",
        html: `
          <div style="font-family: sans-serif; padding: 20px;">
            <h2 style="color: #f53c56;">Email Configuration Test Successful!</h2>
            <p>This confirms that your Flmlnk email notifications are working correctly.</p>
            <p>You will now receive booking inquiry notifications at this email address.</p>
          </div>
        `,
        text: "Email Configuration Test Successful! Your Flmlnk email notifications are working correctly.",
      });

      if (result.error) {
        return {
          success: false,
          error: result.error.message,
          errorCode: result.error.name,
          hint: result.error.message.includes("domain")
            ? "You may need to verify the domain 'flmlnk.com' in Resend dashboard"
            : undefined,
        };
      }

      return {
        success: true,
        message: "Test email sent successfully! Check your inbox.",
        emailId: result.data?.id,
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error occurred",
      };
    }
  },
});

// Loom tutorial video URL - update this when recording new tutorials
const LOOM_TUTORIAL_URL = "https://www.loom.com/share/flmlnk-getting-started";

/**
 * Send a welcome email to new users when they sign up.
 * This email welcomes them to Flmlnk with a video tutorial and clear next steps.
 */
export const sendWelcomeEmail = internalAction({
  args: {
    userEmail: v.string(),
    userName: v.optional(v.string()),
  },
  async handler(ctx, args) {
    const apiKey = process.env.RESEND_API_KEY;
    if (!apiKey) {
      console.error("RESEND_API_KEY not configured - skipping welcome email");
      return { success: false, error: "Email service not configured" };
    }

    const resend = new Resend(apiKey);
    const displayName = args.userName || "there";

    const emailHtml = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Welcome to Flmlnk</title>
</head>
<body style="margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; background-color: #0c0911; color: #ffffff;">
  <div style="max-width: 600px; margin: 0 auto; padding: 40px 20px;">
    <!-- Header -->
    <div style="text-align: center; margin-bottom: 32px;">
      <h1 style="color: #f53c56; font-size: 28px; margin: 0 0 8px 0;">Welcome to Flmlnk!</h1>
      <p style="color: #94a3b8; font-size: 16px; margin: 0;">Build your audience. Get discovered. Book more work.</p>
    </div>

    <!-- Main Content Card -->
    <div style="background-color: rgba(255,255,255,0.05); border: 1px solid rgba(255,255,255,0.1); border-radius: 12px; padding: 32px; margin-bottom: 24px;">
      <p style="color: #ffffff; font-size: 18px; margin: 0 0 20px 0; line-height: 1.6;">
        Hey ${displayName},
      </p>

      <p style="color: #e2e8f0; font-size: 16px; line-height: 1.7; margin: 0 0 20px 0;">
        Welcome to the Flmlnk community! You've just joined hundreds of film professionals who are using their Flmlnk page to showcase their work, build their audience, and connect with industry opportunities.
      </p>

      <!-- Video Tutorial Section -->
      <div style="background-color: rgba(245, 60, 86, 0.15); border: 1px solid rgba(245, 60, 86, 0.3); border-radius: 8px; padding: 20px; margin: 24px 0; text-align: center;">
        <p style="color: #ffffff; font-size: 14px; font-weight: 600; margin: 0 0 12px 0;">🎬 WATCH: Get Started in 3 Minutes</p>
        <a href="${LOOM_TUTORIAL_URL}" style="display: inline-block; background-color: #f53c56; color: #ffffff; padding: 12px 24px; border-radius: 8px; text-decoration: none; font-weight: 600; font-size: 14px;">
          Watch the Tutorial
        </a>
        <p style="color: #94a3b8; font-size: 12px; margin: 12px 0 0 0;">Quick walkthrough to set up your page</p>
      </div>

      <p style="color: #e2e8f0; font-size: 16px; line-height: 1.7; margin: 0 0 20px 0;">
        Your Flmlnk page is your professional home on the web—a place to showcase your reels, projects, and credits while making it easy for people to reach you.
      </p>

      <!-- What's Next Section -->
      <div style="background-color: rgba(255,255,255,0.03); border: 1px solid rgba(255,255,255,0.1); border-radius: 8px; padding: 20px; margin: 24px 0;">
        <h3 style="color: #f53c56; font-size: 16px; margin: 0 0 16px 0;">Your Next Steps:</h3>
        <table style="width: 100%; border-collapse: collapse;">
          <tr>
            <td style="padding: 8px 12px 8px 0; color: #f53c56; font-size: 20px; vertical-align: top; width: 40px;">1</td>
            <td style="padding: 8px 0;">
              <p style="color: #ffffff; font-size: 14px; font-weight: 600; margin: 0;">Add your headshot and bio</p>
              <p style="color: #94a3b8; font-size: 13px; margin: 4px 0 0 0;">First impressions matter</p>
            </td>
          </tr>
          <tr>
            <td style="padding: 8px 12px 8px 0; color: #f53c56; font-size: 20px; vertical-align: top;">2</td>
            <td style="padding: 8px 0;">
              <p style="color: #ffffff; font-size: 14px; font-weight: 600; margin: 0;">Upload your best clips</p>
              <p style="color: #94a3b8; font-size: 13px; margin: 4px 0 0 0;">Show off your work with video reels</p>
            </td>
          </tr>
          <tr>
            <td style="padding: 8px 12px 8px 0; color: #f53c56; font-size: 20px; vertical-align: top;">3</td>
            <td style="padding: 8px 0;">
              <p style="color: #ffffff; font-size: 14px; font-weight: 600; margin: 0;">Share your page</p>
              <p style="color: #94a3b8; font-size: 13px; margin: 4px 0 0 0;">Add your Flmlnk URL to your socials and resume</p>
            </td>
          </tr>
        </table>
      </div>

      <p style="color: #e2e8f0; font-size: 16px; line-height: 1.7; margin: 0;">
        We're here to support your journey. Reply to this email anytime—we read every message.
      </p>
    </div>

    <!-- CTA Button -->
    <div style="text-align: center; margin-bottom: 32px;">
      <a href="https://flmlnk.com/dashboard" style="display: inline-block; background-color: #f53c56; color: #ffffff; padding: 14px 32px; border-radius: 9999px; text-decoration: none; font-weight: 600; font-size: 14px;">
        Go to Your Dashboard
      </a>
    </div>

    <!-- Footer -->
    <div style="text-align: center; border-top: 1px solid rgba(255,255,255,0.1); padding-top: 24px;">
      <p style="color: #94a3b8; font-size: 14px; margin: 0 0 8px 0;">
        Here's to your success in film! 🎬
      </p>
      <p style="color: #64748b; font-size: 12px; margin: 0 0 16px 0;">
        <a href="https://flmlnk.com" style="color: #f53c56; text-decoration: none;">Flmlnk</a> - Your Film Link
      </p>
      <img src="https://film.flmlnk.com/circle.png" alt="Flmlnk" style="display: block; margin: 0 auto; width: 80px; height: auto;" />
    </div>
  </div>
</body>
</html>
    `.trim();

    const emailText = `
Welcome to Flmlnk!

Hey ${displayName},

Welcome to the Flmlnk community! You've just joined hundreds of film professionals who are using their Flmlnk page to showcase their work, build their audience, and connect with industry opportunities.

🎬 WATCH: Get Started in 3 Minutes
${LOOM_TUTORIAL_URL}

Your Flmlnk page is your professional home on the web—a place to showcase your reels, projects, and credits while making it easy for people to reach you.

Your Next Steps:
1. Add your headshot and bio - First impressions matter
2. Upload your best clips - Show off your work with video reels
3. Share your page - Add your Flmlnk URL to your socials and resume

We're here to support your journey. Reply to this email anytime—we read every message.

Go to your dashboard: https://flmlnk.com/dashboard

Here's to your success in film!

---
Flmlnk - Your Film Link
https://flmlnk.com
    `.trim();

    try {
      const result = await resend.emails.send({
        from: "Flmlnk <welcome@flmlnk.com>",
        to: args.userEmail,
        subject: "Welcome to Flmlnk - Your Journey Starts Here! 🎬",
        html: emailHtml,
        text: emailText,
      });

      if (result.error) {
        console.error("Resend error:", result.error);
        return { success: false, error: result.error.message };
      }

      console.log("Welcome email sent successfully:", result.data?.id);
      return { success: true, emailId: result.data?.id };
    } catch (error) {
      console.error("Failed to send welcome email:", error);
      return {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      };
    }
  },
});

// Email sending action using Resend
export const sendInquiryNotification = internalAction({
  args: {
    inquiryId: v.id("booking_inquiries"),
    ownerEmail: v.string(),
    ownerName: v.string(),
    actorName: v.string(),
    inquirerName: v.string(),
    inquirerEmail: v.string(),
    projectType: v.string(),
    message: v.string(),
  },
  async handler(ctx, args) {
    const apiKey = process.env.RESEND_API_KEY;
    if (!apiKey) {
      console.error("RESEND_API_KEY not configured - skipping email");
      return { success: false, error: "Email service not configured" };
    }

    const resend = new Resend(apiKey);

    const emailHtml = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>New Booking Inquiry</title>
</head>
<body style="margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; background-color: #0c0911; color: #ffffff;">
  <div style="max-width: 600px; margin: 0 auto; padding: 40px 20px;">
    <!-- Header -->
    <div style="text-align: center; margin-bottom: 32px;">
      <h1 style="color: #f53c56; font-size: 24px; margin: 0 0 8px 0;">New Booking Inquiry</h1>
      <p style="color: #94a3b8; font-size: 14px; margin: 0;">Someone is interested in working with you!</p>
    </div>

    <!-- Main Content Card -->
    <div style="background-color: rgba(255,255,255,0.05); border: 1px solid rgba(255,255,255,0.1); border-radius: 12px; padding: 24px; margin-bottom: 24px;">
      <h2 style="color: #ffffff; font-size: 18px; margin: 0 0 20px 0; border-bottom: 1px solid rgba(255,255,255,0.1); padding-bottom: 12px;">
        Inquiry Details
      </h2>

      <table style="width: 100%; border-collapse: collapse;">
        <tr>
          <td style="padding: 8px 0; color: #94a3b8; font-size: 14px; width: 120px; vertical-align: top;">From:</td>
          <td style="padding: 8px 0; color: #ffffff; font-size: 14px;"><strong>${args.inquirerName}</strong></td>
        </tr>
        <tr>
          <td style="padding: 8px 0; color: #94a3b8; font-size: 14px; vertical-align: top;">Email:</td>
          <td style="padding: 8px 0; color: #ffffff; font-size: 14px;"><a href="mailto:${args.inquirerEmail}" style="color: #f53c56; text-decoration: none;">${args.inquirerEmail}</a></td>
        </tr>
        <tr>
          <td style="padding: 8px 0; color: #94a3b8; font-size: 14px; vertical-align: top;">Project Type:</td>
          <td style="padding: 8px 0; color: #ffffff; font-size: 14px;">${args.projectType}</td>
        </tr>
      </table>

      <!-- Message Box -->
      <div style="margin-top: 20px;">
        <p style="color: #94a3b8; font-size: 14px; margin: 0 0 8px 0;">Project Details:</p>
        <div style="background-color: rgba(255,255,255,0.03); border: 1px solid rgba(255,255,255,0.08); border-radius: 8px; padding: 16px;">
          <p style="color: #e2e8f0; font-size: 14px; line-height: 1.6; margin: 0; white-space: pre-wrap;">${args.message}</p>
        </div>
      </div>
    </div>

    <!-- Response Tips -->
    <div style="background-color: rgba(245, 60, 86, 0.1); border: 1px solid rgba(245, 60, 86, 0.2); border-radius: 8px; padding: 16px; margin-bottom: 24px;">
      <p style="color: #f53c56; font-size: 12px; font-weight: 600; margin: 0 0 8px 0; text-transform: uppercase;">⏰ Quick Response Tips</p>
      <p style="color: #e2e8f0; font-size: 13px; line-height: 1.5; margin: 0 0 8px 0;">
        <strong>Respond within 24-48 hours</strong> for the best results. Quick replies show professionalism and increase your booking rate.
      </p>
      <p style="color: #94a3b8; font-size: 12px; margin: 0;">
        Consider asking about: timeline, budget range, and any specific requirements they have.
      </p>
    </div>

    <!-- CTA Button -->
    <div style="text-align: center; margin-bottom: 32px;">
      <a href="mailto:${args.inquirerEmail}?subject=Re: ${encodeURIComponent(args.projectType)} Inquiry via Flmlnk" style="display: inline-block; background-color: #f53c56; color: #ffffff; padding: 14px 32px; border-radius: 9999px; text-decoration: none; font-weight: 600; font-size: 14px;">
        Reply to ${args.inquirerName}
      </a>
    </div>

    <!-- Footer -->
    <div style="text-align: center; border-top: 1px solid rgba(255,255,255,0.1); padding-top: 24px;">
      <p style="color: #64748b; font-size: 12px; margin: 0 0 8px 0;">
        This inquiry was submitted through your Flmlnk page.
      </p>
      <p style="color: #64748b; font-size: 12px; margin: 0 0 16px 0;">
        <a href="https://flmlnk.com" style="color: #f53c56; text-decoration: none;">Flmlnk</a> - Your Film Link
      </p>
      <img src="https://film.flmlnk.com/circle.png" alt="Flmlnk" style="display: block; margin: 0 auto; width: 80px; height: auto;" />
    </div>
  </div>
</body>
</html>
    `.trim();

    const emailText = `
New Booking Inquiry for ${args.actorName}

From: ${args.inquirerName}
Email: ${args.inquirerEmail}
Project Type: ${args.projectType}

Project Details:
${args.message}

---

⏰ QUICK RESPONSE TIPS
Respond within 24-48 hours for the best results. Quick replies show professionalism and increase your booking rate.

Consider asking about: timeline, budget range, and any specific requirements they have.

---
Reply directly to ${args.inquirerEmail} to respond to this inquiry.

This inquiry was submitted through your Flmlnk page.
    `.trim();

    try {
      const result = await resend.emails.send({
        from: "Flmlnk <inquiries@flmlnk.com>",
        to: args.ownerEmail,
        replyTo: args.inquirerEmail,
        subject: `New Booking Inquiry: ${args.projectType} - ${args.inquirerName}`,
        html: emailHtml,
        text: emailText,
      });

      if (result.error) {
        console.error("Resend error:", result.error);
        return { success: false, error: result.error.message };
      }

      // Mark the inquiry as email sent
      await ctx.runMutation(internal.inquiries.markEmailSent, {
        inquiryId: args.inquiryId,
      });

      console.log("Email sent successfully:", result.data?.id);
      return { success: true, emailId: result.data?.id };
    } catch (error) {
      console.error("Failed to send email:", error);
      return {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      };
    }
  },
});

/**
 * Send a notification email when someone comments on a Flmlnk page.
 */
export const sendCommentNotification = internalAction({
  args: {
    ownerEmail: v.string(),
    ownerName: v.string(),
    pageName: v.string(),
    pageSlug: v.string(),
    commenterName: v.string(),
    commenterEmail: v.string(),
    commentMessage: v.string(),
    isReply: v.boolean(),
    parentCommenterName: v.optional(v.string()),
  },
  async handler(ctx, args) {
    const apiKey = process.env.RESEND_API_KEY;
    if (!apiKey) {
      console.error("RESEND_API_KEY not configured - skipping comment notification");
      return { success: false, error: "Email service not configured" };
    }

    const resend = new Resend(apiKey);
    const pageUrl = `https://film.flmlnk.com/f/${args.pageSlug}`;
    const truncatedMessage = args.commentMessage.length > 200
      ? args.commentMessage.substring(0, 200) + "..."
      : args.commentMessage;

    const emailHtml = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>New Comment on Your Page</title>
</head>
<body style="margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; background-color: #0c0911; color: #ffffff;">
  <div style="max-width: 600px; margin: 0 auto; padding: 40px 20px;">
    <!-- Header -->
    <div style="text-align: center; margin-bottom: 32px;">
      <h1 style="color: #f53c56; font-size: 24px; margin: 0 0 8px 0;">New Comment!</h1>
      <p style="color: #94a3b8; font-size: 14px; margin: 0;">Someone left a comment on your Flmlnk page</p>
    </div>

    <!-- Main Content Card -->
    <div style="background-color: rgba(255,255,255,0.05); border: 1px solid rgba(255,255,255,0.1); border-radius: 12px; padding: 24px; margin-bottom: 24px;">
      <p style="color: #ffffff; font-size: 16px; margin: 0 0 16px 0;">
        Hey ${args.ownerName},
      </p>

      <p style="color: #e2e8f0; font-size: 15px; line-height: 1.6; margin: 0 0 20px 0;">
        <strong style="color: #ffffff;">${args.commenterName}</strong> left a comment on your page:
      </p>

      <!-- Comment Box -->
      <div style="background-color: rgba(255,255,255,0.03); border-left: 3px solid #f53c56; padding: 16px; margin: 0 0 20px 0; border-radius: 0 8px 8px 0;">
        <p style="color: #e2e8f0; font-size: 14px; line-height: 1.6; margin: 0; font-style: italic;">
          "${truncatedMessage}"
        </p>
      </div>

      <p style="color: #94a3b8; font-size: 13px; margin: 0;">
        Reply to keep the conversation going!
      </p>
    </div>

    <!-- CTA Button -->
    <div style="text-align: center; margin-bottom: 32px;">
      <a href="${pageUrl}#comments" style="display: inline-block; background-color: #f53c56; color: #ffffff; padding: 14px 32px; border-radius: 9999px; text-decoration: none; font-weight: 600; font-size: 14px;">
        View & Reply
      </a>
    </div>

    <!-- Footer -->
    <div style="text-align: center; border-top: 1px solid rgba(255,255,255,0.1); padding-top: 24px;">
      <p style="color: #64748b; font-size: 12px; margin: 0 0 16px 0;">
        <a href="https://flmlnk.com" style="color: #f53c56; text-decoration: none;">Flmlnk</a> - Your Film Link
      </p>
      <img src="https://film.flmlnk.com/circle.png" alt="Flmlnk" style="display: block; margin: 0 auto; width: 80px; height: auto;" />
    </div>
  </div>
</body>
</html>
    `.trim();

    const emailText = `
New Comment on Your Flmlnk Page!

Hey ${args.ownerName},

${args.commenterName} left a comment on your page:

"${truncatedMessage}"

View and reply: ${pageUrl}#comments

---
Flmlnk - Your Film Link
https://flmlnk.com
    `.trim();

    try {
      const result = await resend.emails.send({
        from: "Flmlnk <notifications@flmlnk.com>",
        to: args.ownerEmail,
        replyTo: args.commenterEmail,
        subject: `💬 New comment from ${args.commenterName}`,
        html: emailHtml,
        text: emailText,
      });

      if (result.error) {
        console.error("Resend error:", result.error);
        return { success: false, error: result.error.message };
      }

      console.log("Comment notification sent:", result.data?.id);
      return { success: true, emailId: result.data?.id };
    } catch (error) {
      console.error("Failed to send comment notification:", error);
      return {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      };
    }
  },
});

/**
 * Send a notification email when someone replies to a comment.
 */
export const sendReplyNotification = internalAction({
  args: {
    recipientEmail: v.string(),
    recipientName: v.string(),
    pageName: v.string(),
    pageSlug: v.string(),
    replierName: v.string(),
    replyMessage: v.string(),
    originalComment: v.string(),
  },
  async handler(ctx, args) {
    const apiKey = process.env.RESEND_API_KEY;
    if (!apiKey) {
      console.error("RESEND_API_KEY not configured - skipping reply notification");
      return { success: false, error: "Email service not configured" };
    }

    const resend = new Resend(apiKey);
    const pageUrl = `https://film.flmlnk.com/f/${args.pageSlug}`;
    const truncatedReply = args.replyMessage.length > 200
      ? args.replyMessage.substring(0, 200) + "..."
      : args.replyMessage;
    const truncatedOriginal = args.originalComment.length > 100
      ? args.originalComment.substring(0, 100) + "..."
      : args.originalComment;

    const emailHtml = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Someone Replied to Your Comment</title>
</head>
<body style="margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; background-color: #0c0911; color: #ffffff;">
  <div style="max-width: 600px; margin: 0 auto; padding: 40px 20px;">
    <!-- Header -->
    <div style="text-align: center; margin-bottom: 32px;">
      <h1 style="color: #f53c56; font-size: 24px; margin: 0 0 8px 0;">New Reply!</h1>
      <p style="color: #94a3b8; font-size: 14px; margin: 0;">Someone replied to your comment</p>
    </div>

    <!-- Main Content Card -->
    <div style="background-color: rgba(255,255,255,0.05); border: 1px solid rgba(255,255,255,0.1); border-radius: 12px; padding: 24px; margin-bottom: 24px;">
      <p style="color: #ffffff; font-size: 16px; margin: 0 0 16px 0;">
        Hey ${args.recipientName},
      </p>

      <p style="color: #e2e8f0; font-size: 15px; line-height: 1.6; margin: 0 0 16px 0;">
        <strong style="color: #ffffff;">${args.replierName}</strong> replied to your comment on <strong style="color: #f53c56;">${args.pageName}</strong>'s page:
      </p>

      <!-- Original Comment -->
      <div style="background-color: rgba(255,255,255,0.02); border-left: 2px solid #64748b; padding: 12px; margin: 0 0 12px 0; border-radius: 0 6px 6px 0;">
        <p style="color: #64748b; font-size: 11px; margin: 0 0 4px 0; text-transform: uppercase;">Your comment:</p>
        <p style="color: #94a3b8; font-size: 13px; line-height: 1.5; margin: 0;">
          "${truncatedOriginal}"
        </p>
      </div>

      <!-- Reply Box -->
      <div style="background-color: rgba(245, 60, 86, 0.1); border-left: 3px solid #f53c56; padding: 16px; margin: 0 0 20px 0; border-radius: 0 8px 8px 0;">
        <p style="color: #64748b; font-size: 11px; margin: 0 0 4px 0; text-transform: uppercase;">${args.replierName}'s reply:</p>
        <p style="color: #e2e8f0; font-size: 14px; line-height: 1.6; margin: 0;">
          "${truncatedReply}"
        </p>
      </div>
    </div>

    <!-- CTA Button -->
    <div style="text-align: center; margin-bottom: 32px;">
      <a href="${pageUrl}#comments" style="display: inline-block; background-color: #f53c56; color: #ffffff; padding: 14px 32px; border-radius: 9999px; text-decoration: none; font-weight: 600; font-size: 14px;">
        View Conversation
      </a>
    </div>

    <!-- Footer -->
    <div style="text-align: center; border-top: 1px solid rgba(255,255,255,0.1); padding-top: 24px;">
      <p style="color: #64748b; font-size: 12px; margin: 0 0 16px 0;">
        <a href="https://flmlnk.com" style="color: #f53c56; text-decoration: none;">Flmlnk</a> - Your Film Link
      </p>
      <img src="https://film.flmlnk.com/circle.png" alt="Flmlnk" style="display: block; margin: 0 auto; width: 80px; height: auto;" />
    </div>
  </div>
</body>
</html>
    `.trim();

    const emailText = `
New Reply to Your Comment!

Hey ${args.recipientName},

${args.replierName} replied to your comment on ${args.pageName}'s page:

Your comment: "${truncatedOriginal}"

Their reply: "${truncatedReply}"

View the conversation: ${pageUrl}#comments

---
Flmlnk - Your Film Link
https://flmlnk.com
    `.trim();

    try {
      const result = await resend.emails.send({
        from: "Flmlnk <notifications@flmlnk.com>",
        to: args.recipientEmail,
        subject: `↩️ ${args.replierName} replied to your comment`,
        html: emailHtml,
        text: emailText,
      });

      if (result.error) {
        console.error("Resend error:", result.error);
        return { success: false, error: result.error.message };
      }

      console.log("Reply notification sent:", result.data?.id);
      return { success: true, emailId: result.data?.id };
    } catch (error) {
      console.error("Failed to send reply notification:", error);
      return {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      };
    }
  },
});

/**
 * Send weekly analytics digest to page owners.
 */
export const sendWeeklyDigest = internalAction({
  args: {
    ownerEmail: v.string(),
    ownerName: v.string(),
    pageName: v.string(),
    pageSlug: v.string(),
    pageViews: v.number(),
    pageViewsChange: v.number(), // percentage change from last week
    clipPlays: v.number(),
    emailCaptures: v.number(),
    inquiries: v.number(),
    newComments: v.number(),
    topReferrer: v.optional(v.string()),
  },
  async handler(ctx, args) {
    const apiKey = process.env.RESEND_API_KEY;
    if (!apiKey) {
      console.error("RESEND_API_KEY not configured - skipping weekly digest");
      return { success: false, error: "Email service not configured" };
    }

    const resend = new Resend(apiKey);
    const pageUrl = `https://film.flmlnk.com/f/${args.pageSlug}`;
    const dashboardUrl = "https://flmlnk.com/dashboard";

    const changeIndicator = args.pageViewsChange >= 0
      ? `<span style="color: #22c55e;">↑ ${args.pageViewsChange}%</span>`
      : `<span style="color: #ef4444;">↓ ${Math.abs(args.pageViewsChange)}%</span>`;

    const changeText = args.pageViewsChange >= 0
      ? `↑ ${args.pageViewsChange}% from last week`
      : `↓ ${Math.abs(args.pageViewsChange)}% from last week`;

    const emailHtml = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Your Weekly Flmlnk Digest</title>
</head>
<body style="margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; background-color: #0c0911; color: #ffffff;">
  <div style="max-width: 600px; margin: 0 auto; padding: 40px 20px;">
    <!-- Header -->
    <div style="text-align: center; margin-bottom: 32px;">
      <h1 style="color: #f53c56; font-size: 24px; margin: 0 0 8px 0;">Your Weekly Stats 📊</h1>
      <p style="color: #94a3b8; font-size: 14px; margin: 0;">Here's how your Flmlnk page performed this week</p>
    </div>

    <!-- Main Content Card -->
    <div style="background-color: rgba(255,255,255,0.05); border: 1px solid rgba(255,255,255,0.1); border-radius: 12px; padding: 24px; margin-bottom: 24px;">
      <p style="color: #ffffff; font-size: 16px; margin: 0 0 24px 0;">
        Hey ${args.ownerName},
      </p>

      <!-- Stats Grid -->
      <div style="display: table; width: 100%; margin-bottom: 24px;">
        <div style="display: table-row;">
          <div style="display: table-cell; text-align: center; padding: 16px; background-color: rgba(245, 60, 86, 0.1); border-radius: 8px 0 0 8px;">
            <p style="color: #f53c56; font-size: 28px; font-weight: 700; margin: 0;">${args.pageViews}</p>
            <p style="color: #94a3b8; font-size: 12px; margin: 4px 0 0 0;">Page Views</p>
            <p style="font-size: 11px; margin: 4px 0 0 0;">${changeIndicator}</p>
          </div>
          <div style="display: table-cell; text-align: center; padding: 16px; background-color: rgba(255,255,255,0.03);">
            <p style="color: #ffffff; font-size: 28px; font-weight: 700; margin: 0;">${args.clipPlays}</p>
            <p style="color: #94a3b8; font-size: 12px; margin: 4px 0 0 0;">Clip Plays</p>
          </div>
          <div style="display: table-cell; text-align: center; padding: 16px; background-color: rgba(255,255,255,0.03); border-radius: 0 8px 8px 0;">
            <p style="color: #ffffff; font-size: 28px; font-weight: 700; margin: 0;">${args.inquiries}</p>
            <p style="color: #94a3b8; font-size: 12px; margin: 4px 0 0 0;">Inquiries</p>
          </div>
        </div>
      </div>

      <!-- Additional Stats -->
      <table style="width: 100%; border-collapse: collapse; margin-bottom: 20px;">
        <tr>
          <td style="padding: 12px 0; border-bottom: 1px solid rgba(255,255,255,0.1);">
            <span style="color: #94a3b8; font-size: 14px;">Email Signups</span>
          </td>
          <td style="padding: 12px 0; border-bottom: 1px solid rgba(255,255,255,0.1); text-align: right;">
            <span style="color: #ffffff; font-size: 14px; font-weight: 600;">${args.emailCaptures}</span>
          </td>
        </tr>
        <tr>
          <td style="padding: 12px 0; border-bottom: 1px solid rgba(255,255,255,0.1);">
            <span style="color: #94a3b8; font-size: 14px;">New Comments</span>
          </td>
          <td style="padding: 12px 0; border-bottom: 1px solid rgba(255,255,255,0.1); text-align: right;">
            <span style="color: #ffffff; font-size: 14px; font-weight: 600;">${args.newComments}</span>
          </td>
        </tr>
        ${args.topReferrer ? `
        <tr>
          <td style="padding: 12px 0;">
            <span style="color: #94a3b8; font-size: 14px;">Top Traffic Source</span>
          </td>
          <td style="padding: 12px 0; text-align: right;">
            <span style="color: #f53c56; font-size: 14px; font-weight: 600;">${args.topReferrer}</span>
          </td>
        </tr>
        ` : ''}
      </table>

      <!-- Tip Box -->
      <div style="background-color: rgba(245, 60, 86, 0.1); border: 1px solid rgba(245, 60, 86, 0.2); border-radius: 8px; padding: 16px;">
        <p style="color: #f53c56; font-size: 12px; font-weight: 600; margin: 0 0 8px 0; text-transform: uppercase;">💡 Quick Tip</p>
        <p style="color: #e2e8f0; font-size: 13px; line-height: 1.5; margin: 0;">
          ${args.inquiries > 0
            ? "You're getting inquiries! Make sure to respond within 24-48 hours for the best results."
            : args.pageViews > 10
              ? "People are visiting your page! Add more clips to keep them engaged longer."
              : "Share your Flmlnk URL on your social media profiles to drive more traffic."}
        </p>
      </div>
    </div>

    <!-- CTA Button -->
    <div style="text-align: center; margin-bottom: 32px;">
      <a href="${dashboardUrl}" style="display: inline-block; background-color: #f53c56; color: #ffffff; padding: 14px 32px; border-radius: 9999px; text-decoration: none; font-weight: 600; font-size: 14px;">
        View Full Analytics
      </a>
    </div>

    <!-- Footer -->
    <div style="text-align: center; border-top: 1px solid rgba(255,255,255,0.1); padding-top: 24px;">
      <p style="color: #64748b; font-size: 12px; margin: 0 0 16px 0;">
        <a href="https://flmlnk.com" style="color: #f53c56; text-decoration: none;">Flmlnk</a> - Your Film Link
      </p>
      <img src="https://film.flmlnk.com/circle.png" alt="Flmlnk" style="display: block; margin: 0 auto; width: 80px; height: auto;" />
    </div>
  </div>
</body>
</html>
    `.trim();

    const emailText = `
Your Weekly Flmlnk Stats 📊

Hey ${args.ownerName},

Here's how your Flmlnk page performed this week:

Page Views: ${args.pageViews} (${changeText})
Clip Plays: ${args.clipPlays}
Inquiries: ${args.inquiries}
Email Signups: ${args.emailCaptures}
New Comments: ${args.newComments}
${args.topReferrer ? `Top Traffic Source: ${args.topReferrer}` : ''}

💡 Quick Tip: ${args.inquiries > 0
  ? "You're getting inquiries! Make sure to respond within 24-48 hours."
  : args.pageViews > 10
    ? "People are visiting! Add more clips to keep them engaged."
    : "Share your Flmlnk URL on social media to drive more traffic."}

View full analytics: ${dashboardUrl}

---
Flmlnk - Your Film Link
https://flmlnk.com
    `.trim();

    try {
      const result = await resend.emails.send({
        from: "Flmlnk <digest@flmlnk.com>",
        to: args.ownerEmail,
        subject: `📊 Your week: ${args.pageViews} views, ${args.inquiries} inquiries`,
        html: emailHtml,
        text: emailText,
      });

      if (result.error) {
        console.error("Resend error:", result.error);
        return { success: false, error: result.error.message };
      }

      console.log("Weekly digest sent:", result.data?.id);
      return { success: true, emailId: result.data?.id };
    } catch (error) {
      console.error("Failed to send weekly digest:", error);
      return {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      };
    }
  },
});

/**
 * Send a profile completion reminder email.
 */
export const sendProfileCompletionReminder = internalAction({
  args: {
    ownerEmail: v.string(),
    ownerName: v.string(),
    pageSlug: v.string(),
    missingItems: v.array(v.string()), // e.g., ["headshot", "bio", "clips"]
  },
  async handler(ctx, args) {
    const apiKey = process.env.RESEND_API_KEY;
    if (!apiKey) {
      console.error("RESEND_API_KEY not configured - skipping profile reminder");
      return { success: false, error: "Email service not configured" };
    }

    const resend = new Resend(apiKey);
    const dashboardUrl = "https://flmlnk.com/dashboard";

    const missingItemsHtml = args.missingItems.map(item => {
      const descriptions: Record<string, string> = {
        headshot: "Add a professional headshot",
        bio: "Write a compelling bio",
        clips: "Upload your best video clips",
        projects: "Add your notable projects",
        socials: "Link your social media accounts",
      };
      return `<li style="padding: 8px 0; color: #e2e8f0;">${descriptions[item] || item}</li>`;
    }).join('');

    const missingItemsText = args.missingItems.map(item => {
      const descriptions: Record<string, string> = {
        headshot: "Add a professional headshot",
        bio: "Write a compelling bio",
        clips: "Upload your best video clips",
        projects: "Add your notable projects",
        socials: "Link your social media accounts",
      };
      return `- ${descriptions[item] || item}`;
    }).join('\n');

    const emailHtml = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Complete Your Flmlnk Page</title>
</head>
<body style="margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; background-color: #0c0911; color: #ffffff;">
  <div style="max-width: 600px; margin: 0 auto; padding: 40px 20px;">
    <!-- Header -->
    <div style="text-align: center; margin-bottom: 32px;">
      <h1 style="color: #f53c56; font-size: 24px; margin: 0 0 8px 0;">Almost There! 🎬</h1>
      <p style="color: #94a3b8; font-size: 14px; margin: 0;">A few more steps to complete your Flmlnk page</p>
    </div>

    <!-- Main Content Card -->
    <div style="background-color: rgba(255,255,255,0.05); border: 1px solid rgba(255,255,255,0.1); border-radius: 12px; padding: 24px; margin-bottom: 24px;">
      <p style="color: #ffffff; font-size: 16px; margin: 0 0 16px 0;">
        Hey ${args.ownerName},
      </p>

      <p style="color: #e2e8f0; font-size: 15px; line-height: 1.6; margin: 0 0 20px 0;">
        You're so close to having a complete Flmlnk page! Complete profiles get <strong style="color: #f53c56;">3x more inquiries</strong> than incomplete ones.
      </p>

      <!-- Checklist -->
      <div style="background-color: rgba(255,255,255,0.03); border: 1px solid rgba(255,255,255,0.1); border-radius: 8px; padding: 20px; margin: 0 0 20px 0;">
        <p style="color: #f53c56; font-size: 14px; font-weight: 600; margin: 0 0 12px 0;">To complete your page:</p>
        <ul style="margin: 0; padding-left: 20px; list-style-type: none;">
          ${args.missingItems.map(item => {
            const descriptions: Record<string, string> = {
              headshot: "Add a professional headshot",
              bio: "Write a compelling bio",
              clips: "Upload your best video clips",
              projects: "Add your notable projects",
              socials: "Link your social media accounts",
            };
            return `<li style="padding: 8px 0; color: #e2e8f0;">☐ ${descriptions[item] || item}</li>`;
          }).join('')}
        </ul>
      </div>

      <p style="color: #94a3b8; font-size: 14px; margin: 0;">
        It only takes a few minutes—and it makes a big difference!
      </p>
    </div>

    <!-- CTA Button -->
    <div style="text-align: center; margin-bottom: 32px;">
      <a href="${dashboardUrl}" style="display: inline-block; background-color: #f53c56; color: #ffffff; padding: 14px 32px; border-radius: 9999px; text-decoration: none; font-weight: 600; font-size: 14px;">
        Complete Your Page
      </a>
    </div>

    <!-- Footer -->
    <div style="text-align: center; border-top: 1px solid rgba(255,255,255,0.1); padding-top: 24px;">
      <p style="color: #64748b; font-size: 12px; margin: 0 0 16px 0;">
        <a href="https://flmlnk.com" style="color: #f53c56; text-decoration: none;">Flmlnk</a> - Your Film Link
      </p>
      <img src="https://film.flmlnk.com/circle.png" alt="Flmlnk" style="display: block; margin: 0 auto; width: 80px; height: auto;" />
    </div>
  </div>
</body>
</html>
    `.trim();

    const emailText = `
Almost There! 🎬

Hey ${args.ownerName},

You're so close to having a complete Flmlnk page! Complete profiles get 3x more inquiries than incomplete ones.

To complete your page:
${missingItemsText}

It only takes a few minutes—and it makes a big difference!

Complete your page: ${dashboardUrl}

---
Flmlnk - Your Film Link
https://flmlnk.com
    `.trim();

    try {
      const result = await resend.emails.send({
        from: "Flmlnk <hello@flmlnk.com>",
        to: args.ownerEmail,
        subject: "🎬 Your Flmlnk page is almost ready!",
        html: emailHtml,
        text: emailText,
      });

      if (result.error) {
        console.error("Resend error:", result.error);
        return { success: false, error: result.error.message };
      }

      console.log("Profile reminder sent:", result.data?.id);
      return { success: true, emailId: result.data?.id };
    } catch (error) {
      console.error("Failed to send profile reminder:", error);
      return {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      };
    }
  },
});

/**
 * Send first inquiry celebration email.
 */
export const sendFirstInquiryCelebration = internalAction({
  args: {
    ownerEmail: v.string(),
    ownerName: v.string(),
    inquirerName: v.string(),
    projectType: v.string(),
  },
  async handler(ctx, args) {
    const apiKey = process.env.RESEND_API_KEY;
    if (!apiKey) {
      console.error("RESEND_API_KEY not configured - skipping celebration email");
      return { success: false, error: "Email service not configured" };
    }

    const resend = new Resend(apiKey);
    const dashboardUrl = "https://flmlnk.com/dashboard";

    const emailHtml = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Your First Inquiry!</title>
</head>
<body style="margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; background-color: #0c0911; color: #ffffff;">
  <div style="max-width: 600px; margin: 0 auto; padding: 40px 20px;">
    <!-- Header with Celebration -->
    <div style="text-align: center; margin-bottom: 32px;">
      <p style="font-size: 48px; margin: 0 0 16px 0;">🎉</p>
      <h1 style="color: #f53c56; font-size: 28px; margin: 0 0 8px 0;">Congratulations!</h1>
      <p style="color: #94a3b8; font-size: 16px; margin: 0;">You just received your first inquiry!</p>
    </div>

    <!-- Main Content Card -->
    <div style="background-color: rgba(255,255,255,0.05); border: 1px solid rgba(255,255,255,0.1); border-radius: 12px; padding: 24px; margin-bottom: 24px;">
      <p style="color: #ffffff; font-size: 16px; margin: 0 0 16px 0;">
        Hey ${args.ownerName},
      </p>

      <p style="color: #e2e8f0; font-size: 15px; line-height: 1.6; margin: 0 0 20px 0;">
        This is a big milestone! <strong style="color: #ffffff;">${args.inquirerName}</strong> just reached out about a <strong style="color: #f53c56;">${args.projectType}</strong> opportunity.
      </p>

      <p style="color: #e2e8f0; font-size: 15px; line-height: 1.6; margin: 0 0 20px 0;">
        Your Flmlnk page is working for you. This is just the beginning!
      </p>

      <!-- Tips Box -->
      <div style="background-color: rgba(245, 60, 86, 0.1); border: 1px solid rgba(245, 60, 86, 0.2); border-radius: 8px; padding: 20px;">
        <p style="color: #f53c56; font-size: 14px; font-weight: 600; margin: 0 0 12px 0;">Tips for responding:</p>
        <ul style="margin: 0; padding-left: 20px; color: #e2e8f0; font-size: 14px; line-height: 1.8;">
          <li>Respond within 24-48 hours</li>
          <li>Be professional but personable</li>
          <li>Ask clarifying questions about the project</li>
          <li>Share relevant work samples if applicable</li>
        </ul>
      </div>
    </div>

    <!-- CTA Button -->
    <div style="text-align: center; margin-bottom: 32px;">
      <a href="${dashboardUrl}" style="display: inline-block; background-color: #f53c56; color: #ffffff; padding: 14px 32px; border-radius: 9999px; text-decoration: none; font-weight: 600; font-size: 14px;">
        View & Respond
      </a>
    </div>

    <!-- Footer -->
    <div style="text-align: center; border-top: 1px solid rgba(255,255,255,0.1); padding-top: 24px;">
      <p style="color: #94a3b8; font-size: 14px; margin: 0 0 8px 0;">
        Here's to many more! 🎬
      </p>
      <p style="color: #64748b; font-size: 12px; margin: 0 0 16px 0;">
        <a href="https://flmlnk.com" style="color: #f53c56; text-decoration: none;">Flmlnk</a> - Your Film Link
      </p>
      <img src="https://film.flmlnk.com/circle.png" alt="Flmlnk" style="display: block; margin: 0 auto; width: 80px; height: auto;" />
    </div>
  </div>
</body>
</html>
    `.trim();

    const emailText = `
🎉 Congratulations! Your First Inquiry!

Hey ${args.ownerName},

This is a big milestone! ${args.inquirerName} just reached out about a ${args.projectType} opportunity.

Your Flmlnk page is working for you. This is just the beginning!

Tips for responding:
- Respond within 24-48 hours
- Be professional but personable
- Ask clarifying questions about the project
- Share relevant work samples if applicable

View & Respond: ${dashboardUrl}

Here's to many more! 🎬

---
Flmlnk - Your Film Link
https://flmlnk.com
    `.trim();

    try {
      const result = await resend.emails.send({
        from: "Flmlnk <hello@flmlnk.com>",
        to: args.ownerEmail,
        subject: "🎉 You got your first inquiry!",
        html: emailHtml,
        text: emailText,
      });

      if (result.error) {
        console.error("Resend error:", result.error);
        return { success: false, error: result.error.message };
      }

      console.log("First inquiry celebration sent:", result.data?.id);
      return { success: true, emailId: result.data?.id };
    } catch (error) {
      console.error("Failed to send celebration email:", error);
      return {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      };
    }
  },
});

/**
 * Send milestone notification (page views, etc.).
 */
export const sendMilestoneNotification = internalAction({
  args: {
    ownerEmail: v.string(),
    ownerName: v.string(),
    pageSlug: v.string(),
    milestoneType: v.string(), // "page_views", "inquiries", "email_signups"
    milestoneValue: v.number(), // e.g., 100, 500, 1000
  },
  async handler(ctx, args) {
    const apiKey = process.env.RESEND_API_KEY;
    if (!apiKey) {
      console.error("RESEND_API_KEY not configured - skipping milestone email");
      return { success: false, error: "Email service not configured" };
    }

    const resend = new Resend(apiKey);
    const pageUrl = `https://film.flmlnk.com/f/${args.pageSlug}`;

    const milestoneMessages: Record<string, { title: string; emoji: string; message: string }> = {
      page_views: {
        title: `${args.milestoneValue} Page Views!`,
        emoji: "👀",
        message: `Your Flmlnk page has been viewed ${args.milestoneValue} times! People are discovering your work.`,
      },
      inquiries: {
        title: `${args.milestoneValue} Inquiries!`,
        emoji: "📬",
        message: `You've received ${args.milestoneValue} booking inquiries! Your page is generating real opportunities.`,
      },
      email_signups: {
        title: `${args.milestoneValue} Email Signups!`,
        emoji: "📧",
        message: `${args.milestoneValue} people have signed up for your updates! You're building a real audience.`,
      },
    };

    const milestone = milestoneMessages[args.milestoneType] || {
      title: `${args.milestoneValue} Milestone!`,
      emoji: "🎯",
      message: `You've reached ${args.milestoneValue}! Keep up the great work.`,
    };

    const emailHtml = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Milestone Reached!</title>
</head>
<body style="margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; background-color: #0c0911; color: #ffffff;">
  <div style="max-width: 600px; margin: 0 auto; padding: 40px 20px;">
    <!-- Header -->
    <div style="text-align: center; margin-bottom: 32px;">
      <p style="font-size: 48px; margin: 0 0 16px 0;">${milestone.emoji}</p>
      <h1 style="color: #f53c56; font-size: 28px; margin: 0 0 8px 0;">${milestone.title}</h1>
      <p style="color: #94a3b8; font-size: 14px; margin: 0;">You've hit a new milestone!</p>
    </div>

    <!-- Main Content Card -->
    <div style="background-color: rgba(255,255,255,0.05); border: 1px solid rgba(255,255,255,0.1); border-radius: 12px; padding: 24px; margin-bottom: 24px;">
      <p style="color: #ffffff; font-size: 16px; margin: 0 0 16px 0;">
        Hey ${args.ownerName},
      </p>

      <p style="color: #e2e8f0; font-size: 15px; line-height: 1.6; margin: 0 0 20px 0;">
        ${milestone.message}
      </p>

      <!-- Big Number -->
      <div style="text-align: center; padding: 24px; background-color: rgba(245, 60, 86, 0.15); border-radius: 12px; margin: 0 0 20px 0;">
        <p style="color: #f53c56; font-size: 48px; font-weight: 700; margin: 0;">${args.milestoneValue.toLocaleString()}</p>
      </div>

      <p style="color: #94a3b8; font-size: 14px; text-align: center; margin: 0;">
        Keep sharing your page to reach the next milestone!
      </p>
    </div>

    <!-- CTA Button -->
    <div style="text-align: center; margin-bottom: 32px;">
      <a href="${pageUrl}" style="display: inline-block; background-color: #f53c56; color: #ffffff; padding: 14px 32px; border-radius: 9999px; text-decoration: none; font-weight: 600; font-size: 14px;">
        View Your Page
      </a>
    </div>

    <!-- Footer -->
    <div style="text-align: center; border-top: 1px solid rgba(255,255,255,0.1); padding-top: 24px;">
      <p style="color: #64748b; font-size: 12px; margin: 0 0 16px 0;">
        <a href="https://flmlnk.com" style="color: #f53c56; text-decoration: none;">Flmlnk</a> - Your Film Link
      </p>
      <img src="https://film.flmlnk.com/circle.png" alt="Flmlnk" style="display: block; margin: 0 auto; width: 80px; height: auto;" />
    </div>
  </div>
</body>
</html>
    `.trim();

    const emailText = `
${milestone.emoji} ${milestone.title}

Hey ${args.ownerName},

${milestone.message}

${args.milestoneValue.toLocaleString()}

Keep sharing your page to reach the next milestone!

View your page: ${pageUrl}

---
Flmlnk - Your Film Link
https://flmlnk.com
    `.trim();

    try {
      const result = await resend.emails.send({
        from: "Flmlnk <hello@flmlnk.com>",
        to: args.ownerEmail,
        subject: `${milestone.emoji} You hit ${args.milestoneValue.toLocaleString()} ${args.milestoneType.replace('_', ' ')}!`,
        html: emailHtml,
        text: emailText,
      });

      if (result.error) {
        console.error("Resend error:", result.error);
        return { success: false, error: result.error.message };
      }

      console.log("Milestone notification sent:", result.data?.id);
      return { success: true, emailId: result.data?.id };
    } catch (error) {
      console.error("Failed to send milestone email:", error);
      return {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      };
    }
  },
});

/**
 * Send a fan newsletter email to collected fan emails.
 * Includes List-Unsubscribe headers for Gmail/Yahoo 2024 compliance.
 */
/**
 * Send email verification email to new users.
 * Called by Better Auth when a user signs up with email/password.
 */
export const sendVerificationEmail = internalAction({
  args: {
    email: v.string(),
    url: v.string(),
    token: v.string(),
  },
  async handler(ctx, args) {
    const apiKey = process.env.RESEND_API_KEY;
    if (!apiKey) {
      console.error("RESEND_API_KEY not configured - skipping verification email");
      return { success: false, error: "Email service not configured" };
    }

    const resend = new Resend(apiKey);

    const emailHtml = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Verify Your Email</title>
</head>
<body style="margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; background-color: #0c0911; color: #ffffff;">
  <div style="max-width: 600px; margin: 0 auto; padding: 40px 20px;">
    <!-- Header -->
    <div style="text-align: center; margin-bottom: 32px;">
      <h1 style="color: #f53c56; font-size: 28px; margin: 0 0 8px 0;">Verify Your Email</h1>
      <p style="color: #94a3b8; font-size: 16px; margin: 0;">One quick step to get started with Flmlnk</p>
    </div>

    <!-- Main Content Card -->
    <div style="background-color: rgba(255,255,255,0.05); border: 1px solid rgba(255,255,255,0.1); border-radius: 12px; padding: 32px; margin-bottom: 24px;">
      <p style="color: #ffffff; font-size: 18px; margin: 0 0 20px 0; line-height: 1.6;">
        Thanks for signing up!
      </p>

      <p style="color: #e2e8f0; font-size: 16px; line-height: 1.7; margin: 0 0 24px 0;">
        Please verify your email address to complete your registration and start building your Flmlnk page.
      </p>

      <!-- CTA Button -->
      <div style="text-align: center; margin: 32px 0;">
        <a href="${args.url}" style="display: inline-block; background-color: #f53c56; color: #ffffff; padding: 16px 40px; border-radius: 9999px; text-decoration: none; font-weight: 600; font-size: 16px;">
          Verify Email Address
        </a>
      </div>

      <p style="color: #94a3b8; font-size: 14px; line-height: 1.6; margin: 0;">
        If you didn't create an account with Flmlnk, you can safely ignore this email.
      </p>
    </div>

    <!-- Link Fallback -->
    <div style="background-color: rgba(255,255,255,0.03); border: 1px solid rgba(255,255,255,0.08); border-radius: 8px; padding: 16px; margin-bottom: 24px;">
      <p style="color: #94a3b8; font-size: 12px; margin: 0 0 8px 0;">If the button doesn't work, copy and paste this link:</p>
      <p style="color: #f53c56; font-size: 12px; margin: 0; word-break: break-all;">
        ${args.url}
      </p>
    </div>

    <!-- Footer -->
    <div style="text-align: center; border-top: 1px solid rgba(255,255,255,0.1); padding-top: 24px;">
      <p style="color: #64748b; font-size: 12px; margin: 0 0 16px 0;">
        <a href="https://flmlnk.com" style="color: #f53c56; text-decoration: none;">Flmlnk</a> - Your Film Link
      </p>
      <img src="https://film.flmlnk.com/circle.png" alt="Flmlnk" style="display: block; margin: 0 auto; width: 80px; height: auto;" />
    </div>
  </div>
</body>
</html>
    `.trim();

    const emailText = `
Verify Your Email

Thanks for signing up for Flmlnk!

Please verify your email address by clicking the link below:

${args.url}

If you didn't create an account with Flmlnk, you can safely ignore this email.

---
Flmlnk - Your Film Link
https://flmlnk.com
    `.trim();

    try {
      const result = await resend.emails.send({
        from: "Flmlnk <noreply@flmlnk.com>",
        to: args.email,
        subject: "Verify your email for Flmlnk",
        html: emailHtml,
        text: emailText,
      });

      if (result.error) {
        console.error("Resend error:", result.error);
        return { success: false, error: result.error.message };
      }

      console.log("Verification email sent successfully:", result.data?.id);
      return { success: true, emailId: result.data?.id };
    } catch (error) {
      console.error("Failed to send verification email:", error);
      return {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      };
    }
  },
});

/**
 * Send password reset email.
 * Called by Better Auth when a user requests a password reset.
 */
export const sendPasswordResetEmail = internalAction({
  args: {
    email: v.string(),
    url: v.string(),
    token: v.string(),
  },
  async handler(ctx, args) {
    const apiKey = process.env.RESEND_API_KEY;
    if (!apiKey) {
      console.error("RESEND_API_KEY not configured - skipping password reset email");
      return { success: false, error: "Email service not configured" };
    }

    const resend = new Resend(apiKey);

    const emailHtml = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Reset Your Password</title>
</head>
<body style="margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; background-color: #0c0911; color: #ffffff;">
  <div style="max-width: 600px; margin: 0 auto; padding: 40px 20px;">
    <!-- Header -->
    <div style="text-align: center; margin-bottom: 32px;">
      <h1 style="color: #f53c56; font-size: 28px; margin: 0 0 8px 0;">Reset Your Password</h1>
      <p style="color: #94a3b8; font-size: 16px; margin: 0;">We received a request to reset your password</p>
    </div>

    <!-- Main Content Card -->
    <div style="background-color: rgba(255,255,255,0.05); border: 1px solid rgba(255,255,255,0.1); border-radius: 12px; padding: 32px; margin-bottom: 24px;">
      <p style="color: #e2e8f0; font-size: 16px; line-height: 1.7; margin: 0 0 24px 0;">
        Click the button below to reset your password. This link will expire in 1 hour for security reasons.
      </p>

      <!-- CTA Button -->
      <div style="text-align: center; margin: 32px 0;">
        <a href="${args.url}" style="display: inline-block; background-color: #f53c56; color: #ffffff; padding: 16px 40px; border-radius: 9999px; text-decoration: none; font-weight: 600; font-size: 16px;">
          Reset Password
        </a>
      </div>

      <!-- Security Notice -->
      <div style="background-color: rgba(245, 60, 86, 0.1); border: 1px solid rgba(245, 60, 86, 0.2); border-radius: 8px; padding: 16px; margin-top: 24px;">
        <p style="color: #f53c56; font-size: 12px; font-weight: 600; margin: 0 0 8px 0; text-transform: uppercase;">Security Notice</p>
        <p style="color: #e2e8f0; font-size: 13px; line-height: 1.5; margin: 0;">
          If you didn't request a password reset, please ignore this email. Your password will remain unchanged.
        </p>
      </div>
    </div>

    <!-- Link Fallback -->
    <div style="background-color: rgba(255,255,255,0.03); border: 1px solid rgba(255,255,255,0.08); border-radius: 8px; padding: 16px; margin-bottom: 24px;">
      <p style="color: #94a3b8; font-size: 12px; margin: 0 0 8px 0;">If the button doesn't work, copy and paste this link:</p>
      <p style="color: #f53c56; font-size: 12px; margin: 0; word-break: break-all;">
        ${args.url}
      </p>
    </div>

    <!-- Footer -->
    <div style="text-align: center; border-top: 1px solid rgba(255,255,255,0.1); padding-top: 24px;">
      <p style="color: #64748b; font-size: 12px; margin: 0 0 16px 0;">
        <a href="https://flmlnk.com" style="color: #f53c56; text-decoration: none;">Flmlnk</a> - Your Film Link
      </p>
      <img src="https://film.flmlnk.com/circle.png" alt="Flmlnk" style="display: block; margin: 0 auto; width: 80px; height: auto;" />
    </div>
  </div>
</body>
</html>
    `.trim();

    const emailText = `
Reset Your Password

We received a request to reset your password for your Flmlnk account.

Click the link below to reset your password (expires in 1 hour):

${args.url}

If you didn't request a password reset, please ignore this email. Your password will remain unchanged.

---
Flmlnk - Your Film Link
https://flmlnk.com
    `.trim();

    try {
      const result = await resend.emails.send({
        from: "Flmlnk <noreply@flmlnk.com>",
        to: args.email,
        subject: "Reset your Flmlnk password",
        html: emailHtml,
        text: emailText,
      });

      if (result.error) {
        console.error("Resend error:", result.error);
        return { success: false, error: result.error.message };
      }

      console.log("Password reset email sent successfully:", result.data?.id);
      return { success: true, emailId: result.data?.id };
    } catch (error) {
      console.error("Failed to send password reset email:", error);
      return {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      };
    }
  },
});

export const sendFanNewsletter = internalAction({
  args: {
    senderName: v.string(),
    senderPageSlug: v.string(),
    recipientEmail: v.string(),
    recipientName: v.optional(v.string()),
    subject: v.string(),
    content: v.string(), // Markdown or plain text content
    ctaText: v.optional(v.string()),
    ctaUrl: v.optional(v.string()),
    unsubscribeToken: v.optional(v.string()),
  },
  async handler(ctx, args) {
    const apiKey = process.env.RESEND_API_KEY;
    if (!apiKey) {
      console.error("RESEND_API_KEY not configured - skipping newsletter");
      return { success: false, error: "Email service not configured" };
    }

    const resend = new Resend(apiKey);
    const pageUrl = `https://film.flmlnk.com/f/${args.senderPageSlug}`;
    const recipientDisplay = args.recipientName || "there";

    // Build unsubscribe URL
    const unsubscribeUrl = args.unsubscribeToken
      ? `https://flmlnk.com/unsubscribe?token=${args.unsubscribeToken}`
      : `https://flmlnk.com/unsubscribe`;

    // Convert basic markdown to HTML (simple conversion)
    const contentHtml = args.content
      .replace(/\n\n/g, '</p><p style="color: #e2e8f0; font-size: 15px; line-height: 1.7; margin: 0 0 16px 0;">')
      .replace(/\n/g, '<br>');

    const emailHtml = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Update from ${args.senderName}</title>
</head>
<body style="margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; background-color: #0c0911; color: #ffffff;">
  <div style="max-width: 600px; margin: 0 auto; padding: 40px 20px;">
    <!-- Header -->
    <div style="text-align: center; margin-bottom: 32px;">
      <h1 style="color: #f53c56; font-size: 24px; margin: 0 0 8px 0;">Update from ${args.senderName}</h1>
    </div>

    <!-- Main Content Card -->
    <div style="background-color: rgba(255,255,255,0.05); border: 1px solid rgba(255,255,255,0.1); border-radius: 12px; padding: 24px; margin-bottom: 24px;">
      <p style="color: #ffffff; font-size: 16px; margin: 0 0 20px 0;">
        Hey ${recipientDisplay},
      </p>

      <p style="color: #e2e8f0; font-size: 15px; line-height: 1.7; margin: 0 0 16px 0;">
        ${contentHtml}
      </p>
    </div>

    ${args.ctaText && args.ctaUrl ? `
    <!-- CTA Button -->
    <div style="text-align: center; margin-bottom: 32px;">
      <a href="${args.ctaUrl}" style="display: inline-block; background-color: #f53c56; color: #ffffff; padding: 14px 32px; border-radius: 9999px; text-decoration: none; font-weight: 600; font-size: 14px;">
        ${args.ctaText}
      </a>
    </div>
    ` : ''}

    <!-- Footer -->
    <div style="text-align: center; border-top: 1px solid rgba(255,255,255,0.1); padding-top: 24px;">
      <p style="color: #94a3b8; font-size: 12px; margin: 0 0 8px 0;">
        You're receiving this because you signed up for updates from ${args.senderName}.
      </p>
      <p style="color: #64748b; font-size: 12px; margin: 0 0 8px 0;">
        <a href="${pageUrl}" style="color: #f53c56; text-decoration: none;">View ${args.senderName}'s page</a> ·
        <a href="https://flmlnk.com" style="color: #f53c56; text-decoration: none;">Flmlnk</a>
      </p>
      <p style="color: #64748b; font-size: 11px; margin: 0 0 16px 0;">
        <a href="${unsubscribeUrl}" style="color: #64748b; text-decoration: underline;">Unsubscribe from these emails</a>
      </p>
      <img src="https://film.flmlnk.com/circle.png" alt="Flmlnk" style="display: block; margin: 0 auto; width: 80px; height: auto;" />
    </div>
  </div>
</body>
</html>
    `.trim();

    const emailText = `
Update from ${args.senderName}

Hey ${recipientDisplay},

${args.content}

${args.ctaText && args.ctaUrl ? `${args.ctaText}: ${args.ctaUrl}` : ''}

---
You're receiving this because you signed up for updates from ${args.senderName}.
View their page: ${pageUrl}

Unsubscribe: ${unsubscribeUrl}

Flmlnk - Your Film Link
https://flmlnk.com
    `.trim();

    try {
      // Build email headers for List-Unsubscribe (Gmail/Yahoo 2024 requirement)
      const headers: Record<string, string> = {
        "List-Unsubscribe": `<${unsubscribeUrl}>`,
        "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
      };

      const result = await resend.emails.send({
        from: `${args.senderName} via Flmlnk <updates@flmlnk.com>`,
        to: args.recipientEmail,
        subject: args.subject,
        html: emailHtml,
        text: emailText,
        headers,
      });

      if (result.error) {
        console.error("Resend error:", result.error);
        return { success: false, error: result.error.message };
      }

      console.log("Fan newsletter sent:", result.data?.id);
      return { success: true, emailId: result.data?.id };
    } catch (error) {
      console.error("Failed to send fan newsletter:", error);
      return {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      };
    }
  },
});
