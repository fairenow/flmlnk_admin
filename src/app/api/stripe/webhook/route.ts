import { NextRequest, NextResponse } from "next/server";
import { ConvexHttpClient } from "convex/browser";
import { api } from "@convex/_generated/api";

export async function POST(req: NextRequest) {
  const stripeWebhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

  if (!stripeWebhookSecret) {
    console.error("Stripe webhook secret not configured");
    return NextResponse.json(
      { error: "Webhook not configured" },
      { status: 500 }
    );
  }

  const convexUrl = process.env.NEXT_PUBLIC_CONVEX_URL;
  if (!convexUrl) {
    console.error("Convex URL not configured");
    return NextResponse.json(
      { error: "Backend not configured" },
      { status: 500 }
    );
  }

  const body = await req.text();
  const signature = req.headers.get("stripe-signature");

  if (!signature) {
    return NextResponse.json(
      { error: "Missing stripe-signature header" },
      { status: 400 }
    );
  }

  // In production, you should verify the webhook signature using the Stripe SDK
  // For now, we'll do basic validation by checking the signature exists
  // TODO: Install stripe package and use stripe.webhooks.constructEvent()

  try {
    const event = JSON.parse(body);
    const convex = new ConvexHttpClient(convexUrl);

    switch (event.type) {
      case "checkout.session.completed": {
        const session = event.data.object;

        // Check if this is a boost campaign payment
        if (session.metadata?.type === "boost_campaign") {
          await convex.mutation(api.boost.handleBoostPaymentSuccess, {
            checkoutSessionId: session.id,
            paymentIntentId: session.payment_intent || undefined,
          });

          console.log("Boost payment success processed:", session.id);
        }
        break;
      }

      case "checkout.session.expired":
      case "checkout.session.async_payment_failed": {
        const session = event.data.object;

        if (session.metadata?.type === "boost_campaign") {
          await convex.mutation(api.boost.handleBoostPaymentFailed, {
            checkoutSessionId: session.id,
          });

          console.log("Boost payment failed/expired:", session.id);
        }
        break;
      }

      default:
        console.log(`Unhandled event type: ${event.type}`);
    }

    return NextResponse.json({ received: true });
  } catch (error) {
    console.error("Webhook error:", error);
    return NextResponse.json(
      { error: "Webhook handler failed" },
      { status: 500 }
    );
  }
}
