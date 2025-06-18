// index.js
const express = require('express');
const axios = require('axios');
const app = express();

const DISCORD_WEBHOOK_URL = process.env.DISCORD_WEBHOOK_URL;
if (!DISCORD_WEBHOOK_URL) {
  console.error('Error: DISCORD_WEBHOOK_URL environment variable not set.');
  process.exit(1);
}

app.use(express.json());

// In-memory cache for customer names keyed by repair order number
const customerCache = {};

app.post('/tekmetric-webhook', async (req, res) => {
  const payload = req.body;
  const event = payload.event || '';
  const data = payload.data || {};

  // Extract repair order number safely
  const roNumber = data.repairOrderNumber || null;

  // Try to get customer name from payload
  let customerName = 'Unknown Customer';
  if (data.customer?.firstName && data.customer?.lastName) {
    customerName = `${data.customer.firstName} ${data.customer.lastName}`;
    if (roNumber) customerCache[roNumber] = customerName; // cache it
  } else if (roNumber && customerCache[roNumber]) {
    customerName = customerCache[roNumber]; // fallback from cache
  } else {
    // fallback: try to extract from event string
    const match = event.match(/^([A-Z][a-z]+\s[A-Z][a-z]+)/);
    if (match && match[1]) {
      customerName = match[1];
      if (roNumber) customerCache[roNumber] = customerName;
    }
  }

  let message = null;

  try {
    if (event.toLowerCase().includes('estimate') && event.toLowerCase().includes('viewed')) {
      message = `🧐 **Estimate Viewed**\n${customerName} viewed estimate for RO #${roNumber}`;
    } else if (event.toLowerCase().includes('approved') && event.toLowerCase().includes('declined')) {
      const approvedCount = data.jobs?.filter(job => job.authorized === true).length || 0;
      const declinedCount = data.jobs?.filter(job => job.authorized === false).length || 0;
      message = `🔧 **Work Authorization**\n${customerName} approved ${approvedCount} job(s) and declined ${declinedCount} job(s) for RO #${roNumber}`;
    } else if (data.repairOrderStatus?.name?.toLowerCase() === 'complete') {
      message = `🎉 **RO Completed**\nRO #${roNumber} for ${customerName} is marked as completed.`;
    } else if (data.amountPaid && data.amountPaid > 0 && data.amountPaid === data.totalSales) {
      const total = (data.amountPaid / 100).toFixed(2);
      message = `💳 **Payment Received**\nRO #${roNumber} for ${customerName} has been paid in full.\nTotal: $${total}`;
    } else if (event.toLowerCase().includes('inspection') && event.toLowerCase().includes('complete')) {
      message = `🔍 **Inspection Complete**\n${data.name || 'Inspection'} completed for RO #${roNumber || 'Unknown'} for ${customerName}`;
    } else if (event.toLowerCase().includes('purchase order') && event.toLowerCase().includes('received')) {
      const poMatch = event.match(/Purchase Order #(\d+)/);
      const poNumber = poMatch ? poMatch[1] : 'Unknown';
      message = `📦 **Part Received**\nPurchase Order #${poNumber} marked as received.`;
    } else if (event.toLowerCase().includes('payment made')) {
      const payer = data.payerName || customerName;
      const amount = data.amount ? (data.amount / 100).toFixed(2) : 'Unknown';
      message = `💵 **Payment Made**\n${payer} paid $${amount}${roNumber ? ` for RO #${roNumber}` : ''}`;
    }

    if (message) {
      await axios.post(DISCORD_WEBHOOK_URL, { content: message });
      res.status(200).send('Notification sent to Discord');
    } else {
      res.status(200).send('No matching event handled');
    }
  } catch (err) {
    console.error('Webhook processing error:', err);
    res.status(500).send('Error handling webhook');
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`🚀 Tekmetric webhook listener running on port ${PORT}`));
