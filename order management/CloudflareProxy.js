/**
 * CLOUDFLARE WORKER PROXY FOR PATHAO WEBHOOK
 */

export default {
  async fetch(request, env) {
    // 1. REPLACE THIS with your actual Google Apps Script Web App URL
    const GAS_WEBHOOK_URL = "https://script.google.com/macros/s/AKfycb.../exec"; 
    // Set WEBHOOK_SECRET as a Worker secret: `wrangler secret put WEBHOOK_SECRET`
    const SECRET = env.WEBHOOK_SECRET;

    try {
      const bodyText = request.method === 'POST' ? await request.text() : null;

      // Forward request to Google
      const response = await fetch(GAS_WEBHOOK_URL, {
        method: request.method,
        headers: { "Content-Type": "application/json" },
        body: bodyText,
      });

      const body = await response.text();
      
      // DYNAMIC STATUS CODE: Pathao needs 202, Steadfast needs 200
      let responseStatus = 200;
      if (bodyText && bodyText.includes('"event":')) {
        responseStatus = 202; // Detected Pathao
      }

      // Return EXACT requirements to Pathao/Steadfast
      return new Response(body, {
        status: responseStatus, 
        headers: {
          "Content-Type": "application/json",
          "X-Pathao-Merchant-Webhook-Integration-Secret": SECRET,
          "Asteera-Pathao-Merchant-Webhook-Integration-Secret": SECRET
        }
      });

    } catch (e) {
      return new Response(JSON.stringify({ error: e.message }), { 
        status: 202, 
        headers: { 
          "Content-Type": "application/json",
          "X-Pathao-Merchant-Webhook-Integration-Secret": SECRET 
        }
      });
    }
  }
};
