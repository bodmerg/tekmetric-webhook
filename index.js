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

// Cache: key = repairOrderNumber (friendly ticket #), value = customerName
const roCustomerCache = {};

app.post('/tekmetric-webhook', async (req, res) => {
  const payload = req.body;
  const event = payload.event || '';
  const data = payload.data || {};

  // Try to get repairOrderNumber (friendly number) for caching and messaging
  const repairOrderNumber = data.repairOrderNumber || null;

  // Cache customer name when available, keyed by repairOrderNumber
  if (repairOrderNumber && data.customer?.firstName && data.customer?.lastName) {
    roCustomerCache[repairOrderNumber] = `${data.customer.firstName} ${data.customer.lastName}`;
  }

  // Get customer name from cache by repairOrderNumber or fallback methods
  let customerName = 'Unknown Customer';
  if (repairOrderNumber && roCustomerCache[repairOrderNumber]) {
    customerName = roCustomerCache[repairOrderNumber];
  } else if (data.customer?.firstName && data.customer?.lastName) {
    customerName = `${data.customer.firstName} ${data.customer.lastName}`;
  } else {
    const match = event.match(/^([A-Z][a-z]+\s[A-Z][a-z]+)\s(viewed|approved|declined|marked|paid|completed|made)/i);
    if (match && match[1]) {
      customerName = match[1];
    }
  }

  let message = null;

  try {
    // Estimate Viewed
    if (event.toLowerCase().includes('estimate') && event.toLowerCase().includes('viewed')) {
      message = `🧐 **Estimate Viewed**\n${customerName} viewed estimate for RO #${repairOrderNumber || 'Unknown'}`;
    }

    // Work Approved / Declined (based on jobs array)
    else if (event.toLowerCase().includes('approved') && event.toLowerCase().includes('declined')) {
      const approvedCount = data.jobs?.filter(job => job.authorized === true).length || 0;
      const declinedCount = data.jobs?.filter(job => job.authorized === false).length || 0;
      message = `🔧 **Work Authorization**\n${customerName} approved ${approvedCount} job(s) and declined ${declinedCount} job(s) for RO #${repairOrderNumber || 'Unknown'}`;
    }

    // Repair Order Completed
    else if (data.repairOrderStatus?.name?.toLowerCase() === 'complete' || data.repairOrderStatus?.name?.toLowerCase() === 'completed') {
      message = `🎉 **RO Completed**\nRO #${repairOrderNumber || 'Unknown'} for ${customerName} is marked as completed.`;
    }

    // Payment Received (fully paid)
    else if (data.amountPaid && data.amountPaid > 0 && data.totalSales && data.amountPaid === data.totalSales) {
      const total = (data.amountPaid / 100).toFixed(2);
      message = `💳 **Payment Received**\nRO #${repairOrderNumber || 'Unknown'} for ${customerName} has been paid in full.\nTotal: $${total}`;
    }

    // Payment Made (partial or any payment event)
    else if (event.toLowerCase().includes('payment made')) {
      // Try to get repairOrderNumber from cache via data.repairOrderId if possible
      // We do not have direct mapping here, so use repairOrderNumber cached or Unknown
      const amount = data.amount ? (data.amount / 100).toFixed(2) : 'Unknown';
      const payer = data.payerName || customerName;
      message = `💵 **Payment Made**\n${payer} paid $${amount} for RO #${repairOrderNumber || 'Unknown'}`;
    }

    // Inspection Completed
    else if (event.toLowerCase().includes('inspection') && event.toLowerCase().includes('complete')) {
      message = `🔍 **Inspection Complete**\n${data.name || 'Inspection'} completed for RO #${repairOrderNumber || 'Unknown'} for ${customerName}`;
    }

    // Part Received
    else if (event.toLowerCase().includes('purchase order') && event.toLowerCase().includes('received')) {
      const poMatch = event.match(/Purchase Order #(\d+)/);
      const poNumber = poMatch ? poMatch[1] : 'Unknown';
      message = `📦 **Part Received**\nPurchase Order #${poNumber} marked as received.`;
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
